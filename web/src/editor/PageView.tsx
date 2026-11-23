import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { systemBands, systemBoundaries } from '../engine/crop.ts';
import { bounds, overlap1d, unionPaths } from '../engine/geometry.ts';
import { mergeTargetId } from '../model/reducer.ts';
import type { BoundaryTarget } from '../model/reducer.ts';
import type { Id, Rect, Region } from '../model/types.ts';
import { uid } from '../model/types.ts';
import { pageAspect, renderPage } from '../pdf/render.ts';
import { useEditor } from './context.ts';
import { Icon } from './Icon.tsx';
import { PartPicker } from './PartPicker.tsx';
import type { Selection, Tool } from './selection.ts';
import { toDeskewed } from './selection.ts';

export const GUTTER = 188;

interface Props {
  pageIndex: number;
  width: number;
  selection: Selection;
  tool: Tool;
  onSelectStaff: (systemId: Id, staffId: Id, additive: boolean) => void;
  onSelectSystem: (systemId: Id, additive: boolean) => void;
  onOpenPicker: (systemId: Id, staffId: Id, anchor: DOMRect) => void;
  onSelectRegion: (id: Id) => void;
  onClear: () => void;
  onToolDone: () => void;
  /** Short message for the user (e.g. a part-text box that touches no staff). */
  onNotice: (message: string) => void;
  /**
   * The player picked in the Ensemble panel. Clicking a staff paints it with
   * that player. null = nobody (leave out); undefined = no brush.
   */
  brush?: Id | null;
}

// Colors come from the stylesheet's tokens, so the page and the panels always match.
const SHARED_COLOR = 'var(--region)';

interface Drag {
  systemId: Id;
  target: BoundaryTarget;
  y: number; // deskewed display px
  min: number;
  max: number;
}


