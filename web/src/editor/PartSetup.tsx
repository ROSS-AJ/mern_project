import { useState } from 'react';
import { PART_COLORS, PRESETS, makePart, partsFromNames } from '../model/parts.ts';
import type { Part } from '../model/types.ts';
import { useEditor } from './context.ts';
import { Icon } from './Icon.tsx';
import { NEW_PART_INPUT_ID, useStepGate } from './useStepGate.ts';

export function PartSetup() {
  const { doc, edit, detection } = useEditor();
  const parts = doc.parts;
  const [newName, setNewName] = useState('');
  const [pasting, setPasting] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const setParts = (next: Part[], coalesce?: string) => edit({ type: 'setParts', parts: next }, coalesce);
  const update = (index: number, patch: Partial<Part>, coalesce?: string) =>
    setParts(parts.map((part, i) => (i === index ? { ...part, ...patch } : part)), coalesce);
  const move = (from: number, to: number) => {
    if (to < 0 || to >= parts.length || from === to) return;
    const next = parts.slice();
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setParts(next);
  };
  const addPart = () => {
    if (!newName.trim()) return;
    setParts([...parts, makePart(newName.trim(), parts.length)]);
    setNewName('');
  };
  const addMany = (names: string[]) => {
    const created = partsFromNames(names).map((part, i) => ({ ...part, color: PART_COLORS[(parts.length + i) % PART_COLORS.length] }));
    setParts([...parts, ...created]);
  };

  const { detectionDone, detectedPages, goTo } = useStepGate();

  return (
    <main className="setup">
      <section className="card setup-parts">
        <div className="card-header">
          <div>
            <h2>Who's playing?</h2>
            <p className="muted">List the parts top to bottom, in the order they appear in each system.</p>
          </div>
          <div className="row gap">
            <select
              className="button"
              value=""
              aria-label="Add a preset ensemble"
              onChange={(event) => {
                const preset = PRESETS.find((p) => p.name === event.target.value);
                if (preset) addMany(preset.parts);
              }}
            >
              <option value="" disabled>Add preset…</option>
              {PRESETS.map((preset) => (
                <option key={preset.name}>{preset.name}</option>
              ))}
            </select>
            <button className="button" onClick={() => setPasting((p) => !p)}>
              <Icon name="clipboard" /> Paste list
            </button>
          </div>
        </div>

        {pasting && (
          <div className="paste-box">
            <textarea
              autoFocus
              rows={6}
              placeholder={'One part per line, e.g.\nFlute\nClarinet in B♭\nPiano'}
              value={pasteText}
              onChange={(event) => setPasteText(event.target.value)}
            />
            <div className="row gap end">
              <button className="button" onClick={() => setPasting(false)}>Cancel</button>
              <button
                className="button primary"
                disabled={!pasteText.trim()}
                onClick={() => {
                  addMany(pasteText.split(/\r?\n|,/));
                  setPasteText('');
                  setPasting(false);
                }}
              >
                Add parts
              </button>
            </div>
          </div>
        )}

        {parts.length > 0 && (
          <div className="part-list-head" aria-hidden="true">
            <span />
            <span>#</span>
            <span />
            <span>Part</span>
            <span>Staves</span>
            <span>Perc</span>
            <span />
          </div>
        )}
        <ol className="part-list">
          {parts.map((part, index) => (
            <li
              key={part.id}
              className={`part-row ${dragIndex === index ? 'dragging' : ''}`}
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragEnd={() => setDragIndex(null)}
              onDragOver={(event) => {
                event.preventDefault();
                if (dragIndex !== null && dragIndex !== index) {
                  move(dragIndex, index);
                  setDragIndex(index);
                }
              }}
            >
              <span className="grip" title="Drag to reorder"><Icon name="grip" /></span>
              <span className="part-index">{index + 1}</span>
              <label className="color-swatch" style={{ background: part.color }} title="Change color">
                <input type="color" value={part.color} onChange={(event) => update(index, { color: event.target.value }, `color:${part.id}`)} />
              </label>
              <input
                className="part-name"
                value={part.name}
                aria-label={`Part ${index + 1} name`}
                onChange={(event) => update(index, { name: event.target.value }, `name:${part.id}`)}
              />
              <div className="segmented" role="group" aria-label="Staffs per system">
                {[1, 2, 3].map((count) => (
                  <button
                    key={count}
                    className={part.staffCount === count ? 'active' : ''}
                    onClick={() => update(index, { staffCount: count })}
                    title={count === 1 ? 'One staff' : count === 2 ? 'Grand staff (piano, harp)' : 'Three staffs (organ)'}
                  >
                    {count}
                  </button>
                ))}
              </div>
              <label className="check" title="Prefer this part for single-line percussion staffs">
                <input
                  type="checkbox"
                  aria-label={`${part.name || 'Part'} is percussion`}
                  checked={part.percussion}
                  onChange={(event) => update(index, { percussion: event.target.checked })}
                />
              </label>
              <span className="row-actions">
                <button className="icon-button small" aria-label="Move up" onClick={() => move(index, index - 1)} disabled={index === 0}>
                  <Icon name="chevronLeft" size={14} />
                </button>
                <button className="icon-button small" aria-label="Move down" onClick={() => move(index, index + 1)} disabled={index === parts.length - 1}>
                  <Icon name="chevronRight" size={14} />
                </button>
                <button className="icon-button small" aria-label={`Remove ${part.name}`} onClick={() => setParts(parts.filter((_, i) => i !== index))}>
                  <Icon name="x" size={14} />
                </button>
              </span>
            </li>
          ))}
        </ol>

        <form
          className="add-part"
          onSubmit={(event) => {
            event.preventDefault();
            addPart();
          }}
        >
          <input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder={parts.length === 0 ? 'Type a part name, e.g. Violin I, and press Enter' : 'Add another part'}
            id={NEW_PART_INPUT_ID}
            aria-label="New part name"
          />
          <button className="button" type="submit" disabled={!newName.trim()}>
            <Icon name="plus" /> Add
          </button>
        </form>
        <p className="hint">Piano, harp and celesta get 2 staffs automatically, organ gets 3. Use the 1/2/3 buttons to change it.</p>
      </section>

      <aside className="card setup-summary">
        <h2>{detectionDone ? 'Your score is ready' : 'Reading your score'}</h2>
        <div className="progress-block">
          <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={doc.pageCount} aria-valuenow={detectedPages}>
            <span style={{ width: `${(detectedPages / Math.max(1, doc.pageCount)) * 100}%` }} />
          </div>
          <span className="muted">
            {detectionDone
              ? `All ${doc.pageCount} page${doc.pageCount === 1 ? '' : 's'} read.`
              : `Page ${Math.min(detectedPages + 1, doc.pageCount)} of ${doc.pageCount}. Add your instruments while you wait.`}
          </span>
          {detection.error && <p className="error-text">Some pages couldn't be read. You can fix them by hand in the next step.</p>}
        </div>

        <button className="button primary large full" disabled={!detectionDone} onClick={() => goTo('assign')}>
          {detectionDone ? 'Continue' : 'Reading…'} {detectionDone && <Icon name="chevronRight" />}
        </button>
      </aside>
    </main>
  );
}
