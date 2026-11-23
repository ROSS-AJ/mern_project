// Guided review: docked under the score, it shows the system being checked as
// a short sentence ("Violin, Cello, Piano"), with one big "Looks right" button.
// Fixing is done right on the page: pick a player and click a staff.

import type { Id } from '../../model/types.ts';
import { missingStaffs } from '../../engine/staffs.ts';
import { useEditor } from '../shared/context.ts';
import { Icon } from '../shared/Icon.tsx';

interface Props {
  pageIndex: number;
  systemId: Id | null;
  remaining: number;
  onConfirm: () => void;
  onSkip: () => void;
  onClose: () => void;
  onFinish: () => void;
}

export function ReviewDock({ pageIndex, systemId, remaining, onConfirm, onSkip, onClose, onFinish }: Props) {
  const { doc, edit } = useEditor();
  const page = doc.pages[pageIndex];
  const systemIndex = page?.systems.findIndex((s) => s.id === systemId) ?? -1;
  const system = systemIndex >= 0 ? page.systems[systemIndex] : undefined;

  if (remaining === 0) {
    return (
      <div className="review-dock done" role="status">
        <span className="review-check"><Icon name="check" size={18} /></span>
        <div className="review-text">
          <strong>Everything’s checked.</strong>
          <span>Every system has been checked. Your parts are ready.</span>
        </div>
        <button className="button ghost" onClick={onClose}>Keep editing</button>
        <button className="button primary large" onClick={onFinish}>
          Get the parts <Icon name="chevronRight" />
        </button>
      </div>
    );
  }

  // Group consecutive staffs of the same player: "Piano" once, not twice.
  const missing = system ? missingStaffs(doc, pageIndex, systemIndex) : 0;
  const lineup: { name: string; color: string; staves: number }[] = [];
  for (const staff of system?.staffs ?? []) {
    const part = doc.parts.find((p) => p.id === staff.partId);
    const last = lineup[lineup.length - 1];
    if (part && last && last.name === part.name) last.staves++;
    else lineup.push({ name: part?.name ?? 'Nobody', color: part?.color ?? 'transparent', staves: 1 });
  }

  return (
    <div className="review-dock" role="region" aria-label="Check this system">
      <div className="review-text">
        <span className="review-kicker">
          Page {pageIndex + 1}, system {systemIndex + 1} · {remaining} left to check
        </span>
        <strong>Is this who’s playing, top to bottom?</strong>
        <ol className="review-lineup">
          {lineup.map((entry, index) => (
            <li key={index} style={{ ['--part' as string]: entry.color }} className={entry.name === 'Nobody' ? 'nobody' : ''}>
              {entry.name}
              {entry.staves > 1 && <span className="dim"> ×{entry.staves}</span>}
            </li>
          ))}
        </ol>
        <span className="review-hint">Not right? Pick a player on the left and click their staff.</span>
      </div>
      <div className="review-actions">
        {missing > 0 && system && (
          <button className="button" onClick={() => edit({ type: 'fillSystem', page: pageIndex, systemId: system.id })}>
            <Icon name="plus" /> Add {missing} missing staff{missing === 1 ? '' : 's'}
          </button>
        )}
        <button className="button ghost" onClick={onClose}>Stop</button>
        <button className="button" onClick={onSkip}>Skip <kbd>N</kbd></button>
        <button className="button primary large" onClick={onConfirm} disabled={!system}>
          <Icon name="check" /> Looks right <kbd>Enter</kbd>
        </button>
      </div>
    </div>
  );
}
