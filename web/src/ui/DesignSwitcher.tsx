// A small corner toggle for switching between the two designs while testing.
// Styled inline on purpose, so it looks the same whichever stylesheet is active.

import type { CSSProperties } from 'react';
import { DESIGNS } from './index.ts';
import type { DesignName } from './index.ts';

const wrap: CSSProperties = {
  position: 'fixed', left: 12, bottom: 12, zIndex: 1000, display: 'flex', alignItems: 'center', gap: 2, padding: 3,
  borderRadius: 999, background: 'rgb(24 24 27 / 0.92)', boxShadow: '0 6px 20px rgb(0 0 0 / 0.25)',
  font: '500 12px/1 system-ui, -apple-system, "Segoe UI", sans-serif',
};
const label: CSSProperties = { padding: '0 8px 0 9px', color: 'rgb(255 255 255 / 0.55)', letterSpacing: '0.04em' };
const button = (active: boolean): CSSProperties => ({
  height: 26, padding: '0 11px', border: 0, borderRadius: 999, cursor: 'pointer', font: 'inherit',
  background: active ? '#fff' : 'transparent', color: active ? '#18181b' : 'rgb(255 255 255 / 0.85)',
});

export function DesignSwitcher({ current, onChange }: { current: DesignName; onChange: (name: DesignName) => void }) {
  return (
    <div style={wrap} role="group" aria-label="Design">
      <span style={label}>UI</span>
      {(Object.keys(DESIGNS) as DesignName[]).map((name) => (
        <button key={name} style={button(name === current)} aria-pressed={name === current} onClick={() => onChange(name)}>
          {DESIGNS[name].label}
        </button>
      ))}
    </div>
  );
}
