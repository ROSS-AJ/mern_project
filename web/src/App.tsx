import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ConfirmHost } from './ui/shared/ConfirmDialog.tsx';
import { EditorContext } from './ui/shared/context.ts';
import type { CloudState, DetectionProgress, Editor } from './ui/shared/context.ts';
import { DesignSwitcher } from './ui/DesignSwitcher.tsx';
import { DESIGNS, initialDesign, saveDesign, showSwitcher } from './ui/index.ts';
import type { DesignName } from './ui/index.ts';
import { initialState, reducer } from './model/reducer.ts';
import type { EditAction } from './model/reducer.ts';
import { confirmDialog } from './ui/shared/ConfirmDialog.tsx';
import { createCloudProject, fetchCloudProject, authToken, saveCloudLayout, SignedOutError } from './model/cloud.ts';
import { looksLikePartwiseFile, partwiseFileName, readPartwiseFile, writePartwiseFile } from './model/partwiseFile.ts';
import { loadLastProject, saveProject, startNewProject } from './model/storage.ts';
import type { ProjectDoc, Step } from './model/types.ts';
import { emptyPage, uid } from './model/types.ts';
import { analyzePage } from './pdf/analyze.ts';
import { downloadBytes } from './pdf/exportParts.ts';
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

  /** Shows a project and makes it the one this browser keeps. `project` may be built from the page count. */
  const openProject = useCallback(async (source: ProjectDoc | ((pageCount: number) => ProjectDoc), bytes: Uint8Array) => {
    const loaded = await loadPdf(bytes);
    const project = typeof source === 'function' ? source(loaded.numPages) : source;
    // Only one project is kept in the browser; this replaces the last one.
    await startNewProject(project, bytes);
    setPdfBytes(bytes);
    setPdf(loaded);
    dispatch({ type: 'load', doc: project });
  }, []);

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

  /** A PDF starts a new project; a .partwise file reopens a saved one. */
  const createProject = useCallback(
    async (file: File) => {
      setOpenError(null);
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (looksLikePartwiseFile(file.name, bytes)) {
        try {
          const saved = readPartwiseFile(bytes);
          await openProject(saved.doc, saved.pdf);
        } catch (error) {
          setOpenError(`Couldn't open that project: ${(error as Error).message}`);
        }
        return;
      }
      try {
        await openProject((pageCount) => newProject(file.name, file.name.replace(/\.pdf$/i, ''), pageCount), bytes);
      } catch (error) {
        setOpenError(`Couldn't open that PDF: ${(error as Error).message}`);
      }
    },
    [openProject],
  );

  // Opened from the dashboard: /editor/?project=<id>
  const [openingCloud, setOpeningCloud] = useState(() => new URLSearchParams(window.location.search).get('project'));
  useEffect(() => {
    if (!openingCloud) return;
    (async () => {
      try {
        const { project, pdf: bytes } = await fetchCloudProject(openingCloud);
        const saved = project.pageLayout;
        await openProject(
          (pageCount) => ({
            // Uploaded as a bare PDF on the dashboard: this is its first time in the editor.
            ...(saved ?? newProject(project.originalName || `${project.title}.pdf`, project.title, pageCount)),
            cloudId: project._id,
          }),
          bytes,
        );
      } catch (error) {
        setOpenError(`Couldn't open that project: ${(error as Error).message}`);
      } finally {
        // The project now lives in this browser too; drop the id so a reload doesn't fetch it again.
        const url = new URL(window.location.href);
        url.searchParams.delete('project');
        window.history.replaceState(null, '', url);
        setOpeningCloud(null);
      }
    })();
    // Runs once, for the id in the address when the page opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const closeProject = useCallback(() => {
    if (doc) void saveProject(doc);
    if (doc?.cloudId) void saveCloudLayout(doc.cloudId, doc).catch(() => undefined);
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

  // The copy in the user's projects follows a little behind the local one.
  const [cloud, setCloud] = useState<CloudState>('local');
  useEffect(() => {
    if (!doc) return;
    const cloudId = doc.cloudId;
    if (!cloudId) {
      setCloud('local');
      return;
    }
    setCloud('saving');
    const timer = setTimeout(() => {
      saveCloudLayout(cloudId, doc).then(
        () => setCloud('saved'),
        (error) => setCloud(error instanceof SignedOutError ? 'signed-out' : 'error'),
      );
    }, 1500);
    return () => clearTimeout(timer);
  }, [doc]);

  const [signedIn] = useState(() => authToken() !== null);

  const downloadProject = useCallback(() => {
    if (!doc || !pdfBytes) return;
    downloadBytes(writePartwiseFile(doc, pdfBytes), partwiseFileName(doc), 'application/octet-stream');
  }, [doc, pdfBytes]);

  const saveToAccount = useCallback(async () => {
    if (!doc || !pdfBytes || doc.cloudId) return;
    setCloud('saving');
    try {
      const cloudId = await createCloudProject(doc, pdfBytes);
      dispatch({ type: 'setCloudId', cloudId });
    } catch (error) {
      setCloud('local');
      await confirmDialog({
        title: "Couldn't save to your projects",
        message: `${(error as Error).message} It's still saved in this browser.`,
        confirmLabel: 'OK',
        cancelLabel: null,
      });
    }
  }, [doc, pdfBytes]);

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
            cloud,
            signedIn,
            downloadProject,
            saveToAccount,
          }
        : null,
    [doc, pdf, pdfBytes, edit, setStep, undo, redo, state.past.length, state.future.length, detection, redetectPage, cloud, signedIn, downloadProject, saveToAccount],
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
      ) : openingCloud ? (
        <p className="opening-project" style={{ padding: 32, fontFamily: 'inherit' }}>Opening your project…</p>
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

function newProject(fileName: string, title: string, pageCount: number): ProjectDoc {
  const now = Date.now();
  return {
    id: uid(),
    title,
    fileName,
    pageCount,
    createdAt: now,
    updatedAt: now,
    step: 'setup',
    parts: [],
    pages: Array.from({ length: pageCount }, emptyPage),
    regions: [],
    dismissedIssues: [],
  };
}
