import type { SaveState } from '../../App.tsx';
import type { Step } from '../../model/types.ts';
import { allSystems } from '../../model/types.ts';
import { AssignView } from './AssignView.tsx';
import { useEditor } from '../shared/context.ts';
import { SaveStatus } from '../shared/SaveStatus.tsx';
import { ExportView } from './ExportView.tsx';
import { Icon } from '../shared/Icon.tsx';
import { PartSetup } from './PartSetup.tsx';
import { useStepGate } from './useStepGate.ts';

const STEPS: { step: Step; label: string }[] = [
  { step: 'setup', label: 'Parts' },
  { step: 'assign', label: 'Assign' },
  { step: 'export', label: 'Export' },
];

export function ProjectShell({ onClose, backLabel, saveState }: { onClose: () => void; backLabel: string; saveState: SaveState }) {
  const { doc, edit, undo, redo, canUndo, canRedo, cloud, signedIn, downloadProject, saveToAccount } = useEditor();
  const { detectionDone, goTo } = useStepGate();
  const review = allSystems(doc).filter(({ system }) => system.status === 'review').length;
  const currentIndex = STEPS.findIndex((s) => s.step === doc.step);

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-left">
          <button className="icon-button" aria-label={backLabel} title={backLabel} onClick={onClose}>
            <Icon name="arrowLeft" />
          </button>
          <div className="title-block">
            <input
              className="title-input"
              value={doc.title}
              aria-label="Score title"
              onChange={(event) => edit({ type: 'setTitle', title: event.target.value }, 'title')}
            />
            <SaveStatus saveState={saveState} showDetection />
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
          {signedIn && cloud === 'local' && (
            <button
              className="button"
              onClick={() => void saveToAccount()}
              aria-label="Save to my projects"
              title="Keep this project in your account, to open it from your dashboard anywhere"
            >
              <Icon name="upload" /> <span className="button-label">Save to my projects</span>
            </button>
          )}
          <button
            className="icon-button"
            onClick={downloadProject}
            aria-label="Download project file"
            title="Download a project file (.partwise) with the score and your work, to open later or share"
          >
            <Icon name="download" />
          </button>
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
