// Lets the dashboard hand a score to the editor without uploading it, for
// files too big for the user's projects: it becomes the project kept in this
// browser (the site and editor share an address, so they share IndexedDB),
// and the dashboard then opens /editor/?continue.

import { readPartwiseFile, looksLikePartwiseFile } from './partwiseFile.ts';
import { startNewProject } from './storage.ts';
import { newProject } from './types.ts';
import { closePdf, loadPdf } from '../pdf/render.ts';

/** Makes `file` (a PDF or .partwise file) the project this browser keeps. */
export async function keepInBrowser(file: File): Promise<void> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (looksLikePartwiseFile(file.name, bytes)) {
    const saved = readPartwiseFile(bytes);
    await startNewProject(saved.doc, saved.pdf);
    return;
  }
  const pdf = await loadPdf(bytes);
  try {
    await startNewProject(newProject(file.name, file.name.replace(/\.pdf$/i, ''), pdf.numPages), bytes);
  } finally {
    closePdf(pdf);
  }
}
