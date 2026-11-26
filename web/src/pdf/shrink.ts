// Makes a PDF smaller without changing what's in it: no image is
// recompressed and nothing is resampled, so every page looks exactly the
// same. pdf-lib rewrites the file with its objects packed into compressed
// object streams and drops leftovers from earlier edits of the file.
//
// How much it saves depends on the PDF. Files written by notation software
// often shrink by a tenth or more; scanned scores are almost all image data,
// which is already compressed, so they barely change.

import { PDFDocument } from 'pdf-lib';

/** The smaller of the original and a losslessly repacked copy. */
export async function shrinkPdf(bytes: Uint8Array): Promise<Uint8Array> {
  try {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    // Encrypted files can't be rewritten without breaking them.
    if (doc.isEncrypted) return bytes;
    const packed = await doc.save({ useObjectStreams: true, addDefaultPage: false, updateFieldAppearances: false });
    return packed.length < bytes.length ? packed : bytes;
  } catch {
    // Anything pdf-lib can't rewrite is kept as it is.
    return bytes;
  }
}
