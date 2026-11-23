import { useEffect, useRef, useState } from 'react';
import { clearSaved, peekLastProject } from '../../model/storage.ts';
import type { ProjectDoc } from '../../model/types.ts';
import { confirmDialog } from '../shared/ConfirmDialog.tsx';
import { Icon } from '../shared/Icon.tsx';

interface Props {
  onContinue: () => void;
  onCreate: (file: File) => void;
  error: string | null;
}

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
      </header>

      <main className="home-main">
        <section className="home-hero">
          <span className="eyebrow">Score to parts</span>
          <h1>Every player, their own&nbsp;part.</h1>
          <p className="lede">Open a full score, tell Partwise who’s playing, and get a clean part for every musician.</p>
          <ol className="movements">
            <li><span className="numeral">I</span><span><strong>Who’s playing</strong>List the players in score order.</span></li>
            <li><span className="numeral">II</span><span><strong>Check the music</strong>Partwise finds every staff; you confirm the few it’s unsure about.</span></li>
            <li><span className="numeral">III</span><span><strong>Get the parts</strong>One PDF per player, ready to print.</span></li>
          </ol>
        </section>

        <section className="home-side">
          {last && (
            <div className="resume">
              <span className="eyebrow">Continue</span>
              <div className="resume-card">
                <span className="resume-icon"><Icon name="file" /></span>
                <span className="resume-text">
                  <strong>{last.title || last.fileName}</strong>
                  <small>
                    {last.parts.length} player{last.parts.length === 1 ? '' : 's'} · {last.pageCount} page{last.pageCount === 1 ? '' : 's'} · {timeAgo(last.updatedAt)}
                  </small>
                </span>
                <button className="text-button" onClick={forget}>Remove</button>
                <button className="button primary" onClick={onContinue}>
                  Open <Icon name="chevronRight" size={14} />
                </button>
              </div>
            </div>
          )}

          <div
            className={`sheet ${dragging ? 'dragging' : ''}`}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              void pick(event.dataTransfer.files[0]);
            }}
          >
            <div className="sheet-staves" aria-hidden="true">
              {Array.from({ length: 6 }, (_, i) => (
                <span key={i} />
              ))}
            </div>
            <div className="sheet-content">
              <span className="sheet-icon"><Icon name="upload" size={20} /></span>
              <strong>{last ? 'Start a new score' : 'Drop your score here'}</strong>
              <span className="muted">PDF, scanned or digital</span>
              <button className="button primary large" disabled={busy} onClick={() => input.current?.click()}>
                {busy ? 'Opening…' : 'Choose a PDF'}
              </button>
            </div>
            <input
              ref={input}
              type="file"
              accept="application/pdf,.pdf"
              hidden
              onChange={(event) => {
                void pick(event.target.files?.[0]);
                event.target.value = '';
              }}
            />
          </div>
          {error && <p className="error-text">{error}</p>}
          <p className="fine-print">Your current project stays in this browser. Sign in to keep a library.</p>
        </section>
      </main>
    </div>
  );
}
