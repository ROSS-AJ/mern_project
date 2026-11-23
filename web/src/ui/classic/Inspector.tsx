import { signature } from '../../engine/assign.ts';
import { missingStaffs } from '../../engine/staffs.ts';
import type { Issue } from '../../engine/issues.ts';
import { allSystems } from '../../model/types.ts';
import { confirmDialog } from '../shared/ConfirmDialog.tsx';
import { useEditor } from '../shared/context.ts';
import { Icon } from '../shared/Icon.tsx';
import type { Selection, Tool } from '../shared/selection.ts';

interface Props {
  pageIndex: number;
  selection: Selection;
  setSelection: (selection: Selection) => void;
  setTool: (tool: Tool) => void;
  issues: Issue[];
  onNextReview: () => void;
}

export function Inspector({ pageIndex, selection, setSelection, setTool, issues, onNextReview }: Props) {
  const { doc, edit, redetectPage } = useEditor();
  const page = doc.pages[pageIndex];

  const region = selection.regionId ? doc.regions.find((r) => r.id === selection.regionId) : undefined;
  const boxCount = region ? `${region.rects.length} box${region.rects.length === 1 ? '' : 'es'}` : '';
  const removeRegion = () => {
    if (!region) return;
    edit({ type: 'removeRegion', id: region.id });
    setSelection({ systemIds: [], staffId: null, regionId: null });
  };

  // ---------- part (staff) text region ----------
  if (region && region.kind === 'staff') {
    const part = doc.parts.find((p) => p.id === region.partId);
    return (
      <aside className="inspector">
        <header>
          <span className="eyebrow">Part text · {boxCount}</span>
          <h2>
            <span className="dot" style={{ background: part?.color ?? '#9ca3af', marginRight: 8 }} />
            {part?.name || 'No part'}
          </h2>
        </header>
        <section>
          <p className="muted">
            This area is added to the part's own crop and cut out of every other part's, so the text goes to the right player only once.
          </p>
          <label className="field">
            <span>Belongs to</span>
            <select value={region.partId ?? ''} onChange={(event) => edit({ type: 'updateRegion', id: region.id, patch: { partId: event.target.value || null } })}>
              {doc.parts.map((p) => (
                <option key={p.id} value={p.id}>{p.name || 'Untitled'}</option>
              ))}
            </select>
          </label>
          <p className="hint">Draw more boxes touching this one with the Part text tool to grow the shape. Alt-drag cuts a piece out.</p>
        </section>
        <footer>
          <button className="button full" onClick={removeRegion}>
            <Icon name="trash" /> Delete <kbd>Del</kbd>
          </button>
        </footer>
      </aside>
    );
  }

  // ---------- shared text region ----------
  if (region) {
    const some = region.targets !== 'all';
    return (
      <aside className="inspector">
        <header>
          <span className="eyebrow">Shared text · {boxCount}</span>
          <h2>{region.suggested ? 'Suggested region' : 'Region'}</h2>
        </header>
        <section>
          <p className="muted">
            Text in this shape (tempo, rehearsal marks, titles) is copied for each chosen part. A part whose own staff area already holds it
            keeps it there instead, so it never appears twice.
          </p>
          <div className="segmented wide" role="group" aria-label="Who gets this text">
            <button className={!some ? 'active' : ''} onClick={() => edit({ type: 'updateRegion', id: region.id, patch: { targets: 'all' } })}>
              All parts
            </button>
            <button
              className={some ? 'active' : ''}
              onClick={() => edit({ type: 'updateRegion', id: region.id, patch: { targets: some ? region.targets : [] } })}
            >
              Some parts
            </button>
          </div>
          {some && (
            <ul className="check-list">
              {doc.parts.map((part) => {
                const targets = region.targets as string[];
                const checked = targets.includes(part.id);
                return (
                  <li key={part.id}>
                    <label>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          edit({
                            type: 'updateRegion',
                            id: region.id,
                            patch: { targets: checked ? targets.filter((id) => id !== part.id) : [...targets, part.id] },
                          })
                        }
                      />
                      <span className="dot" style={{ background: part.color }} />
                      {part.name}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <footer>
          {region.suggested && (
            <button className="button primary full" onClick={() => edit({ type: 'updateRegion', id: region.id, patch: { suggested: false } })}>
              <Icon name="check" /> Accept
            </button>
          )}
          <button
            className="button full"
            onClick={() => {
              edit({ type: 'removeRegion', id: region.id });
              setSelection({ systemIds: [], staffId: null, regionId: null });
            }}
          >
            <Icon name="trash" /> {region.suggested ? 'Reject' : 'Delete'} <kbd>Del</kbd>
          </button>
        </footer>
      </aside>
    );
  }

  // ---------- several systems ----------
  const selected = page?.systems.filter((system) => selection.systemIds.includes(system.id)) ?? [];
  if (selected.length > 1) {
    const refs = selected.map((system) => ({ page: pageIndex, systemId: system.id }));
    return (
      <aside className="inspector">
        <header>
          <span className="eyebrow">Page {pageIndex + 1}</span>
          <h2>{selected.length} systems selected</h2>
        </header>
        <footer>
          <button className="button primary full" onClick={() => edit({ type: 'confirmSystems', refs })}>
            <Icon name="check" /> Confirm all <kbd>Enter</kbd>
          </button>
          <button className="button full" onClick={() => edit({ type: 'resetSystems', refs })}>
            <Icon name="refresh" /> Re-guess all
          </button>
        </footer>
      </aside>
    );
  }

  // ---------- one system ----------
  const system = selected[0];
  if (system && page) {
    const systemIndex = page.systems.indexOf(system);
    const matching = allSystems(doc).filter(({ system: other }) => other.id !== system.id && signature(other) === signature(system)).length;
    const hasCustomEdges = system.bandTop !== undefined || system.bandBottom !== undefined || system.staffs.some((s) => s.splitAbove !== undefined);
    const systemIssues = issues.filter((issue) => issue.systemId === system.id);
    const missing = missingStaffs(doc, pageIndex, systemIndex);
    const ref = [{ page: pageIndex, systemId: system.id }];

    return (
      <aside className="inspector">
        <header>
          <span className="eyebrow">Page {pageIndex + 1} · System {systemIndex + 1}</span>
          <h2>
            {system.staffs.length} staff{system.staffs.length === 1 ? '' : 's'}
            <span className={`pill ${system.status}`}>
              {system.status === 'review' ? 'Needs check' : system.status === 'confirmed' ? 'Confirmed' : 'Auto'}
            </span>
          </h2>
        </header>

        {system.status === 'review' && (
          <p className="callout warn">
            <Icon name="alert" />
            <span>The staff count didn't match your parts, so this is a best guess. Fix anything wrong, then confirm.</span>
          </p>
        )}
        {systemIssues.map((issue) => (
          <p key={issue.id} className="callout">
            <Icon name="alert" />
            <span>
              {issue.message}{' '}
              <button className="link" onClick={() => setTool('staff')}>Add a staff</button>
            </span>
          </p>
        ))}

        <section>
          <ol className="staff-rows">
            {system.staffs.map((staff, index) => (
              <li key={staff.id}>
                {index > 0 && (
                  <button
                    className="split-here"
                    title="Split into two systems here"
                    onClick={() => edit({ type: 'splitSystem', page: pageIndex, systemId: system.id, beforeStaff: index })}
                  >
                    <Icon name="scissors" size={12} /> Split system here
                  </button>
                )}
                <div
                  className={`staff-row ${selection.staffId === staff.id ? 'selected' : ''}`}
                  onClick={() => setSelection({ ...selection, staffId: staff.id })}
                >
                  <span className="staff-num">{index + 1}</span>
                  <span className="dot" style={{ background: doc.parts.find((p) => p.id === staff.partId)?.color ?? 'transparent' }} />
                  <select
                    value={staff.partId ?? ''}
                    aria-label={`Part for staff ${index + 1}`}
                    onChange={(event) =>
                      edit({ type: 'assignStaff', page: pageIndex, systemId: system.id, staffId: staff.id, partId: event.target.value || null })
                    }
                  >
                    <option value="">Not in any part</option>
                    {doc.parts.map((part) => (
                      <option key={part.id} value={part.id}>{part.name || 'Untitled'}</option>
                    ))}
                  </select>
                  {staff.lineCount === 1 && <small className="badge">1 line</small>}
                  <button
                    className="icon-button small"
                    aria-label={`Remove staff ${index + 1}`}
                    title="Not a staff (remove)"
                    onClick={(event) => {
                      event.stopPropagation();
                      edit({ type: 'removeStaff', page: pageIndex, systemId: system.id, staffId: staff.id });
                    }}
                  >
                    <Icon name="x" size={13} />
                  </button>
                </div>
              </li>
            ))}
          </ol>
          <p className="hint">Drag the handles on the page to change where each part's crop starts and ends.</p>
        </section>

        <footer>
          {missing > 0 && (
            <button className="button primary full" onClick={() => edit({ type: 'fillSystem', page: pageIndex, systemId: system.id })}>
              <Icon name="plus" /> Add {missing} missing staff{missing === 1 ? '' : 's'}
            </button>
          )}
          {system.status !== 'confirmed' && (
            <button
              className="button primary full"
              onClick={() => {
                edit({ type: 'confirmSystems', refs: ref });
                if (system.status === 'review') onNextReview();
              }}
            >
              <Icon name="check" /> Looks right <kbd>Enter</kbd>
            </button>
          )}
          {matching > 0 && (
            <button className="button full" onClick={() => edit({ type: 'applyLayoutToMatching', page: pageIndex, systemId: system.id })}>
              <Icon name="users" /> Use this layout for {matching} matching system{matching === 1 ? '' : 's'}
            </button>
          )}
          <div className="row gap">
            {systemIndex < page.systems.length - 1 && (
              <button className="button grow" onClick={() => edit({ type: 'joinWithNext', page: pageIndex, systemId: system.id })}>
                <Icon name="join" /> Join with next
              </button>
            )}
            {system.status === 'confirmed' && (
              <button className="button grow" onClick={() => edit({ type: 'resetSystems', refs: ref })}>
                <Icon name="refresh" /> Re-guess
              </button>
            )}
          </div>
          {hasCustomEdges && (
            <button className="button full" onClick={() => edit({ type: 'resetBoundaries', page: pageIndex, systemId: system.id })}>
              Reset crop edges
            </button>
          )}
        </footer>
      </aside>
    );
  }

  // ---------- nothing selected: page overview ----------
  const review = page?.systems.filter((s) => s.status === 'review').length ?? 0;
  const suggestions = doc.regions.filter((r) => r.page === pageIndex && r.suggested).length;
  const globalIssues = issues.filter((issue) => !issue.systemId);

  return (
    <aside className="inspector">
      <header>
        <span className="eyebrow">Page {pageIndex + 1}</span>
        <h2>{page?.detected ? `${page.systems.length} system${page.systems.length === 1 ? '' : 's'}` : 'Detecting…'}</h2>
      </header>

      <section className="stack">
        {review > 0 && (
          <button className="callout warn action" onClick={onNextReview}>
            <Icon name="alert" />
            <span>{review} system{review === 1 ? '' : 's'} on this page need a quick check.</span>
            <Icon name="chevronRight" />
          </button>
        )}
        {suggestions > 0 && (
          <div className="callout">
            <Icon name="sparkles" />
            <span>
              {suggestions} suggested shared-text region{suggestions === 1 ? '' : 's'} (tempo, rehearsal marks, titles).
              <span className="row gap top-gap">
                <button className="button small primary" onClick={() => edit({ type: 'acceptSuggestions', page: pageIndex })}>Accept all</button>
                <button className="button small" onClick={() => edit({ type: 'rejectSuggestions', page: pageIndex })}>Reject all</button>
              </span>
            </span>
          </div>
        )}
        {globalIssues.map((issue) => (
          <div key={issue.id} className="callout">
            <Icon name="alert" />
            <span>
              {issue.message}
              <button className="link" onClick={() => edit({ type: 'dismissIssue', id: issue.id })}>Dismiss</button>
            </span>
          </div>
        ))}
      </section>

      <section>
        <h3>Shortcuts</h3>
        <dl className="shortcuts">
          <dt><kbd>1</kbd>–<kbd>9</kbd></dt><dd>Assign part to selected staff</dd>
          <dt><kbd>0</kbd></dt><dd>Leave staff out of every part</dd>
          <dt><kbd>↑</kbd> <kbd>↓</kbd></dt><dd>Previous / next staff</dd>
          <dt><kbd>Enter</kbd></dt><dd>Confirm system</dd>
          <dt><kbd>N</kbd></dt><dd>Next system to check</dd>
          <dt><kbd>T</kbd></dt><dd>Draw shared text (overlapping boxes join)</dd>
          <dt><kbd>P</kbd></dt><dd>Attach text to one part's staff</dd>
          <dt><kbd>Alt</kbd>+drag</dt><dd>Cut a piece out of a text shape</dd>
          <dt><kbd>S</kbd></dt><dd>Add a missed staff (Shift-click for a 1-line staff)</dd>
          <dt><kbd>←</kbd> <kbd>→</kbd></dt><dd>Change page</dd>
          <dt><kbd>Ctrl</kbd>+<kbd>Z</kbd></dt><dd>Undo</dd>
        </dl>
      </section>

      {page?.detected && (
        <footer>
          <button
            className="button full"
            onClick={async () => {
              const ok = await confirmDialog({
                title: 'Detect this page again?',
                message: 'Your fixes and part assignments on this page will be replaced by a fresh detection.',
                confirmLabel: 'Detect again',
                danger: true,
              });
              if (ok) redetectPage(pageIndex);
            }}
          >
            <Icon name="refresh" /> Detect this page again
          </button>
        </footer>
      )}
    </aside>
  );
}
