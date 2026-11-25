import { createContext, useContext } from 'react';
import type { EditAction } from '../../model/reducer.ts';
import type { ProjectDoc, Step } from '../../model/types.ts';
import type { PdfDocument } from '../../pdf/render.ts';

export interface DetectionProgress {
  done: number;
  total: number;
  running: boolean;
  error: string | null;
}

/**
 * Where the project is saved besides this browser:
 * local      = only in this browser (guests, or not added to an account yet)
 * saving / saved / error = the copy in the signed-in user's projects
 * signed-out = it's in their projects, but the sign-in ran out
 */
export type CloudState = 'local' | 'saving' | 'saved' | 'error' | 'signed-out';

export interface Editor {
  cloud: CloudState;
  /** A sign-in from the main site is present. */
  signedIn: boolean;
  /** Downloads a .partwise file (layout and PDF). */
  downloadProject: () => void;
  /** Adds a browser-only project to the signed-in user's projects. */
  saveToAccount: () => Promise<void>;
  doc: ProjectDoc;
  pdf: PdfDocument;
  pdfBytes: Uint8Array;
  edit: (edit: EditAction, coalesce?: string) => void;
  setStep: (step: Step) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  detection: DetectionProgress;
  redetectPage: (page: number) => void;
}

export const EditorContext = createContext<Editor | null>(null);

export function useEditor(): Editor {
  const editor = useContext(EditorContext);
  if (!editor) throw new Error('useEditor must be used inside the project editor');
  return editor;
}

/** The save note next to the title: the account copy when there is one, else this browser. */
export function saveNote(local: 'saved' | 'saving' | 'error', cloud: CloudState): { label: string; tone: 'saved' | 'saving' | 'error' } {
  switch (cloud) {
    case 'saving':
      return { label: 'Saving', tone: 'saving' };
    case 'saved':
      return { label: 'Saved to your projects', tone: 'saved' };
    case 'error':
      return { label: 'Not saved to your projects', tone: 'error' };
    case 'signed-out':
      return { label: 'Sign in again to save', tone: 'error' };
    default:
      return { label: local === 'saving' ? 'Saving' : local === 'error' ? 'Not saved' : 'Saved in this browser', tone: local };
  }
}
