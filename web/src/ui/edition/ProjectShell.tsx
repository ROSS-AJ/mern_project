import { useEffect, useState } from 'react';
import type { SaveState } from '../../App.tsx';
import { allSystems } from '../../model/types.ts';
import { confirmDialog } from '../shared/ConfirmDialog.tsx';
import { AssignView } from './AssignView.tsx';
import { useEditor } from '../shared/context.ts';
import { ADD_PLAYER_INPUT_ID } from './EnsemblePanel.tsx';
import { ExportView } from './ExportView.tsx';
import { Icon } from '../shared/Icon.tsx';

export function ProjectShell({ onClose, saveState }: { onClose: () => void; saveState: SaveState }) {
  const { doc, edit, undo, redo, canUndo, canRedo, detection } = useEditor();
  const [exporting, setExporting] = useState(false);

  const read = doc.pages.filter((p) => p.detected).length;
  const readingDone = read === doc.pageCount || (!detection.running && detection.error !== null);
  const players = doc.parts.length;
  const toCheck = players === 0 ? 0 : allSystems(doc).filter(({ system }) => system.status === 'review').length;

  // The three stages, as a progress line rather than separate screens.
  const stages = [
    { label: players === 0 ? 'Add players' : `${players} player${players === 1 ? '' : 's'}`, done: players > 0, active: players === 0 },
    {
      label: !readingDone ? `Reading ${read}/${doc.pageCount}` : players === 0 ? 'Check the music' : toCheck > 0 ? `${toCheck} to check` : 'Checked',
      done: readingDone && players > 0 && toCheck === 0,
      active: players > 0 && (toCheck > 0 || !readingDone),
    },
    { label: 'Parts', done: false, active: exporting || (players > 0 && readingDone && toCheck === 0) },
  ];

  const openExport = async () => {
    if (players === 0) {
      await confirmDialog({
        title: 'Add your players first',
        message: 'Partwise needs to know who is playing to build their parts. Add them in the order they appear, top to bottom.',
        confirmLabel: 'Add players',
        cancelLabel: null,
      });
      requestAnimationFrame(() => document.getElementById(ADD_PLAYER_INPUT_ID)?.focus());
      return;
    }
    setExporting(true);
  };

  useEffect(() => {
    if (!exporting) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setExporting(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [exporting]);

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-left">
          <button className="icon-button" aria-label="Back to home" title="Back to home" onClick={onClose}>
            <Icon name="arrowLeft" />
          </button>
          <span className="brand-mark" aria-hidden="true"><Icon name="music" size={14} /></span>
          <input
            className="title-input"
            value={doc.title}
            aria-label="Score title"
            onChange={(event) => edit({ type: 'setTitle', title: event.target.value }, 'title')}
          />
          <span className={`save-state ${saveState}`}>{saveState === 'saving' ? 'Saving' : saveState === 'error' ? 'Not saved' : 'Saved'}</span>
        </div>

        <ol className="progress-line" aria-label="Progress">
          {stages.map((stage, index) => (
            <li key={index} className={`${stage.done ? 'done' : ''} ${stage.active ? 'active' : ''}`}>
              <span className="mark">{stage.done ? <Icon name="check" size={12} /> : index + 1}</span>
              {stage.label}
            </li>
          ))}
        </ol>

        <div className="topbar-right">
          <button className="icon-button" onClick={undo} disabled={!canUndo} aria-label="Undo" title="Undo (Ctrl+Z)">
            <Icon name="undo" />
          </button>
          <button className="icon-button" onClick={redo} disabled={!canRedo} aria-label="Redo" title="Redo (Ctrl+Shift+Z)">
            <Icon name="redo" />
          </button>
          <button
            className="button primary"
            onClick={openExport}
            disabled={!readingDone}
            title={readingDone ? 'See and download each player’s part' : 'Available once the score has been read'}
          >
            <Icon name="book" /> Parts
          </button>
        </div>
      </header>

      <AssignView onExport={openExport} />

      {exporting && (
        <div className="drawer-backdrop" onPointerDown={(event) => event.target === event.currentTarget && setExporting(false)}>
          <aside className="drawer" role="dialog" aria-label="Your parts">
            <header className="drawer-head">
              <div>
                <span className="eyebrow">{doc.title}</span>
                <h2>Your parts</h2>
              </div>
              <button className="icon-button" aria-label="Back to the score" title="Back to the score (Esc)" onClick={() => setExporting(false)}>
                <Icon name="x" />
              </button>
            </header>
            <ExportView onClose={() => setExporting(false)} />
          </aside>
        </div>
      )}
    </div>
  );
}
