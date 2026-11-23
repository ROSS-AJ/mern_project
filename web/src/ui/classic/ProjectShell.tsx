import type { SaveState } from '../../App.tsx';
import type { Step } from '../../model/types.ts';
import { allSystems } from '../../model/types.ts';
import { AssignView } from './AssignView.tsx';
import { useEditor } from '../shared/context.ts';
import { ExportView } from './ExportView.tsx';
import { Icon } from '../shared/Icon.tsx';
import { PartSetup } from './PartSetup.tsx';
import { useStepGate } from './useStepGate.ts';

const STEPS: { step: Step; label: string }[] = [
  { step: 'setup', label: 'Parts' },
  { step: 'assign', label: 'Assign' },
  { step: 'export', label: 'Export' },
];

export function ProjectShell({ onClose, saveState }: { onClose: () => void; saveState: SaveState }) {
  const { doc, edit, undo, redo, canUndo, canRedo, detection } = useEditor();
  const { detectionDone, goTo } = useStepGate();
  const review = allSystems(doc).filter(({ system }) => system.status === 'review').length;
  const currentIndex = STEPS.findIndex((s) => s.step === doc.step);

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-left">
          <button className="icon-button" aria-label="Back to home" title="Back to home" onClick={onClose}>
            <Icon name="arrowLeft" />
          </button>
          <div className="title-block">
            <input
              className="title-input"
              value={doc.title}
              aria-label="Score title"
              onChange={(event) => edit({ type: 'setTitle', title: event.target.value }, 'title')}
            />
            <span className={`save-state ${saveState}`}>
              {saveState === 'saving' ? 'Saving…' : saveState === 'error' ? 'Not saved' : 'Saved'}
              {detection.running && ` · Detecting ${detection.done}/${detection.total}`}
            </span>
          </div>
        </div>

        <nav className="steps" aria-label="Steps">
          {STEPS.map(({ step, label }, index) => (
            <button
              key={step}
              className={`step ${doc.step === step ? 'current' : ''} ${index < currentIndex ? 'done' : ''}`}
              onClick={() => goTo(step)}
              disabled={step !== 'setup' && !detectionDone}
              title={step !== 'setup' && !detectionDone ? 'Available once the score has been read' : undefined}
              aria-current={doc.step === step ? 'step' : undefined}
            >
              <span className="step-number">{index < currentIndex ? <Icon name="check" size={12} /> : index + 1}</span>
              {label}
              {step === 'assign' && review > 0 && doc.parts.length > 0 && <span className="step-badge">{review}</span>}
            </button>
          ))}
        </nav>

        <div className="topbar-right">
          <button className="icon-button" onClick={undo} disabled={!canUndo} aria-label="Undo" title="Undo (Ctrl+Z)">
            <Icon name="undo" />
          </button>
          <button className="icon-button" onClick={redo} disabled={!canRedo} aria-label="Redo" title="Redo (Ctrl+Shift+Z)">
            <Icon name="redo" />
          </button>
        </div>
      </header>

      {doc.step === 'setup' && <PartSetup />}
      {doc.step === 'assign' && <AssignView />}
      {doc.step === 'export' && <ExportView />}
    </div>
  );
}