export function PageView(props: Props) {
  const { pageIndex, width, selection, tool } = props;
  const { doc, pdf, edit } = useEditor();
  const page = doc.pages[pageIndex];
  const parts = doc.parts;
  const partById = useMemo(() => new Map(parts.map((part) => [part.id, part])), [parts]);

  // ---------- page image ----------
  const [aspect, setAspect] = useState(11 / 8.5);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const canvasHost = useRef<HTMLDivElement>(null);
  // Render resolution follows the zoom, in steps, and only once zooming
  // pauses. In between, the current image is simply scaled (slightly soft for
  // a moment, never blank). renderPage lowers it further if a canvas would be
  // too large for the browser.
  const wantedDpi = Math.min(400, Math.max(72, Math.ceil((width * (window.devicePixelRatio || 1)) / 8.5 / 50) * 50));
  const [dpi, setDpi] = useState(wantedDpi);
  useEffect(() => {
    if (wantedDpi === dpi) return;
    const timer = setTimeout(() => setDpi(wantedDpi), 180);
    return () => clearTimeout(timer);
  }, [wantedDpi, dpi]);

  useEffect(() => {
    let alive = true;
    pageAspect(pdf, pageIndex).then((value) => alive && setAspect(value));
    return () => {
      alive = false;
    };
  }, [pdf, pageIndex]);

  useEffect(() => {
    const controller = new AbortController();
    renderPage(pdf, pageIndex, dpi, { signal: controller.signal }).then(
      (result) => result && !controller.signal.aborted && setCanvas(result.canvas),
      () => undefined,
    );
    return () => controller.abort();
  }, [pdf, pageIndex, dpi]);

  useEffect(() => {
    const host = canvasHost.current;
    if (!host) return;
    host.replaceChildren(...(canvas ? [canvas] : []));
  }, [canvas]);

  // Don't show the previous page's image while the new one renders.
  useEffect(() => setCanvas(null), [pageIndex]);

  const W = width;
  const H = width * aspect;
  const angle = page?.angle ?? 0;

  // ---------- pointer interaction ----------
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [draft, setDraft] = useState<{ x0: number; y0: number; x1: number; y1: number; cut: boolean } | null>(null);
  // A part-text box that touches several parts' staffs: ask which part.
  const [partChoice, setPartChoice] = useState<{ rect: Rect; partIds: Id[]; anchor: DOMRect } | null>(null);

  /** Paint a staff with the picked player. Returns false when no player is picked. */
  const paint = (systemId: Id, staffId: Id): boolean => {
    if (props.brush === undefined) return false;
    edit({ type: 'assignStaff', page: pageIndex, systemId, staffId, partId: props.brush });
    return true;
  };

  const drawRegion = (draftRegion: Region) => {
    const id = mergeTargetId(doc, draftRegion);
    edit({ type: 'drawRegion', draft: draftRegion });
    props.onSelectRegion(id);
  };

  /** Parts whose band (on this page) the box overlaps, most overlap first. */
  const partsTouching = (rect: Rect): Id[] => {
    const amounts = new Map<Id, number>();
    page.systems.forEach((_, index) => {
      for (const band of systemBands(page, index)) {
        if (!band.partId) continue;
        const amount = overlap1d(band.top, band.bottom, rect.y, rect.y + rect.h);
        if (amount > 0) amounts.set(band.partId, (amounts.get(band.partId) ?? 0) + amount);
      }
    });
    return [...amounts.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  };

  const pointer = (event: { clientX: number; clientY: number }) => {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 || !page?.detected) return;
    const p = pointer(event);
    if (tool === 'text' || tool === 'partText') {
      svgRef.current!.setPointerCapture(event.pointerId);
      setDraft({ x0: p.x, y0: p.y, x1: p.x, y1: p.y, cut: event.altKey });
    } else if (tool === 'staff') {
      const d = toDeskewed(p.x, p.y, W, H, angle);
      edit({ type: 'addStaff', page: pageIndex, y: d.y / H, lineCount: event.shiftKey ? 1 : 5 });
      props.onToolDone();
    } else if (event.target === svgRef.current) {
      props.onClear();
    }
  };

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (draft) {
      const p = pointer(event);
      setDraft({ ...draft, x1: p.x, y1: p.y });
    } else if (drag) {
      const p = pointer(event);
      const d = toDeskewed(p.x, p.y, W, H, angle);
      setDrag({ ...drag, y: Math.min(drag.max, Math.max(drag.min, d.y)) });
    }
  };

  const onPointerUp = () => {
    if (draft) {
      const x = Math.min(draft.x0, draft.x1);
      const y = Math.min(draft.y0, draft.y1);
      const w = Math.abs(draft.x1 - draft.x0);
      const h = Math.abs(draft.y1 - draft.y0);
      setDraft(null);
      if (w > 6 && h > 6) {
        // The tool stays active so several boxes can be drawn in a row.
        const rect = { x: x / W, y: y / H, w: w / W, h: h / H };
        const kind = tool === 'partText' ? 'staff' : 'shared';
        if (draft.cut) {
          edit({ type: 'cutRegions', page: pageIndex, kind, rect });
        } else if (kind === 'shared') {
          drawRegion({ id: uid(), page: pageIndex, kind, rects: [rect], targets: 'all', partId: null, suggested: false });
        } else {
          const touching = partsTouching(rect);
          if (touching.length === 0) {
            props.onNotice('Part text has to touch a staff’s area. Draw the box so it overlaps the staff it belongs to.');
          } else if (touching.length === 1) {
            drawRegion({ id: uid(), page: pageIndex, kind, rects: [rect], targets: 'all', partId: touching[0], suggested: false });
          } else {
            const svgBox = svgRef.current!.getBoundingClientRect();
            setPartChoice({
              rect,
              partIds: touching,
              anchor: new DOMRect(svgBox.left + x + w, svgBox.top + y, 0, h),
            });
          }
        }
      }
    } else if (drag) {
      edit({ type: 'moveBoundary', page: pageIndex, systemId: drag.systemId, target: drag.target, y: drag.y / H });
      setDrag(null);
    }
  };

  if (!page) return null;

  const regions = doc.regions.filter((region) => region.page === pageIndex);
  // Before any players exist nothing can be "wrong" yet, so don't flag systems.
  const shownStatus = (status: string) => (parts.length === 0 ? 'auto' : status);
  const regionColor = (region: Region) =>
    region.kind === 'staff' ? partById.get(region.partId ?? '')?.color ?? 'var(--text-tertiary)' : SHARED_COLOR;
  const selectedSystems = new Set(selection.systemIds);

  return (
    <div className="page-wrap" style={{ width: W + GUTTER, height: H }}>
      {/* ---------- gutter: part tags ---------- */}
      <div className="gutter" style={{ width: GUTTER, height: H }}>
        {page.systems.map((system, systemIndex) => {
          const bounds = systemBoundaries(page, systemIndex);
          return (
            <div key={system.id}>
              <button
                id={`sys-${system.id}`}
                className={`system-badge ${shownStatus(system.status)} ${selectedSystems.has(system.id) ? 'selected' : ''}`}
                style={{ top: Math.max(0, bounds.above * H) }}
                onClick={(event) => props.onSelectSystem(system.id, event.shiftKey)}
                title={
                  system.status === 'review'
                    ? 'Staff count did not match your parts. Check this system.'
                    : system.status === 'confirmed'
                      ? 'Confirmed'
                      : 'Assigned automatically'
                }
              >
                {system.status === 'review' ? 'Check' : system.status === 'confirmed' ? <Icon name="check" size={11} /> : 'Auto'}
              </button>
              {system.staffs.map((staff, index) => {
                const part = staff.partId ? partById.get(staff.partId) : undefined;
                const previous = system.staffs[index - 1];
                const continued = !!part && previous?.partId === staff.partId;
                const center = ((staff.top + staff.bottom) / 2) * H;
                const selected = selection.staffId === staff.id;
                return (
                  <button
                    key={staff.id}
                    className={`part-tag ${part ? '' : 'unassigned'} ${continued ? 'continued' : ''} ${selected ? 'selected' : ''}`}
                    style={{ top: center - 12, ['--part' as string]: part?.color ?? 'var(--gray-400)' }}
                    onClick={(event) => {
                      if (paint(system.id, staff.id)) return;
                      props.onSelectStaff(system.id, staff.id, event.shiftKey);
                      props.onOpenPicker(system.id, staff.id, event.currentTarget.getBoundingClientRect());
                    }}
                    title={part ? `${part.name}. Click to change.` : 'Not in any part. Click to assign.'}
                  >
                    <span className="tag-name">{part ? part.name || 'Untitled' : staff.lineCount === 1 ? 'Perc line?' : 'Unassigned'}</span>
                  </button>
                );
              })}
              {/* Bracket joining staffs of the same part (piano, harp, divisi). */}
              {system.staffs.map((staff, index) => {
                const next = system.staffs[index + 1];
                if (!staff.partId || next?.partId !== staff.partId || system.staffs[index - 1]?.partId === staff.partId) return null;
                let last = index + 1;
                while (system.staffs[last + 1]?.partId === staff.partId) last++;
                const top = ((staff.top + staff.bottom) / 2) * H;
                const bottom = ((system.staffs[last].top + system.staffs[last].bottom) / 2) * H;
                return (
                  <span
                    key={`bracket-${staff.id}`}
                    className="bracket"
                    style={{ top, height: bottom - top, borderColor: partById.get(staff.partId)?.color }}
                  />
                );
              })}
            </div>
          );
        })}
      </div>

      {/* ---------- page ---------- */}
      <div className="page" style={{ width: W, height: H, left: GUTTER }}>
        <div className="page-canvas" ref={canvasHost} />
        {!canvas && <div className="page-loading">Rendering page…</div>}
        {!page.detected && <div className="page-detecting">Finding staffs on this page…</div>}

        <svg
          ref={svgRef}
          className={`overlay tool-${tool} ${props.brush !== undefined && tool === 'select' ? 'painting' : ''}`}
          style={props.brush ? { ['--brush' as string]: partById.get(props.brush)?.color } : undefined}
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <defs>
            <pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="8" height="8" className="hatch-bg" />
              <line x1="0" y1="0" x2="0" y2="8" className="hatch-line" />
            </pattern>
          </defs>

          <g transform={`rotate(${-angle} ${W / 2} ${H / 2})`}>
            {page.systems.map((system, systemIndex) => {
              const bounds = systemBoundaries(page, systemIndex);
              const selected = selectedSystems.has(system.id);
              const above = drag?.systemId === system.id && drag.target.kind === 'above' ? drag.y / H : bounds.above;
              const below = drag?.systemId === system.id && drag.target.kind === 'below' ? drag.y / H : bounds.below;
              const between = bounds.between.map((value, i) =>
                drag?.systemId === system.id && drag.target.kind === 'between' && drag.target.staffIndex === i ? drag.y / H : value,
              );

              return (
                <g key={system.id} className={`system ${system.status} ${selected ? 'selected' : ''}`}>
                  {system.staffs.map((staff, index) => {
                    const top = index === 0 ? above : between[index - 1];
                    const bottom = index === system.staffs.length - 1 ? below : between[index];
                    const part = staff.partId ? partById.get(staff.partId) : undefined;
                    const isSelected = selection.staffId === staff.id;
                    return (
                      <g key={staff.id}>
                        <rect
                          className="staff-band"
                          x={0}
                          y={top * H}
                          width={W}
                          height={Math.max(0, (bottom - top) * H)}
                          fill={part ? part.color : 'url(#hatch)'}
                          fillOpacity={part ? (isSelected ? 0.26 : selected ? 0.16 : 0.1) : 1}
                          onClick={(event) => {
                            if (tool !== 'select' || paint(system.id, staff.id)) return;
                            props.onSelectStaff(system.id, staff.id, event.shiftKey);
                          }}
                        />
                        {Array.from({ length: staff.lineCount }, (_, line) => (
                          <line
                            key={line}
                            className="staff-line"
                            x1={0}
                            x2={W}
                            y1={(staff.top + line * staff.spacing) * H}
                            y2={(staff.top + line * staff.spacing) * H}
                          />
                        ))}
                        {isSelected && (
                          <rect
                            className="staff-selected"
                            x={1}
                            y={top * H}
                            width={W - 2}
                            height={Math.max(0, (bottom - top) * H)}
                            style={{ stroke: part?.color ?? 'var(--text)' }}
                          />
                        )}
                      </g>
                    );
                  })}
                  <rect
                    className={`system-outline status-${shownStatus(system.status)}`}
                    x={1}
                    y={above * H}
                    width={W - 2}
                    height={(below - above) * H}
                    strokeWidth={selected ? 2.5 : 1.25}
                    strokeDasharray={system.status === 'review' ? '6 4' : undefined}
                  />

                  {/* Crop edges: drag to move what goes into each part. */}
                  {selected && tool === 'select' && selection.systemIds.length === 1 && (
                    <>
                      {[
                        { target: { kind: 'above' } as BoundaryTarget, y: above, min: 0, max: system.staffs[0].top },
                        ...between.map((y, i) => ({
                          target: { kind: 'between', staffIndex: i } as BoundaryTarget,
                          y,
                          min: system.staffs[i].bottom,
                          max: system.staffs[i + 1].top,
                        })),
                        { target: { kind: 'below' } as BoundaryTarget, y: below, min: system.staffs[system.staffs.length - 1].bottom, max: 1 },
                      ].map((handle, i) => (
                        <g
                          key={i}
                          className="handle"
                          onPointerDown={(event) => {
                            event.stopPropagation();
                            svgRef.current!.setPointerCapture(event.pointerId);
                            setDrag({ systemId: system.id, target: handle.target, y: handle.y * H, min: handle.min * H, max: handle.max * H });
                          }}
                        >
                          <line className="handle-hit" x1={0} x2={W} y1={handle.y * H} y2={handle.y * H} />
                          <line className="handle-line" x1={0} x2={W} y1={handle.y * H} y2={handle.y * H} />
                          <rect className="handle-grip" x={W / 2 - 16} y={handle.y * H - 4} width={32} height={8} rx={4} />
                        </g>
                      ))}
                    </>
                  )}
                </g>
              );
            })}
          </g>

          {/* Regions are in original page space (not rotated). A merged
              region is drawn as one shape: a single fill and only its outer edge. */}
          {regions.map((region) => {
            const paths = unionPaths(region.rects, W, H);
            const color = regionColor(region);
            return (
              <g
                key={region.id}
                className={`region ${region.kind} ${region.suggested ? 'suggested' : ''} ${selection.regionId === region.id ? 'selected' : ''}`}
              >
                <path className="region-fill" d={paths.fill} style={{ fill: color }} onClick={() => tool === 'select' && props.onSelectRegion(region.id)} />
                <path className="region-outline" d={paths.outline} style={{ stroke: color }} />
              </g>
            );
          })}

          {draft && (
            <rect
              className={`region-draft ${draft.cut ? 'cut' : ''}`}
              x={Math.min(draft.x0, draft.x1)}
              y={Math.min(draft.y0, draft.y1)}
              width={Math.abs(draft.x1 - draft.x0)}
              height={Math.abs(draft.y1 - draft.y0)}
            />
          )}
        </svg>

        {partChoice && (
          <PartPicker
            parts={doc.parts.filter((part) => partChoice.partIds.includes(part.id))}
            current={null}
            anchor={partChoice.anchor}
            extras={false}
            title="Which part is this text for?"
            onPick={(partId) => {
              if (partId) {
                drawRegion({ id: uid(), page: pageIndex, kind: 'staff', rects: [partChoice.rect], targets: 'all', partId, suggested: false });
              }
              setPartChoice(null);
            }}
            onRemoveStaff={() => setPartChoice(null)}
            onClose={() => setPartChoice(null)}
          />
        )}

        {/* Labels, plus accept/reject buttons for suggestions. */}
        {regions.map((region) => {
          const box = bounds(region.rects);
          return (
          <div
            key={region.id}
            className={`region-label ${region.kind} ${region.suggested ? 'suggested' : ''}`}
            style={{ left: box.x * W, top: Math.max(0, box.y * H - 22), ['--region' as string]: regionColor(region) }}
          >
            {region.suggested ? (
              <>
                <span>Shared text?</span>
                <button
                  aria-label="Accept: show this for every part"
                  title="Accept: show this for every part"
                  onClick={() => edit({ type: 'updateRegion', id: region.id, patch: { suggested: false } })}
                >
                  <Icon name="check" size={12} />
                </button>
                <button aria-label="Reject suggestion" title="Reject" onClick={() => edit({ type: 'removeRegion', id: region.id })}>
                  <Icon name="x" size={12} />
                </button>
              </>
            ) : (
              <button className="region-name" onClick={() => props.onSelectRegion(region.id)}>
                {region.kind === 'staff'
                  ? partById.get(region.partId ?? '')?.name || 'No part'
                  : region.targets === 'all'
                    ? 'All parts'
                    : `${region.targets.length} part${region.targets.length === 1 ? '' : 's'}`}
              </button>
            )}
          </div>
          );
        })}
      </div>
    </div>
  );
}
