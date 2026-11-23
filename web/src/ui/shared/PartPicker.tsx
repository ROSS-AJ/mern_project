import { useEffect, useMemo, useRef, useState } from 'react';
import type { Id, Part } from '../../model/types.ts';

interface Props {
  parts: Part[];
  current: Id | null;
  anchor: DOMRect;
  onPick: (partId: Id | null) => void;
  onRemoveStaff: () => void;
  onClose: () => void;
  /** Show "Not in any part" and "Not a staff (remove)". Default true. */
  extras?: boolean;
  title?: string;
}

type Option = { kind: 'part'; part: Part; number: number } | { kind: 'none' } | { kind: 'remove' };

export function PartPicker({ parts, current, anchor, onPick, onRemoveStaff, onClose, extras = true, title }: Props) {
  const [filter, setFilter] = useState('');
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  const options = useMemo<Option[]>(() => {
    const query = filter.trim().toLowerCase();
    const matching = parts
      .map((part, index) => ({ kind: 'part' as const, part, number: index + 1 }))
      .filter(({ part }) => !query || part.name.toLowerCase().includes(query));
    return extras ? [...matching, { kind: 'none' }, { kind: 'remove' }] : matching;
  }, [parts, filter, extras]);

  useEffect(() => {
    const index = options.findIndex((option) => option.kind === 'part' && option.part.id === current);
    setActive(index === -1 ? 0 : index);
  }, [options, current]);

  useEffect(() => {
    const onDown = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) onClose();
    };
    window.addEventListener('pointerdown', onDown, true);
    return () => window.removeEventListener('pointerdown', onDown, true);
  }, [onClose]);

  const choose = (option: Option) => {
    if (option.kind === 'part') onPick(option.part.id);
    else if (option.kind === 'none') onPick(null);
    else onRemoveStaff();
  };

  // Keep the popover on screen.
  const top = Math.min(anchor.top, window.innerHeight - 340);
  const left = anchor.right + 8;

  return (
    <div className="picker" ref={box} style={{ top: Math.max(8, top), left }} role="dialog" aria-label={title ?? 'Choose a part'}>
      {title && <div className="picker-title">{title}</div>}
      <input
        autoFocus
        className="picker-filter"
        placeholder="Type to filter, or press a number"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActive((a) => Math.min(options.length - 1, a + 1));
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (event.key === 'Enter') {
            event.preventDefault();
            choose(options[active]);
          } else if (event.key === 'Escape') {
            onClose();
          } else if (!filter && /^[0-9]$/.test(event.key)) {
            event.preventDefault();
            const number = Number(event.key);
            if (number === 0) {
              if (extras) onPick(null);
            } else if (parts[number - 1]) onPick(parts[number - 1].id);
          }
        }}
      />
      <ul role="listbox">
        {options.map((option, index) => (
          <li
            key={option.kind === 'part' ? option.part.id : option.kind}
            role="option"
            aria-selected={index === active}
            className={`${index === active ? 'active' : ''} ${option.kind === 'remove' ? 'danger' : ''} ${option.kind !== 'part' ? 'extra' : ''}`}
            onMouseEnter={() => setActive(index)}
            onClick={() => choose(option)}
          >
            {option.kind === 'part' ? (
              <>
                <span className="dot" style={{ background: option.part.color }} />
                <span className="grow">{option.part.name || 'Untitled'}</span>
                {option.part.staffCount > 1 && <small>{option.part.staffCount} staffs</small>}
                {option.number <= 9 && <kbd>{option.number}</kbd>}
                {option.part.id === current && <small>current</small>}
              </>
            ) : option.kind === 'none' ? (
              <>
                <span className="dot hollow" />
                <span className="grow">Not in any part</span>
                <kbd>0</kbd>
              </>
            ) : (
              <span className="grow">Not a staff (remove)</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
