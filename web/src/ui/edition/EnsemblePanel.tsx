// The Ensemble: who's playing, always visible next to the score.
//   - Add players with one box (suggestions, ensembles, or paste a list).
//   - Click a player to pick them, then click staves on the score to give
//     the staves to that player.
//   - "⋯" opens a player for editing: name, staves per system, percussion,
//     order, remove.

import { useMemo, useState } from 'react';
import { INSTRUMENTS, PART_COLORS, PRESETS, makePart, partsFromNames } from '../../model/parts.ts';
import type { Id, Part } from '../../model/types.ts';
import { allSystems } from '../../model/types.ts';
import { useEditor } from '../shared/context.ts';
import { Icon } from '../shared/Icon.tsx';

export const ADD_PLAYER_INPUT_ID = 'add-player';

type Suggestion = { kind: 'typed'; name: string } | { kind: 'instrument'; name: string } | { kind: 'ensemble'; name: string; parts: string[] };

function AddPlayer({ onAdd, empty }: { onAdd: (names: string[]) => void; empty: boolean }) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const suggestions = useMemo<Suggestion[]>(() => {
    const query = text.trim().toLowerCase();
    if (!query) return [];
    const instruments = INSTRUMENTS.filter((name) => name.toLowerCase().includes(query))
      .sort((a, b) => Number(!a.toLowerCase().startsWith(query)) - Number(!b.toLowerCase().startsWith(query)))
      .slice(0, 6)
      .map((name) => ({ kind: 'instrument' as const, name }));
    const ensembles = PRESETS.filter((p) => p.name.toLowerCase().includes(query)).map((p) => ({ kind: 'ensemble' as const, ...p }));
    const exact = instruments.some((s) => s.name.toLowerCase() === query);
    // Best match first, so Enter after "viol" adds "Violin".
    return [...instruments, ...ensembles, ...(exact ? [] : [{ kind: 'typed' as const, name: text.trim() }])];
  }, [text]);

  const choose = (suggestion: Suggestion | undefined) => {
    if (!suggestion) return;
    onAdd(suggestion.kind === 'ensemble' ? suggestion.parts : [suggestion.name]);
    setText('');
    setActive(0);
  };

  return (
    <div className="add-player">
      <Icon name="plus" />
      <input
        id={ADD_PLAYER_INPUT_ID}
        value={text}
        autoComplete="off"
        placeholder={empty ? 'Add a player, e.g. Violin' : 'Add a player'}
        aria-label="Add a player"
        onChange={(event) => {
          setText(event.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onPaste={(event) => {
          const lines = event.clipboardData.getData('text').split(/\r?\n|,|;/).map((s) => s.trim()).filter(Boolean);
          if (lines.length > 1) {
            event.preventDefault();
            onAdd(lines);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActive((a) => Math.min(suggestions.length - 1, a + 1));
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (event.key === 'Enter') {
            event.preventDefault();
            choose(suggestions[active]);
          } else if (event.key === 'Escape') {
            setOpen(false);
            (event.target as HTMLInputElement).blur();
          }
        }}
      />
      {open && suggestions.length > 0 && (
        <ul className="suggestions" role="listbox">
          {suggestions.map((s, index) => (
            <li
              key={`${s.kind}:${s.name}`}
              role="option"
              aria-selected={index === active}
              className={index === active ? 'active' : ''}
              onMouseEnter={() => setActive(index)}
              onMouseDown={(event) => {
                event.preventDefault();
                choose(s);
              }}
            >
              <span>{s.kind === 'typed' ? `Add “${s.name}”` : s.name}</span>
              <span className="suggestion-meta">
                {s.kind === 'ensemble' && `${s.parts.length} players`}
                {index === active && <kbd>↵</kbd>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StaffGlyph({ count }: { count: number }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => {
        const top = count === 1 ? 6 : count === 2 ? 3 + i * 6 : 1 + i * 5;
        return <rect key={i} x="2" y={top} width="12" height="3.5" rx="0.75" fill="currentColor" />;
      })}
    </svg>
  );
}

interface Props {
  brush: Id | null | undefined;
  setBrush: (brush: Id | null | undefined) => void;
}

export function EnsemblePanel({ brush, setBrush }: Props) {
  const { doc, edit, detection } = useEditor();
  const parts = doc.parts;
  const [editing, setEditing] = useState<Id | null>(null);

  const setParts = (next: Part[], coalesce?: string) => edit({ type: 'setParts', parts: next }, coalesce);
  const update = (id: Id, patch: Partial<Part>, coalesce?: string) =>
    setParts(parts.map((part) => (part.id === id ? { ...part, ...patch } : part)), coalesce);
  const move = (from: number, to: number) => {
    if (to < 0 || to >= parts.length) return;
    const next = parts.slice();
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setParts(next);
  };
  const add = (names: string[]) => {
    const created =
      names.length === 1
        ? [makePart(names[0], parts.length)]
        : partsFromNames(names).map((part, i) => ({ ...part, color: PART_COLORS[(parts.length + i) % PART_COLORS.length] }));
    setParts([...parts, ...created]);
  };

  const placed = useMemo(() => {
    const counts = new Map<Id, number>();
    for (const { system } of allSystems(doc)) {
      for (const id of new Set(system.staffs.map((s) => s.partId).filter(Boolean) as Id[])) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  }, [doc]);

  const read = doc.pages.filter((p) => p.detected).length;
  const reading = read < doc.pageCount && detection.running;

  return (
    <aside className="ensemble">
      <header className="ensemble-head">
        <h2>Ensemble</h2>
        <span className="count">{parts.length}</span>
      </header>

      {reading && (
        <div className="reading" role="status">
          <span>Reading the score…</span>
          <span className="num">{read}/{doc.pageCount}</span>
          <div className="meter"><span style={{ width: `${(read / Math.max(1, doc.pageCount)) * 100}%` }} /></div>
        </div>
      )}

      <AddPlayer onAdd={add} empty={parts.length === 0} />

      {parts.length === 0 ? (
        <div className="ensemble-empty">
          <p>Add the players in the order they appear in the score, top to bottom.</p>
          <span className="label">Or start with</span>
          <ul className="preset-list">
            {PRESETS.map((preset) => (
              <li key={preset.name}>
                <button onClick={() => add(preset.parts)}>
                  {preset.name}
                  <span className="num">{preset.parts.length}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <>
          <p className="ensemble-hint">
            {brush === undefined ? 'Click a player, then click their staves on the score.' : 'Now click staves to give them to this player. Esc when done.'}
          </p>
          <ol className="players">
            {parts.map((part, index) => {
              const armed = brush === part.id;
              const open = editing === part.id;
              const count = placed.get(part.id) ?? 0;
              return (
                <li key={part.id} className={`player ${armed ? 'armed' : ''} ${open ? 'open' : ''}`} style={{ ['--part' as string]: part.color }}>
                  <div className="player-row">
                    <button
                      className="player-pick"
                      aria-pressed={armed}
                      onClick={() => setBrush(armed ? undefined : part.id)}
                      title={armed ? 'Stop' : `Click staves to give them to ${part.name || 'this player'}`}
                    >
                      <span className="player-dot" />
                      <span className="player-name">{part.name || 'Untitled'}</span>
                      {part.staffCount > 1 && <span className="player-staves"><StaffGlyph count={part.staffCount} /></span>}
                      <span className={`player-count ${count === 0 ? 'none' : ''}`}>{count === 0 ? 'not placed' : count}</span>
                    </button>
                    {index < 9 && <kbd className="player-key">{index + 1}</kbd>}
                    <button
                      className="icon-button player-more"
                      aria-label={`Edit ${part.name}`}
                      aria-expanded={open}
                      onClick={() => setEditing(open ? null : part.id)}
                    >
                      <Icon name="more" />
                    </button>
                  </div>

                  {open && (
                    <div className="player-edit">
                      <div className="edit-line">
                        <label className="swatch" title="Color">
                          <input type="color" value={part.color} onChange={(e) => update(part.id, { color: e.target.value }, `color:${part.id}`)} />
                        </label>
                        <input
                          className="edit-name"
                          value={part.name}
                          autoFocus
                          aria-label="Player name"
                          onChange={(e) => update(part.id, { name: e.target.value }, `name:${part.id}`)}
                          onKeyDown={(e) => e.key === 'Enter' && setEditing(null)}
                        />
                      </div>
                      <div className="edit-line">
                        <span className="label">Staves</span>
                        <div className="staves" role="radiogroup" aria-label="Staves per system">
                          {[1, 2, 3].map((n) => (
                            <button
                              key={n}
                              role="radio"
                              aria-checked={part.staffCount === n}
                              className={part.staffCount === n ? 'on' : ''}
                              onClick={() => update(part.id, { staffCount: n })}
                              title={n === 1 ? 'One staff' : n === 2 ? 'Two (piano, harp)' : 'Three (organ)'}
                            >
                              <StaffGlyph count={n} />
                            </button>
                          ))}
                        </div>
                        <button
                          className={`toggle ${part.percussion ? 'on' : ''}`}
                          aria-pressed={part.percussion}
                          onClick={() => update(part.id, { percussion: !part.percussion })}
                          title="Percussion players get single-line staves first"
                        >
                          Percussion
                        </button>
                      </div>
                      <div className="edit-line actions">
                        <button className="text-button" onClick={() => move(index, index - 1)} disabled={index === 0}>Move up</button>
                        <button className="text-button" onClick={() => move(index, index + 1)} disabled={index === parts.length - 1}>Move down</button>
                        <button
                          className="text-button danger"
                          onClick={() => {
                            setParts(parts.filter((p) => p.id !== part.id));
                            setEditing(null);
                            if (armed) setBrush(undefined);
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
            <li className={`player nobody ${brush === null ? 'armed' : ''}`}>
              <div className="player-row">
                <button className="player-pick" aria-pressed={brush === null} onClick={() => setBrush(brush === null ? undefined : null)}>
                  <span className="player-dot" />
                  <span className="player-name">Nobody</span>
                  <span className="player-count">leave out</span>
                </button>
                <kbd className="player-key">0</kbd>
                <span className="player-more-spacer" />
              </div>
            </li>
          </ol>
        </>
      )}
    </aside>
  );
}
