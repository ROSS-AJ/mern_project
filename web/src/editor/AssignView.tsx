// The workspace: Ensemble on the left, the score in the middle, details on
// the right. Everything happens here: add players, give staves to players,
// check the few systems that need it, mark shared text.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { findIssues } from '../engine/issues.ts';
import type { Id } from '../model/types.ts';
import { allSystems } from '../model/types.ts';
import { useEditor } from './context.ts';
import { EnsemblePanel } from './EnsemblePanel.tsx';
import { Icon } from './Icon.tsx';
import type { IconName } from './Icon.tsx';
import { Inspector } from './Inspector.tsx';
import { GUTTER, PageView } from './PageView.tsx';
import { PageRail } from './PageRail.tsx';
import { PartPicker } from './PartPicker.tsx';
import { ReviewDock } from './ReviewDock.tsx';
import type { Selection, Tool } from './selection.ts';
import { emptySelection, findReview, pageStaffs } from './selection.ts';
import { useZoom } from './useZoom.ts';

const TOOLS: { tool: Tool; label: string; key: string; icon: IconName }[] = [
  { tool: 'select', label: 'Select', key: 'V', icon: 'cursor' },
  { tool: 'text', label: 'Shared text: tempo, rehearsal marks, titles', key: 'T', icon: 'text' },
  { tool: 'partText', label: 'Player text: belongs to one player only', key: 'P', icon: 'users' },
  { tool: 'staff', label: 'Add a missed staff', key: 'S', icon: 'staff' },
];

