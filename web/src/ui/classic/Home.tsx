import { useEffect, useRef, useState } from 'react';
import { clearSaved, peekLastProject } from '../../model/storage.ts';
import type { ProjectDoc } from '../../model/types.ts';
import { confirmDialog } from '../shared/ConfirmDialog.tsx';
import { SITE_URL } from '../../site.ts';
import { authToken } from '../../model/cloud.ts';
import { Icon } from '../shared/Icon.tsx';

interface Props {
  onContinue: () => void;
  onCreate: (file: File) => void;
  error: string | null;
}

const STEP_LABEL = { setup: 'Parts', assign: 'Assigning', export: 'Ready to export' } as const;

function timeAgo(time: number): string {
  const minutes = Math.round((Date.now() - time) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(time).toLocaleDateString();
}

export function Home({ onContinue, onCreate, error }: Props) {
  const [last, setLast] = useState<ProjectDoc | null | undefined>(undefined);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    peekLastProject().then((doc) => setLast(doc ?? null), () => setLast(null));
  }, []);

  useEffect(() => {
    if (error) setBusy(false);
  }, [error]);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    if (last) {
      const ok = await confirmDialog({
        title: 'Start a new score?',
        message: `“${last.title || last.fileName}” will be replaced. Only one project is kept in this browser.`,
        confirmLabel: 'Replace and continue',
        danger: true,
      });
      if (!ok) return;
    }
    setBusy(true);
    onCreate(file);
  };

  const forget = async () => {
    if (!last) return;
    const ok = await confirmDialog({
      title: 'Remove this project?',
      message: `“${last.title || last.fileName}” and its PDF will be removed from this browser. This can't be undone.`,
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;
    await clearSaved();
    setLast(null);
  };

  return (
    <div className="home">
      <header className="home-bar">
        <div className="brand">
          <span className="brand-mark"><Icon name="music" size={14} /></span>
          Partwise
        </div>
        <a className="home-link" href={SITE_URL}>
          {authToken() ? 'Your projects' : 'Sign in'}
        </a>
      </header>

      <main className="home-main">
        <h1>Split a score into parts</h1>
        <p className="lede">
          Open a PDF score. Partwise finds every staff and system, you say who plays what, and it builds a PDF for each player.
        </p>

        {last && (
          <section className="home-section">
            <h2 className="section-label">Continue where you left off</h2>
            <div className="file-row">
              <span className="file-icon"><Icon name="file" /></span>
              <span className="file-text">
                <strong>{last.title || last.fileName}</strong>
                <small>
                  {last.pageCount} page{last.pageCount === 1 ? '' : 's'} · {last.parts.length} part{last.parts.length === 1 ? '' : 's'} ·{' '}
                  {STEP_LABEL[last.step]} · edited {timeAgo(last.updatedAt)}
                </small>
              </span>
              <button className="text-button" onClick={forget}>Remove</button>
              <button className="button primary" onClick={onContinue}>
                Continue <Icon name="chevronRight" size={14} />
              </button>
            </div>
          </section>
        )}

        <section className="home-section">
          <h2 className="section-label">{last ? 'Start a new score' : 'Start'}</h2>
          <div
            className={`dropzone ${dragging ? 'dragging' : ''}`}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              pick(event.dataTransfer.files[0]);
            }}
          >
            <Icon name="upload" size={18} />
            <span>Drop a PDF or .partwise file here, or</span>
            <button className="button" disabled={busy} onClick={() => input.current?.click()}>
              {busy ? 'Opening…' : 'Choose file'}
            </button>
            <input
              ref={input}
              type="file"
              accept="application/pdf,.pdf,.partwise"
              hidden
              onChange={(event) => {
                pick(event.target.files?.[0]);
                event.target.value = '';
              }}
            />
          </div>
          {error && <p className="error-text">{error}</p>}
          <p className="fine-print">
            Your current project is kept in this browser so you can come back to it. Sign in to keep a library of projects.
          </p>
        </section>
      </main>
    </div>
  );
}
