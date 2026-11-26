// The editor's screens. There is one design (once called "Classic"); its
// screens and stylesheet are in ./classic, and the pieces it shares with the
// rest of the app (page view, dialogs, save status...) are in ./shared.

import type { SaveState } from '../App.tsx';
import './classic/styles.css';

export { Home } from './classic/Home.tsx';
export { ProjectShell } from './classic/ProjectShell.tsx';

export interface HomeProps {
  onContinue: () => void;
  onCreate: (file: File) => void;
  error: string | null;
}

export interface ShellProps {
  onClose: () => void;
  /** What the back button says: where it goes (home, or the dashboard). */
  backLabel: string;
  saveState: SaveState;
}
