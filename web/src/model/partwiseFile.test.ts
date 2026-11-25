import assert from 'node:assert/strict';
import { test } from 'node:test';
import { looksLikePartwiseFile, partwiseFileName, readPartwiseFile, writePartwiseFile } from './partwiseFile.ts';
import type { ProjectDoc } from './types.ts';

const doc: ProjectDoc = {
  id: 'p1',
  title: 'Serenade: Op. 22',
  fileName: 'serenade.pdf',
  pageCount: 1,
  createdAt: 1,
  updatedAt: 2,
  step: 'assign',
  parts: [{ id: 'a', name: 'Violin I', color: '#000', staffCount: 1, percussion: false }],
  pages: [{ width: 100, height: 140, angle: 0, detected: true, systems: [] }],
  regions: [],
  dismissedIssues: [],
  cloudId: 'server-id',
};
const pdf = new TextEncoder().encode('%PDF-1.7 fake');

test('a .partwise file round-trips the project and the PDF', () => {
  const bytes = writePartwiseFile(doc, pdf);
  assert.ok(looksLikePartwiseFile('anything.bin', bytes));
  assert.ok(!looksLikePartwiseFile('score.pdf', pdf));
  const back = readPartwiseFile(bytes);
  assert.deepEqual(back.pdf, pdf);
  assert.equal(back.doc.title, doc.title);
  assert.deepEqual(back.doc.parts, doc.parts);
  assert.equal(back.doc.cloudId, undefined, 'the account link stays out of shared files');
});

test('bad files get a readable error', () => {
  assert.throws(() => readPartwiseFile(pdf), /isn't a Partwise project file/);
});

test('file names drop characters Windows rejects', () => {
  assert.equal(partwiseFileName(doc), 'Serenade Op. 22.partwise');
});
