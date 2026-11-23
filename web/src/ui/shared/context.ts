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

export interface Editor {
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
