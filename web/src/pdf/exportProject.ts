// Exports every part of a saved project, without opening the editor: the
// dashboard uses this with a layout and PDF from the user's projects. Same
// output as the editor's Export step, one PDF per part, in a zip.

import { zipSync } from 'fflate';
import { autoAssign } from '../engine/assign.ts';
import type { ProjectDoc } from '../model/types.ts';
import { migrateDoc } from '../model/types.ts';
import { buildPartsPdf, safeFileName } from './exportParts.ts';
import { closePdf, loadPdf } from './render.ts';

export async function exportPartsZip(
  layout: ProjectDoc,
  pdfBytes: Uint8Array,
  onProgress?: (done: number, total: number) => void,
): Promise<{ bytes: Uint8Array; fileName: string }> {
  // As the editor loads it (older saves brought up to date).
  const doc = autoAssign(migrateDoc(layout));
  if (doc.parts.length === 0) throw new Error('This project has no parts yet. Open it in the editor to set them up.');

  const pdf = await loadPdf(pdfBytes);
  try {
    const title = safeFileName(doc.title);
    const files: Record<string, [Uint8Array, { level: 0 }]> = {};
    const used = new Set<string>();
    for (const [index, part] of doc.parts.entries()) {
      onProgress?.(index, doc.parts.length);
      const bytes = await buildPartsPdf(doc, pdfBytes, pdf, [part.id]);
      // Two parts with the same name each get their own file.
      const base = `${title} - ${safeFileName(part.name || `Part ${index + 1}`)}`;
      let name = base;
      for (let n = 2; used.has(name); n++) name = `${base} (${n})`;
      used.add(name);
      files[`${name}.pdf`] = [bytes, { level: 0 }];
    }
    onProgress?.(doc.parts.length, doc.parts.length);
    return { bytes: zipSync(files), fileName: `${title} - parts.zip` };
  } finally {
    closePdf(pdf);
  }
}
