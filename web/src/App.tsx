import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ConfirmHost } from './ui/shared/ConfirmDialog.tsx';
import { EditorContext } from './ui/shared/context.ts';
import type { DetectionProgress, Editor } from './ui/shared/context.ts';
import { DesignSwitcher } from './ui/DesignSwitcher.tsx';
import { DESIGNS, initialDesign, saveDesign, showSwitcher } from './ui/index.ts';
import type { DesignName } from './ui/index.ts';
import { initialState, reducer } from './model/reducer.ts';
import type { EditAction } from './model/reducer.ts';
import { loadLastProject, saveProject, startNewProject } from './model/storage.ts';
import type { ProjectDoc, Step } from './model/types.ts';
import { emptyPage, uid } from './model/types.ts';
import { analyzePage } from './pdf/analyze.ts';
import { closePdf, loadPdf } from './pdf/render.ts';
import type { PdfDocument } from './pdf/render.ts';

export type SaveState = 'saved' | 'saving' | 'error';

export function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [pdf, setPdf] = useState<PdfDocument | null>(null);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [openError, setOpenError] = useState<string | null>(null);
  const doc = state.doc;

  // ---------- opening and closing ----------

  const continueProject = useCallback(async () => {
    setOpenError(null);
    try {
      const saved = await loadLastProject();
      if (!saved) throw new Error('The saved project or its PDF is missing. Open the PDF again to start over.');
      const loaded = await loadPdf(saved.bytes);
      setPdfBytes(saved.bytes);
      setPdf(loaded);
      dispatch({ type: 'load', doc: saved.doc });
    } catch (error) {
      setOpenError((error as Error).message);
    }
  }, []);

  const createProject = useCallback(async (file: File) => {
    setOpenError(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const loaded = await loadPdf(bytes);
      const now = Date.now();
      const project: ProjectDoc = {
        id: uid(),
        title: file.name.replace(/\.pdf$/i, ''),
        fileName: file.name,
        pageCount: loaded.numPages,
        createdAt: now,
        updatedAt: now,
        step: 'setup',
        parts: [],
        pages: Array.from({ length: loaded.numPages }, emptyPage),
        regions: [],
        dismissedIssues: [],
      };
      // Only one project is kept in the browser; this replaces the last one.
      await startNewProject(project, bytes);
      setPdfBytes(bytes);
      setPdf(loaded);
      dispatch({ type: 'load', doc: project });
    } catch (error) {
      setOpenError(`Couldn't open that PDF: ${(error as Error).message}`);
    }
  }, []);

  const closeProject = useCallback(() => {
    if (doc) void saveProject(doc);
    dispatch({ type: 'close' });
    closePdf(pdf);
    setPdf(null);
    setPdfBytes(null);
  }, [doc, pdf]);

  // ---------- autosave ----------

  useEffect(() => {
    if (!doc) return;
    setSaveState('saving');
    const timer = setTimeout(() => {
      saveProject(doc).then(
        () => setSaveState('saved'),
        () => setSaveState('error'),
      );
    }, 400);
    return () => clearTimeout(timer);
  }, [doc]);

  // ---------- detection (runs in the background, page by page) ----------

  const [detection, setDetection] = useState<DetectionProgress>({ done: 0, total: 0, running: false, error: null });
  const docRef = useRef(doc);
  docRef.current = doc;
  const projectId = doc?.id;

  useEffect(() => {
    if (!pdf || !projectId) return;
    const controller = new AbortController();

    (async () => {
      const current = docRef.current;
      if (!current) return;
      const total = current.pages.length;
      const pending = current.pages.map((page, index) => (page.detected ? -1 : index)).filter((index) => index >= 0);
      setDetection({ done: total - pending.length, total, running: pending.length > 0, error: null });

      for (const index of pending) {
        // Let the UI breathe between pages; detection itself is synchronous.
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (controller.signal.aborted) return;
        try {
          const result = await analyzePage(pdf, index, controller.signal);
          if (!result || controller.signal.aborted) return;
          dispatch({ type: 'pageDetected', index, page: result.page, suggestions: result.suggestions });
          setDetection((d) => ({ ...d, done: d.done + 1 }));
        } catch (error) {
          if (controller.signal.aborted) return;
          setDetection((d) => ({ ...d, error: `Page ${index + 1}: ${(error as Error).message}` }));
        }
      }
      setDetection((d) => ({ ...d, running: false }));
    })();

    return () => controller.abort();
  }, [pdf, projectId]);

  const redetectPage = useCallback(
    async (index: number) => {
      if (!pdf) return;
      setDetection((d) => ({ ...d, running: true }));
      try {
        const result = await analyzePage(pdf, index);
        if (result) dispatch({ type: 'pageDetected', index, page: result.page, suggestions: result.suggestions });
      } finally {
        setDetection((d) => ({ ...d, running: false }));
      }
    },
    [pdf],
  );

  // ---------- editor API ----------

  const edit = useCallback((action: EditAction, coalesce?: string) => dispatch({ type: 'edit', edit: action, coalesce }), []);
  const setStep = useCallback((step: Step) => dispatch({ type: 'setStep', step }), []);
  const undo = useCallback(() => dispatch({ type: 'undo' }), []);
  const redo = useCallback(() => dispatch({ type: 'redo' }), []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const target = event.target;
      if (target instanceof Element && target.matches('input, textarea')) return;
      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault();
        undo();
      } else if ((key === 'z' && event.shiftKey) || key === 'y') {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  const editor = useMemo<Editor | null>(
    () =>
      doc && pdf && pdfBytes
        ? {
            doc,
            pdf,
            pdfBytes,
            edit,
            setStep,
            undo,
            redo,
            canUndo: state.past.length > 0,
            canRedo: state.future.length > 0,
            detection,
            redetectPage,
          }
        : null,
    [doc, pdf, pdfBytes, edit, setStep, undo, redo, state.past.length, state.future.length, detection, redetectPage],
  );

  // ---------- design (Edition or Classic) ----------

  const [designName, setDesignName] = useState<DesignName>(initialDesign);
  const design = DESIGNS[designName];
  useLayoutEffect(() => {
    let style = document.getElementById('partwise-design') as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement('style');
      style.id = 'partwise-design';
      document.head.append(style);
    }
    style.textContent = design.css;
  }, [design]);
  const { Home, ProjectShell } = design;

  return (
    <>
      {editor ? (
        <EditorContext.Provider value={editor}>
          <ProjectShell onClose={closeProject} saveState={saveState} />
        </EditorContext.Provider>
      ) : (
        <Home onContinue={continueProject} onCreate={createProject} error={openError} />
      )}
      <ConfirmHost />
      {showSwitcher() && (
        <DesignSwitcher
          current={designName}
          onChange={(name) => {
            saveDesign(name);
            setDesignName(name);
          }}
        />
      )}
    </>
  );
}
