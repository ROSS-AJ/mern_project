// The two editor designs. Both run on the same engine, model, PDF code and
// shared UI pieces (src/ui/shared); each has its own screens and stylesheet.
// Only the active design's stylesheet is injected, so they never clash, and
// switching keeps the open project as it is.
//
// Pick one with ?ui=edition or ?ui=classic in the URL, or the switcher in
// the corner (shown in development). The choice is remembered.

import type { ComponentType } from 'react';
import type { SaveState } from '../App.tsx';
import { Home as ClassicHome } from './classic/Home.tsx';
import { ProjectShell as ClassicShell } from './classic/ProjectShell.tsx';
import classicCss from './classic/styles.css?inline';
import { Home as EditionHome } from './edition/Home.tsx';
import { ProjectShell as EditionShell } from './edition/ProjectShell.tsx';
import editionCss from './edition/styles.css?inline';

export interface HomeProps {
  onContinue: () => void;
  onCreate: (file: File) => void;
  error: string | null;
}

export interface ShellProps {
  onClose: () => void;
  saveState: SaveState;
}

export interface Design {
  label: string;
  Home: ComponentType<HomeProps>;
  ProjectShell: ComponentType<ShellProps>;
  css: string;
}

export const DESIGNS = {
  edition: { label: 'Edition', Home: EditionHome, ProjectShell: EditionShell, css: editionCss },
  classic: { label: 'Classic', Home: ClassicHome, ProjectShell: ClassicShell, css: classicCss },
} satisfies Record<string, Design>;

export type DesignName = keyof typeof DESIGNS;

const STORAGE_KEY = 'partwise-ui';
const isDesign = (value: unknown): value is DesignName => typeof value === 'string' && value in DESIGNS;

export function initialDesign(): DesignName {
  const fromUrl = new URLSearchParams(window.location.search).get('ui');
  if (isDesign(fromUrl)) {
    saveDesign(fromUrl);
    return fromUrl;
  }
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (isDesign(saved)) return saved;
  } catch {
    // Storage can be unavailable (private mode); fall back to the default.
  }
  return 'edition';
}

export function saveDesign(name: DesignName): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, name);
  } catch {
    // Not critical: the choice just won't be remembered.
  }
}

/** Show the switcher in development, or when a design was picked in the URL. */
export function showSwitcher(): boolean {
  return import.meta.env.DEV || new URLSearchParams(window.location.search).has('ui');
}
