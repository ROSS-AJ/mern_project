// The .partwise save file: one file that reopens a project anywhere.
//
// It's a zip with two entries:
//   project.json  { format: 'partwise', version, savedAt, project: ProjectDoc }
//   score.pdf     the original PDF, byte for byte
//
// The PDF travels with the layout so a save can never be paired with the
// wrong score. The server (server.js) reads and writes the same format, so a
// file downloaded from the dashboard opens in the editor and the other way
// round. If you change the format, bump PARTWISE_VERSION and teach both sides.

import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type { ProjectDoc } from './types.ts';
import { migrateDoc } from './types.ts';

export const PARTWISE_EXTENSION = '.partwise';
export const PARTWISE_VERSION = 1;

interface Manifest {
  format: 'partwise';
  version: number;
  savedAt: string;
  project: ProjectDoc;
}

/** Strips what only makes sense in this browser (the link to an account's copy). */
function portable(doc: ProjectDoc): ProjectDoc {
  const { cloudId: _cloudId, ...rest } = doc;
  return rest;
}

export function writePartwiseFile(doc: ProjectDoc, pdf: Uint8Array): Uint8Array {
  const manifest: Manifest = {
    format: 'partwise',
    version: PARTWISE_VERSION,
    savedAt: new Date().toISOString(),
    project: portable(doc),
  };
  return zipSync({
    'project.json': [strToU8(JSON.stringify(manifest)), { level: 6 }],
    // PDFs are already compressed; storing them is just as small and faster.
    'score.pdf': [pdf, { level: 0 }],
  });
}

/** A zip starts with "PK"; a PDF with "%PDF". */
export function looksLikePartwiseFile(name: string, bytes: Uint8Array): boolean {
  return name.toLowerCase().endsWith(PARTWISE_EXTENSION) || (bytes[0] === 0x50 && bytes[1] === 0x4b);
}

export function readPartwiseFile(bytes: Uint8Array): { doc: ProjectDoc; pdf: Uint8Array } {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new Error("This isn't a Partwise project file.");
  }
  const json = files['project.json'];
  const pdf = files['score.pdf'];
  if (!json || !pdf) throw new Error("This isn't a Partwise project file.");

  let manifest: Manifest;
  try {
    manifest = JSON.parse(strFromU8(json)) as Manifest;
  } catch {
    throw new Error('This project file is damaged.');
  }
  if (manifest.format !== 'partwise' || !manifest.project) throw new Error("This isn't a Partwise project file.");
  if (manifest.version > PARTWISE_VERSION) {
    throw new Error('This project was saved by a newer version of Partwise. Reload the page to update, then try again.');
  }
  const project = manifest.project;
  if (!Array.isArray(project.pages) || !Array.isArray(project.parts) || !Array.isArray(project.regions)) {
    throw new Error('This project file is damaged.');
  }
  return { doc: migrateDoc(portable(project)), pdf };
}

export function partwiseFileName(doc: ProjectDoc): string {
  const base = (doc.title || doc.fileName.replace(/\.pdf$/i, '') || 'score').replace(/[\\/:*?"<>|]+/g, '').trim();
  return `${base || 'score'}${PARTWISE_EXTENSION}`;
}