export function AssignView({ onExport }: { onExport: () => void }) {
  const { doc, edit } = useEditor();
  const [pageIndex, setPageIndex] = useState(() => {
    const first = allSystems(doc).find(({ system }) => system.status === 'review');
    return first?.page ?? 0;
  });
  const [selection, setSelection] = useState<Selection>(emptySelection);
  const [tool, setTool] = useState<Tool>('select');
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [notice]);
  // The player picked in the Ensemble (null = "Nobody", undefined = none).
  const [brush, setBrush] = useState<Id | null | undefined>(undefined);
  const [reviewing, setReviewing] = useState(false);
  const [picker, setPicker] = useState<{ systemId: Id; staffId: Id; anchor: DOMRect } | null>(null);
  const [scrollTo, setScrollTo] = useState<Id | null>(null);

  const page = doc.pages[pageIndex];
  const issues = useMemo(() => findIssues(doc), [doc]);
  const reviewCount = useMemo(
    () => (doc.parts.length === 0 ? 0 : allSystems(doc).filter(({ system }) => system.status === 'review').length),
    [doc],
  );
  const banner = issues.find((issue) => issue.kind === 'part-count');
  const brushPart = brush ? doc.parts.find((p) => p.id === brush) : undefined;

  // ---------- page width and zoom ----------
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
  // The scroller has 24px padding on each side.
  const fitWidth = Math.max(320, available - GUTTER - 48);
  const zoom = useZoom(scroller, '.page-wrap', fitWidth);

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
      // To the top of the view, so the review strip below never covers it.
      document.getElementById(`sys-${scrollTo}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      setScrollTo(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [scrollTo, pageIndex]);

  // ---------- selection ----------
  const selectStaff = useCallback((systemId: Id, staffId: Id, additive: boolean) => {
    setSelection((current) => ({
      systemIds: additive ? [...new Set([...current.systemIds, systemId])] : [systemId],
      staffId,
      regionId: null,
    }));
  }, []);

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
    const part = doc.parts.find((p) => p.id === partId);
    const step = Math.min(part?.staffCount ?? 1, entry.system.staffs.length - entry.index);
    const next = staffs[index + step];
    if (next) selectStaff(next.system.id, next.staff.id, false);
  };

  const pickTool = (next: Tool) => {
    setBrush(undefined);
    setTool(next);
  };

  // ---------- keyboard ----------
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if ((target instanceof Element && target.matches('input, textarea, select')) || event.ctrlKey || event.metaKey || event.altKey) return;
      if (picker || document.querySelector('.dialog')) return;

      const key = event.key;
      if (/^[0-9]$/.test(key) && selection.staffId && brush === undefined) {
        event.preventDefault();
        const number = Number(key);
        assignSelected(number === 0 ? null : doc.parts[number - 1]?.id ?? null);
      } else if (/^[0-9]$/.test(key)) {
        event.preventDefault();
        const number = Number(key);
        const next = number === 0 ? null : doc.parts[number - 1]?.id;
        if (next !== undefined) {
          setTool('select');
          setBrush(brush === next ? undefined : next);
        }
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
        if (wasReview || reviewing) goToReview(1);
      } else if (key === 'n' || key === 'N') {
        setReviewing(true);
        goToReview(event.shiftKey ? -1 : 1);
      } else if (key === 't' || key === 'T') {
        pickTool('text');
      } else if (key === 'p' || key === 'P') {
        pickTool('partText');
      } else if (key === 's' || key === 'S') {
        pickTool('staff');
      } else if (key === 'v' || key === 'V') {
        pickTool('select');
      } else if (key === 'Escape') {
        // Unwind one thing at a time.
        if (brush !== undefined) setBrush(undefined);
        else if (tool !== 'select') setTool('select');
        else if (selection.systemIds.length || selection.staffId || selection.regionId) setSelection(emptySelection);
        else setReviewing(false);
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

  const hint =
    notice ??
    (brush !== undefined && tool === 'select'
      ? brushPart
        ? `Click staves to give them to ${brushPart.name || 'this player'}.`
        : 'Click staves to leave them out of every part.'
      : tool === 'text'
        ? 'Drag a box around text every player should get. Boxes that touch join together. Alt-drag cuts a piece out.'
        : tool === 'partText'
          ? 'Drag a box over text that belongs to one player, like a dynamic hanging below their staff.'
          : tool === 'staff'
            ? 'Click where a staff was missed. Shift-click adds a single-line percussion staff.'
            : null);

  return (
    <main className="workspace">
      <EnsemblePanel
        brush={brush}
        setBrush={(next) => {
          setTool('select');
          setBrush(next);
        }}
      />

      <section className="canvas">
        <div className="canvas-head">
          <div className="canvas-head-left">
            {doc.parts.length === 0 ? (
              <span className="state muted">Add your players to begin</span>
            ) : reviewCount > 0 ? (
              <button
                className={`state attention ${reviewing ? 'on' : ''}`}
                onClick={() => {
                  setReviewing(true);
                  goToReview(1);
                }}
                title="Walk through the systems that need a look (N)"
              >
                <span className="state-dot" />
                {reviewCount} to check
                <Icon name="chevronRight" size={14} />
              </button>
            ) : (
              <span className="state done"><Icon name="check" size={14} /> All checked</span>
            )}
          </div>

          <div className="page-nav">
            <button className="icon-button" onClick={() => goToPage(pageIndex - 1)} disabled={pageIndex === 0} aria-label="Previous page">
              <Icon name="chevronLeft" />
            </button>
            <span>
              Page <strong>{pageIndex + 1}</strong> <span className="muted">/ {doc.pages.length}</span>
            </span>
            <button className="icon-button" onClick={() => goToPage(pageIndex + 1)} disabled={pageIndex === doc.pages.length - 1} aria-label="Next page">
              <Icon name="chevronRight" />
            </button>
          </div>

          <div className="zoom" role="group" aria-label="Zoom">
            <button className="icon-button" onClick={() => zoom.zoomBy(0.8)} aria-label="Zoom out" title="Zoom out (−)">
              <Icon name="minus" />
            </button>
            <button className="zoom-value" onClick={zoom.actualSize} title="Actual size. Pinch or Ctrl+scroll to zoom; hold Space to move around.">
              {zoom.percent}%
            </button>
            <button className="icon-button" onClick={() => zoom.zoomBy(1.25)} aria-label="Zoom in" title="Zoom in (+)">
              <Icon name="plus" />
            </button>
            <button className={`zoom-fit ${zoom.isFit ? 'on' : ''}`} onClick={zoom.fit} title="Fit width (Ctrl+0)">Fit</button>
          </div>
        </div>

        {(hint || banner) && (
          <div className={`canvas-note ${notice || (banner && !hint) ? 'warn' : ''}`} style={brushPart ? { ['--part' as string]: brushPart.color } : undefined}>
            {hint ? (
              <>
                <span className={`note-mark ${brush !== undefined && tool === 'select' ? 'brush' : ''}`} />
                <span className="grow">{hint}</span>
                <span className="muted">Esc to stop</span>
              </>
            ) : (
              banner && (
                <>
                  <Icon name="alert" />
                  <span className="grow">{banner.message}</span>
                  <button className="text-button" onClick={() => edit({ type: 'dismissIssue', id: banner.id })}>Dismiss</button>
                </>
              )
            )}
          </div>
        )}

        <div className="canvas-body">
          <nav className="tool-strip" aria-label="Tools">
            {TOOLS.map((item) => (
              <button
                key={item.tool}
                className={tool === item.tool && (item.tool !== 'select' || brush === undefined) ? 'on' : ''}
                aria-pressed={tool === item.tool}
                aria-label={item.label}
                data-tip={`${item.label} · ${item.key}`}
                onClick={() => pickTool(item.tool)}
              >
                <Icon name={item.icon} size={18} />
              </button>
            ))}
            {brush !== undefined && (
              <span className="tool-brush" style={{ ['--part' as string]: brushPart?.color ?? 'transparent' }} title="Painting">
                <Icon name="brush" size={18} />
              </span>
            )}
          </nav>

          <div
            className={`scroller ${zoom.panReady ? 'pan-ready' : ''} ${zoom.panning ? 'panning' : ''}`}
            ref={scroller}
            {...zoom.panHandlers}
          >
            <PageView
              pageIndex={pageIndex}
              width={zoom.pageWidth}
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
              brush={brush}
            />
          </div>

          {reviewing && (
            <ReviewDock
              pageIndex={pageIndex}
              systemId={selection.systemIds[0] ?? null}
              remaining={reviewCount}
              onConfirm={() => {
                const systemId = selection.systemIds[0];
                if (systemId) edit({ type: 'confirmSystems', refs: [{ page: pageIndex, systemId }] });
                goToReview(1);
              }}
              onSkip={() => goToReview(1)}
              onClose={() => setReviewing(false)}
              onFinish={() => {
                setReviewing(false);
                onExport();
              }}
            />
          )}
        </div>

        <PageRail current={pageIndex} onSelect={goToPage} />
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
