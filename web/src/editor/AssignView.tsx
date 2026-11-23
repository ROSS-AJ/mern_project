import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { findIssues } from '../engine/issues.ts';
import type { Id } from '../model/types.ts';
import { allSystems } from '../model/types.ts';
import { useEditor } from './context.ts';
import { Icon } from './Icon.tsx';
import { Inspector } from './Inspector.tsx';
import { GUTTER, PageView } from './PageView.tsx';
import { PageRail } from './PageRail.tsx';
import { PartPicker } from './PartPicker.tsx';
import type { Selection, Tool } from './selection.ts';
import { emptySelection, findReview, pageStaffs } from './selection.ts';
import { useZoom } from './useZoom.ts';

export function AssignView() {
  const { doc, edit, setStep } = useEditor();
  const [pageIndex, setPageIndex] = useState(() => {
    const first = allSystems(doc).find(({ system }) => system.status === 'review');
    return first?.page ?? 0;
  });
  const [selection, setSelection] = useState<Selection>(emptySelection);
  const [tool, setTool] = useState<Tool>('select');
  // A one-off message shown in the tool hint bar for a few seconds.
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [notice]);
  const [picker, setPicker] = useState<{ systemId: Id; staffId: Id; anchor: DOMRect } | null>(null);
  const [scrollTo, setScrollTo] = useState<Id | null>(null);

  const page = doc.pages[pageIndex];
  const issues = useMemo(() => findIssues(doc), [doc]);
  const reviewCount = useMemo(() => allSystems(doc).filter(({ system }) => system.status === 'review').length, [doc]);
  const banner = issues.find((issue) => issue.kind === 'part-count' || issue.kind === 'no-parts');

  // ---------- page width ----------
  const scroller = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(800);
  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setAvailable(element.clientWidth));
    observer.observe(element);
    setAvailable(element.clientWidth);
    return () => observer.disconnect();
  }, []);
  const fitWidth = Math.max(320, available - GUTTER - 48);
  const zoom = useZoom(scroller, '.page-wrap', fitWidth);
  const pageWidth = zoom.pageWidth;

  // ---------- navigation ----------
  const goToPage = useCallback(
    (index: number) => {
      const next = Math.min(doc.pages.length - 1, Math.max(0, index));
      if (next === pageIndex) return;
      setPageIndex(next);
      setSelection(emptySelection);
      setPicker(null);
      scroller.current?.scrollTo({ top: 0 });
    },
    [doc.pages.length, pageIndex],
  );

  const goToReview = useCallback(
    (direction: 1 | -1 = 1) => {
      const found = findReview(doc, pageIndex, selection.systemIds[0] ?? null, direction);
      if (!found) return;
      setPageIndex(found.page);
      setSelection({ systemIds: [found.system.id], staffId: found.system.staffs[0]?.id ?? null, regionId: null });
      setPicker(null);
      setScrollTo(found.system.id);
    },
    [doc, pageIndex, selection.systemIds],
  );

  useEffect(() => {
    if (!scrollTo) return;
    const frame = requestAnimationFrame(() => {
      document.getElementById(`sys-${scrollTo}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      setScrollTo(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [scrollTo, pageIndex]);

  // ---------- selection helpers ----------
  const selectStaff = useCallback(
    (systemId: Id, staffId: Id, additive: boolean) => {
      setSelection((current) => ({
        systemIds: additive ? [...new Set([...current.systemIds, systemId])] : [systemId],
        staffId,
        regionId: null,
      }));
    },
    [],
  );

  const staffs = useMemo(() => (page ? pageStaffs(page) : []), [page]);

  const moveStaffSelection = (delta: number) => {
    const index = staffs.findIndex((entry) => entry.staff.id === selection.staffId);
    const next = staffs[index === -1 ? (delta > 0 ? 0 : staffs.length - 1) : index + delta];
    if (next) selectStaff(next.system.id, next.staff.id, false);
  };

  const assignSelected = (partId: Id | null) => {
    const index = staffs.findIndex((entry) => entry.staff.id === selection.staffId);
    const entry = staffs[index];
    if (!entry) return;
    edit({ type: 'assignStaff', page: pageIndex, systemId: entry.system.id, staffId: entry.staff.id, partId });
    // Move on to the next staff after the ones just assigned, to keep going quickly.
    const part = doc.parts.find((p) => p.id === partId);
    const step = Math.min(part?.staffCount ?? 1, entry.system.staffs.length - entry.index);
    const next = staffs[index + step];
    if (next) selectStaff(next.system.id, next.staff.id, false);
  };

  // ---------- keyboard ----------
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if ((target instanceof Element && target.matches('input, textarea, select')) || event.ctrlKey || event.metaKey || event.altKey) return;
      if (picker) return; // the picker handles its own keys

      const key = event.key;
      if (/^[0-9]$/.test(key) && selection.staffId) {
        event.preventDefault();
        const number = Number(key);
        assignSelected(number === 0 ? null : doc.parts[number - 1]?.id ?? null);
      } else if (key === 'ArrowDown' || key === 'ArrowUp') {
        event.preventDefault();
        moveStaffSelection(key === 'ArrowDown' ? 1 : -1);
      } else if (key === 'ArrowRight' || key === 'PageDown') {
        event.preventDefault();
        goToPage(pageIndex + 1);
      } else if (key === 'ArrowLeft' || key === 'PageUp') {
        event.preventDefault();
        goToPage(pageIndex - 1);
      } else if (key === 'Enter' && selection.systemIds.length > 0) {
        event.preventDefault();
        const wasReview = page?.systems.some((s) => selection.systemIds.includes(s.id) && s.status === 'review');
        edit({ type: 'confirmSystems', refs: selection.systemIds.map((systemId) => ({ page: pageIndex, systemId })) });
        if (wasReview) goToReview(1);
      } else if (key === 'n' || key === 'N') {
        goToReview(event.shiftKey ? -1 : 1);
      } else if (key === 't' || key === 'T') {
        setTool('text');
      } else if (key === 'p' || key === 'P') {
        setTool('partText');
      } else if (key === 's' || key === 'S') {
        setTool('staff');
      } else if (key === 'v' || key === 'V') {
        setTool('select');
      } else if (key === 'Escape') {
        setTool('select');
        setSelection(emptySelection);
      } else if ((key === 'Delete' || key === 'Backspace') && selection.regionId) {
        event.preventDefault();
        edit({ type: 'removeRegion', id: selection.regionId });
        setSelection(emptySelection);
      } else if ((key === 'a' || key === 'A') && selection.regionId) {
        edit({ type: 'updateRegion', id: selection.regionId, patch: { suggested: false } });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const pickerStaff = picker ? page?.systems.find((s) => s.id === picker.systemId)?.staffs.find((s) => s.id === picker.staffId) : undefined;

  return (
    <main className="assign">
      <PageRail current={pageIndex} onSelect={goToPage} />

      <section className="workspace">
        <div className="toolbar">
          <div className="segmented" role="group" aria-label="Tool">
            <button className={tool === 'select' ? 'active' : ''} onClick={() => setTool('select')} title="Select and assign (V)">
              <Icon name="cursor" /> Select
            </button>
            <button className={tool === 'text' ? 'active' : ''} onClick={() => setTool('text')} title="Draw a shared-text box (T)">
              <Icon name="text" /> Shared text
            </button>
            <button className={tool === 'partText' ? 'active' : ''} onClick={() => setTool('partText')} title="Attach text to one part's staff (P)">
              <Icon name="users" /> Part text
            </button>
            <button className={tool === 'staff' ? 'active' : ''} onClick={() => setTool('staff')} title="Click where a staff was missed (S)">
              <Icon name="staff" /> Add staff
            </button>
          </div>

          <div className="page-nav">
            <button className="icon-button" onClick={() => goToPage(pageIndex - 1)} disabled={pageIndex === 0} aria-label="Previous page">
              <Icon name="chevronLeft" />
            </button>
            <span>
              Page <strong>{pageIndex + 1}</strong> of {doc.pages.length}
            </span>
            <button
              className="icon-button"
              onClick={() => goToPage(pageIndex + 1)}
              disabled={pageIndex === doc.pages.length - 1}
              aria-label="Next page"
            >
              <Icon name="chevronRight" />
            </button>
          </div>

          <div className="row gap">
            <div className="zoom-control" role="group" aria-label="Zoom">
              <button className="icon-button" onClick={() => zoom.zoomBy(0.8)} aria-label="Zoom out" title="Zoom out (−)">
                <Icon name="minus" />
              </button>
              <button className="zoom-value" onClick={zoom.actualSize} title="Actual size. Pinch or Ctrl+scroll to zoom, hold Space to pan.">
                {zoom.percent}%
              </button>
              <button className="icon-button" onClick={() => zoom.zoomBy(1.25)} aria-label="Zoom in" title="Zoom in (+)">
                <Icon name="plus" />
              </button>
              <button className={`text-button ${zoom.isFit ? 'active' : ''}`} onClick={zoom.fit} title="Fit width (Ctrl+0)">
                Fit
              </button>
            </div>
            {reviewCount > 0 ? (
              <button className="button warn" onClick={() => goToReview(1)} title="Next system to check (N)">
                {reviewCount} to check <Icon name="chevronRight" />
              </button>
            ) : (
              <button className="button primary" onClick={() => setStep('export')}>
                All checked · Export <Icon name="chevronRight" />
              </button>
            )}
          </div>
        </div>

        {tool !== 'select' && (
          <div className={`tool-hint ${notice ? 'notice' : ''}`}>
            {notice ??
              (tool === 'text'
                ? 'Drag boxes around text every part should get (tempo, rehearsal letters, titles). Overlapping boxes join into one shape. Alt-drag cuts a piece out. Esc or V when you’re done.'
                : tool === 'partText'
                  ? 'Drag a box over text that belongs to one part (a dynamic, high notes). It must touch that part’s staff area. It’s added to that part and cut out of the others. Alt-drag cuts. Esc when done.'
                  : 'Click where a staff was missed to add one. Shift-click adds a 1-line percussion staff. Esc to cancel.')}
          </div>
        )}

        {banner && (
          <div className="banner">
            <Icon name="alert" />
            <span>{banner.message}</span>
            <button className="button small" onClick={() => setStep('setup')}>Edit parts</button>
            {banner.kind === 'part-count' && (
              <button className="button small ghost" onClick={() => edit({ type: 'dismissIssue', id: banner.id })}>Dismiss</button>
            )}
          </div>
        )}

        <div
          className={`scroller ${zoom.panReady ? 'pan-ready' : ''} ${zoom.panning ? 'panning' : ''}`}
          ref={scroller}
          {...zoom.panHandlers}
        >
          <PageView
            pageIndex={pageIndex}
            width={pageWidth}
            selection={selection}
            tool={tool}
            onSelectStaff={selectStaff}
            onSelectSystem={(systemId, additive) =>
              setSelection((current) => ({
                systemIds: additive ? [...new Set([...current.systemIds, systemId])] : [systemId],
                staffId: null,
                regionId: null,
              }))
            }
            onOpenPicker={(systemId, staffId, anchor) => setPicker({ systemId, staffId, anchor })}
            onSelectRegion={(id) => setSelection({ systemIds: [], staffId: null, regionId: id })}
            onClear={() => setSelection(emptySelection)}
            onToolDone={() => setTool('select')}
            onNotice={setNotice}
          />
        </div>
      </section>

      <Inspector
        pageIndex={pageIndex}
        selection={selection}
        setSelection={setSelection}
        setTool={setTool}
        issues={issues}
        onNextReview={() => goToReview(1)}
      />

      {picker && pickerStaff && (
        <PartPicker
          parts={doc.parts}
          current={pickerStaff.partId}
          anchor={picker.anchor}
          onClose={() => setPicker(null)}
          onPick={(partId) => {
            setPicker(null);
            assignSelected(partId);
          }}
          onRemoveStaff={() => {
            setPicker(null);
            edit({ type: 'removeStaff', page: pageIndex, systemId: picker.systemId, staffId: picker.staffId });
            setSelection(emptySelection);
          }}
        />
      )}
    </main>
  );
}
