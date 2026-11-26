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
import {
  authToken,
  createCloudProject,
  fetchCloudLayout,
  fetchCloudProject,
  newerCopy,
  NotInProjectsError,
  refreshSignIn,
  saveCloudLayout,
  SignedOutError,
  TooBigError,
} from './model/cloud.ts';
import { looksLikePartwiseFile, partwiseFileName, readPartwiseFile, writePartwiseFile } from './model/partwiseFile.ts';
import { loadLastProject, peekLastProject, saveProject, startNewProject } from './model/storage.ts';
import type { ProjectDoc, Step } from './model/types.ts';
import { newProject } from './model/types.ts';
import { returnTo, setReturnTo } from './model/returnTo.ts';
import { DASHBOARD_URL } from './site.ts';
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
      const doc = await newestVersion(saved.doc);
      if (doc !== saved.doc) await saveProject(doc);
      const loaded = await loadPdf(saved.bytes);
      setPdfBytes(saved.bytes);
      setPdf(loaded);
      dispatch({ type: 'load', doc });
    } catch (error) {
      setOpenError((error as Error).message);
    }
  }, []);

  // Back from signing in again (/editor/?continue): carry on where they were.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('continue')) return;
    if (url.searchParams.get('from') === 'dashboard') setReturnTo('dashboard');
    url.searchParams.delete('continue');
    url.searchParams.delete('from');
    window.history.replaceState(null, '', url);
    void continueProject();
    // Runs once, for the address the page opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    setReturnTo('dashboard');
    (async () => {
      try {
        const { project, pdf: bytes } = await fetchCloudProject(openingCloud);
        // This browser may hold newer work on the same project (made while signed out); keep that.
        const local = await peekLastProject().catch(() => undefined);
        const saved =
          local?.cloudId === project._id && newerCopy(local, project.pageLayout) === 'local' ? local : project.pageLayout;
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

  /** Back: to the dashboard if the project came from there, else this app's home screen. */
  const closeProject = useCallback(async () => {
    const pending = doc?.cloudId ? unsaved.current : null;
    unsaved.current = null;
    if (returnTo() === 'dashboard') {
      // Leaving the page: finish saving first, so the dashboard shows the latest.
      await Promise.all([
        doc ? saveProject(doc).catch(() => undefined) : undefined,
        pending?.cloudId ? saveCloudLayout(pending.cloudId, pending, true).catch(() => undefined) : undefined,
      ]);
      window.location.href = DASHBOARD_URL;
      return;
    }
    if (doc) void saveProject(doc);
    if (pending?.cloudId) void saveCloudLayout(pending.cloudId, pending).catch(() => undefined);
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

  // ---------- sign-in ----------

  // The site keeps the sign-in in localStorage. Follow it, so signing in again
  // in another tab picks up saving where it stopped.
  const [token, setToken] = useState(authToken);
  const signedIn = token !== null;
  useEffect(() => {
    const check = () => setToken(authToken());
    // Refresh while the editor is open, so working for hours never signs anyone out.
    const refresh = () => void refreshSignIn().then(check);
    refresh();
    const timer = setInterval(refresh, 5 * 60 * 1000);
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    window.addEventListener('storage', check);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      window.removeEventListener('storage', check);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  // ---------- the copy in the user's projects ----------

  // It follows a little behind the local one.
  const [cloud, setCloud] = useState<CloudState>('local');
  const [cloudSavedAt, setCloudSavedAt] = useState<number | null>(null);
  const [retry, setRetry] = useState(0);
  // The project (by id) found too big for the user's projects, if any.
  const [tooBigFor, setTooBigFor] = useState<string | null>(null);
  // The layout still on its way to the server, if any (sent at once if the tab closes).
  const unsaved = useRef<ProjectDoc | null>(null);

  const saveNow = useCallback((pending: ProjectDoc, keepalive = false) => {
    const cloudId = pending.cloudId;
    if (!cloudId) return;
    setCloud('saving');
    saveCloudLayout(cloudId, pending, keepalive).then(
      () => {
        if (unsaved.current === pending) unsaved.current = null;
        setCloudSavedAt(Date.now());
        setCloud('saved');
      },
      (error) => {
        if (error instanceof NotInProjectsError) {
          // Deleted on the dashboard (or another account signed in): it's only in this browser now.
          unsaved.current = null;
          dispatch({ type: 'setCloudId', cloudId: undefined });
          setCloud('local');
        } else if (error instanceof SignedOutError) {
          setToken(authToken());
          setCloud('signed-out');
        } else {
          setCloud('error');
          // Probably offline: try again shortly.
          setTimeout(() => setRetry((n) => n + 1), 10_000);
        }
      },
    );
  }, []);

  useEffect(() => {
    if (!doc?.cloudId) {
      unsaved.current = null;
      setCloud(doc && doc.id === tooBigFor ? 'too-big' : 'local');
      setCloudSavedAt(null);
      return;
    }
    unsaved.current = doc;
    if (!token) {
      setCloud('signed-out');
      return;
    }
    setCloud('saving');
    const timer = setTimeout(() => saveNow(doc), 1500);
    return () => clearTimeout(timer);
    // `token` and `retry` are here to save again after signing in or a failed save.
  }, [doc, token, retry, saveNow, tooBigFor]);

  // Closing the tab: send what's waiting straight away, and warn if it might not make it.
  useEffect(() => {
    const flush = () => {
      if (unsaved.current && authToken()) saveNow(unsaved.current, true);
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!unsaved.current && saveState !== 'saving') return;
      flush();
      event.preventDefault();
      // Older browsers need returnValue set to show the warning.
      event.returnValue = '';
    };
    const onHidden = () => document.visibilityState === 'hidden' && flush();
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('visibilitychange', onHidden);
    };
  }, [saveNow, saveState]);

  // Coming back to the tab: pick up changes made meanwhile in another browser,
  // as long as nothing here is waiting to be saved.
  const docForCheck = useRef(doc);
  docForCheck.current = doc;
  useEffect(() => {
    const onVisible = async () => {
      const current = docForCheck.current;
      if (document.visibilityState !== 'visible' || !current?.cloudId || unsaved.current || !authToken()) return;
      try {
        const { pageLayout } = await fetchCloudLayout(current.cloudId);
        const latest = docForCheck.current;
        if (!pageLayout || latest !== current || unsaved.current || newerCopy(current, pageLayout) === 'local') return;
        const updated = { ...pageLayout, cloudId: current.cloudId };
        await saveProject(updated);
        dispatch({ type: 'load', doc: updated });
      } catch {
        // Offline or signed out: the save note already says so.
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  const downloadProject = useCallback(() => {
    if (!doc || !pdfBytes) return;
    downloadBytes(writePartwiseFile(doc, pdfBytes), partwiseFileName(doc), 'application/octet-stream');
  }, [doc, pdfBytes]);

  const saveToAccount = useCallback(async () => {
    if (!doc || !pdfBytes || doc.cloudId) return;
    setCloud('saving');
    try {
      const cloudId = await createCloudProject(doc, pdfBytes);
      setCloudSavedAt(Date.now());
      dispatch({ type: 'setCloudId', cloudId });
    } catch (error) {
      if (error instanceof TooBigError) {
        setTooBigFor(doc.id);
        setCloud('too-big');
        await confirmDialog({ title: 'Too big for your projects', message: error.message, confirmLabel: 'OK', cancelLabel: null });
        return;
      }
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
            cloudSavedAt,
            signedIn,
            downloadProject,
            saveToAccount,
          }
        : null,
    [doc, pdf, pdfBytes, edit, setStep, undo, redo, state.past.length, state.future.length, detection, redetectPage, cloud, cloudSavedAt, signedIn, downloadProject, saveToAccount],
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
          <ProjectShell
            onClose={() => void closeProject()}
            backLabel={returnTo() === 'dashboard' ? 'Back to your projects' : 'Back to home'}
            saveState={saveState}
          />
        </EditorContext.Provider>
      ) : openingCloud ? (
        <p className="opening-project" style={{ padding: 32, fontFamily: 'inherit' }}>Opening your project…</p>
      ) : (
        <Home
          onContinue={() => {
            setReturnTo('home');
            void continueProject();
          }}
          onCreate={(file) => {
            setReturnTo('home');
            void createProject(file);
          }}
          error={openError}
        />
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

/**
 * The project as last saved anywhere: this browser's copy, or the one in the
 * user's projects if that was edited later (in another browser, say).
 */
async function newestVersion(local: ProjectDoc): Promise<ProjectDoc> {
  if (!local.cloudId || !authToken()) return local;
  try {
    const { pageLayout } = await fetchCloudLayout(local.cloudId);
    return newerCopy(local, pageLayout) === 'saved' && pageLayout ? { ...pageLayout, cloudId: local.cloudId } : local;
  } catch (error) {
    // Deleted on the dashboard: carry on with it as a browser-only project.
    if (error instanceof NotInProjectsError) return { ...local, cloudId: undefined };
    // Offline or signed out: this browser's copy is the best there is.
    return local;
  }
}
