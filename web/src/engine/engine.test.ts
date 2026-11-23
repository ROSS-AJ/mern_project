// Run with: npm test   (Node runs TypeScript directly; no build step)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Part, ProjectDoc, Rect, Region, StaffDoc, SystemDoc } from '../model/types.ts';
import { autoAssign, guessLayout } from './assign.ts';
import { attachRegions, partShapes, systemBands } from './crop.ts';
import type { Shape } from './crop.ts';
import { bounds, subtract } from './geometry.ts';
import { reducer } from '../model/reducer.ts';
import { findIssues } from './issues.ts';

let next = 0;
const id = (prefix: string) => `${prefix}${next++}`;

function part(name: string, staffCount = 1, percussion = false): Part {
  return { id: name, name, color: '#000', staffCount, percussion };
}

function staff(top: number, lineCount = 5): StaffDoc {
  const spacing = 0.01;
  return { id: id('st'), top, bottom: lineCount === 1 ? top : top + spacing * 4, spacing, lineCount, partId: null };
}

function system(tops: number[], lineCounts: number[] = []): SystemDoc {
  return { id: id('sy'), status: 'auto', staffs: tops.map((top, i) => staff(top, lineCounts[i] ?? 5)) };
}

function doc(parts: Part[], pages: SystemDoc[][]): ProjectDoc {
  return {
    id: 'p', title: 't', fileName: 'f.pdf', pageCount: pages.length, createdAt: 0, updatedAt: 0, step: 'assign',
    parts, regions: [], dismissedIssues: [],
    pages: pages.map((systems) => ({ width: 1000, height: 1300, angle: 0, detected: true, systems })),
  };
}

const ids = (s: SystemDoc) => s.staffs.map((st) => st.partId);

test('matching staff count assigns parts in order', () => {
  const parts = [part('Vln'), part('Vla'), part('Vc')];
  const guess = guessLayout(system([0.1, 0.2, 0.3]).staffs, parts);
  assert.deepEqual(guess.partIds, ['Vln', 'Vla', 'Vc']);
  assert.equal(guess.clean, true);
});

test('piano takes two staffs', () => {
  const parts = [part('Vln'), part('Pno', 2)];
  const guess = guessLayout(system([0.1, 0.2, 0.3]).staffs, parts);
  assert.deepEqual(guess.partIds, ['Vln', 'Pno', 'Pno']);
  assert.equal(guess.clean, true);
});

test('1-line staff goes to the percussion part even when the count is short', () => {
  const parts = [part('Fl'), part('Tpt'), part('Perc', 1, true), part('Vln')];
  const guess = guessLayout(system([0.1, 0.2, 0.3], [5, 1, 5]).staffs, parts);
  assert.equal(guess.partIds[1], 'Perc');
  assert.equal(guess.clean, false);
});

test('extra staff is left unassigned and flagged', () => {
  const parts = [part('A'), part('B')];
  const guess = guessLayout(system([0.1, 0.2, 0.3]).staffs, parts);
  assert.equal(guess.partIds.filter((p) => p === null).length, 1);
  assert.equal(guess.clean, false);
});

test('a confirmed layout repeats to later systems with the same pattern', () => {
  const parts = [part('A'), part('B'), part('C')];
  const first = system([0.1, 0.2]);
  const second = system([0.5, 0.6]);
  first.status = 'confirmed';
  first.staffs[0].partId = 'A';
  first.staffs[1].partId = 'C';
  const result = autoAssign(doc(parts, [[first, second]]));
  const after = result.pages[0].systems[1];
  assert.deepEqual(ids(after), ['A', 'C']);
  assert.equal(after.status, 'auto');
});

test('mismatched systems without a confirmed layout are marked for review', () => {
  const parts = [part('A'), part('B'), part('C')];
  const result = autoAssign(doc(parts, [[system([0.1, 0.2])]]));
  assert.equal(result.pages[0].systems[0].status, 'review');
});

test('deleting a part clears it from confirmed systems', () => {
  const s = system([0.1]);
  s.status = 'confirmed';
  s.staffs[0].partId = 'Gone';
  const result = autoAssign(doc([part('A')], [[s]]));
  assert.equal(result.pages[0].systems[0].staffs[0].partId, null);
});

test('consecutive staffs of one part make one band; boundaries sit between staffs', () => {
  const parts = [part('Vln'), part('Pno', 2)];
  const d = autoAssign(doc(parts, [[system([0.1, 0.2, 0.3])]]));
  const bands = systemBands(d.pages[0], 0);
  assert.equal(bands.length, 2);
  assert.equal(bands[1].partId, 'Pno');
  assert.equal(bands[1].staffIds.length, 2);
  assert.ok(Math.abs(bands[0].bottom - 0.17) < 1e-9); // halfway between 0.14 and 0.2
});

function region(rects: Rect[], extra: Partial<Region> = {}): Region {
  return { id: id('r'), page: 0, kind: 'shared', rects, targets: 'all', partId: null, suggested: false, ...extra };
}
const outer = (shape: Shape) => bounds(shape.rects);
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

test('shared text attaches to the system below and is included for every part', () => {
  const parts = [part('A'), part('B')];
  const d = autoAssign(doc(parts, [[system([0.2, 0.3]), system([0.6, 0.7])]]));
  d.regions.push(region([{ x: 0.1, y: 0.5, w: 0.2, h: 0.03 }]));
  const attached = attachRegions(d);
  assert.equal(attached.get(d.pages[0].systems[1].id)?.length, 1);
  const shapes = partShapes(d, 'B');
  assert.equal(shapes.length, 2);
  assert.equal(shapes[1][0].kind, 'region');
});

test('shared text inside a part band joins that band instead of being copied', () => {
  const parts = [part('A'), part('B')];
  const d = autoAssign(doc(parts, [[system([0.2, 0.3])]]));
  // Tempo text just above the top staff: inside part A's band (which reaches
  // up to 6 staff-spaces = 0.06 above the staff), so A already has it.
  d.regions.push(region([{ x: 0.1, y: 0.17, w: 0.2, h: 0.02 }]));

  const a = partShapes(d, 'A')[0];
  assert.equal(a.length, 1);
  assert.equal(a[0].kind, 'band');

  const b = partShapes(d, 'B')[0];
  assert.equal(b[0].kind, 'region');
  assert.equal(b.length, 2);
});

test('shared text poking out of a band is added to the band shape, not stretched across', () => {
  const parts = [part('A'), part('B')];
  const d = autoAssign(doc(parts, [[system([0.2, 0.3])]]));
  // Center (0.15) is inside A's band (top 0.14), but the box starts above it.
  d.regions.push(region([{ x: 0.1, y: 0.13, w: 0.2, h: 0.04 }]));
  const [band] = partShapes(d, 'A')[0];
  assert.ok(near(outer(band).y, 0.13));
  // Only the text's own box reaches above the band; the full-width band doesn't move.
  assert.ok(band.rects.some((r) => r.w === 1 && near(r.y, 0.14)));
});

test('a copied box that overlaps the top of a band trims the band', () => {
  const parts = [part('A'), part('B')];
  const d = autoAssign(doc(parts, [[system([0.2, 0.3])]]));
  // Title block: center (0.115) above A's band (top 0.14), bottom (0.15) inside it.
  d.regions.push(region([{ x: 0.1, y: 0.08, w: 0.6, h: 0.07 }]));
  const shapes = partShapes(d, 'A')[0];
  assert.equal(shapes[0].kind, 'region');
  assert.ok(near(outer(shapes[1]).y, 0.15));
});

test('overlapping shared boxes merge into one region; separate ones stay apart', () => {
  const parts = [part('A')];
  let state = reducer({ doc: null, past: [], future: [], lastCoalesce: null }, { type: 'load', doc: doc(parts, [[system([0.5])]]) });
  const draw = (rect: Rect) => {
    state = reducer(state, { type: 'edit', edit: { type: 'drawRegion', draft: region([rect]) } });
  };
  draw({ x: 0.1, y: 0.1, w: 0.2, h: 0.05 });
  draw({ x: 0.25, y: 0.12, w: 0.2, h: 0.05 }); // overlaps the first
  draw({ x: 0.7, y: 0.1, w: 0.1, h: 0.05 }); // apart
  assert.equal(state.doc!.regions.length, 2);
  assert.equal(state.doc!.regions[0].rects.length, 2);

  // A box touching both joins them all into one shape.
  draw({ x: 0.4, y: 0.1, w: 0.35, h: 0.02 });
  assert.equal(state.doc!.regions.length, 1);
  assert.equal(state.doc!.regions[0].rects.length, 4);

  // Alt-drag cut over everything removes it.
  state = reducer(state, { type: 'edit', edit: { type: 'cutRegions', page: 0, kind: 'shared', rect: { x: 0, y: 0, w: 1, h: 1 } } });
  assert.equal(state.doc!.regions.length, 0);
});

test('shared and part text never merge with each other', () => {
  let state = reducer({ doc: null, past: [], future: [], lastCoalesce: null }, { type: 'load', doc: doc([part('A')], [[system([0.5])]]) });
  const box = { x: 0.1, y: 0.1, w: 0.2, h: 0.05 };
  state = reducer(state, { type: 'edit', edit: { type: 'drawRegion', draft: region([box]) } });
  state = reducer(state, { type: 'edit', edit: { type: 'drawRegion', draft: region([box], { kind: 'staff', partId: 'A' }) } });
  assert.equal(state.doc!.regions.length, 2);
});

test('part text joins its part and is cut out of the neighboring part', () => {
  const parts = [part('A'), part('B')];
  const d = autoAssign(doc(parts, [[system([0.2, 0.3])]]));
  // A dynamic under staff A (bottom 0.24) that hangs past the A/B split (0.27).
  const text = { x: 0.3, y: 0.25, w: 0.1, h: 0.04 };
  d.regions.push(region([text], { kind: 'staff', partId: 'A' }));

  const aShapes = partShapes(d, 'A')[0];
  assert.equal(aShapes.length, 1); // not a separate piece
  assert.ok(near(outer(aShapes[0]).y + outer(aShapes[0]).h, 0.29)); // A's shape reaches down to cover it

  const [b] = partShapes(d, 'B')[0];
  // B's band no longer covers the text: no rect of B contains a point inside it.
  const cx = text.x + text.w / 2;
  const cy = 0.28;
  assert.ok(!b.rects.some((r) => cx > r.x && cx < r.x + r.w && cy > r.y && cy < r.y + r.h));
  // ...but B keeps the rest of its band.
  assert.ok(near(outer(b).y, 0.27));
});

test('subtracting a box leaves the surrounding pieces', () => {
  const pieces = subtract({ x: 0, y: 0, w: 1, h: 1 }, { x: 0.4, y: 0.4, w: 0.2, h: 0.2 });
  assert.equal(pieces.length, 4);
  const area = pieces.reduce((sum, r) => sum + r.w * r.h, 0);
  assert.ok(near(area, 1 - 0.04));
});

test('old single-box regions load as one-rectangle shared shapes', () => {
  const old = doc([part('A')], [[system([0.5])]]);
  (old.regions as unknown[]).push({ id: 'legacy', page: 0, x: 0.1, y: 0.1, w: 0.2, h: 0.05, targets: 'all', suggested: false });
  const state = reducer({ doc: null, past: [], future: [], lastCoalesce: null }, { type: 'load', doc: old });
  const loaded = state.doc!.regions[0];
  assert.equal(loaded.kind, 'shared');
  assert.deepEqual(loaded.rects, [{ x: 0.1, y: 0.1, w: 0.2, h: 0.05 }]);
});

test('part count mismatch and odd systems are reported', () => {
  const parts = [part('A'), part('B')];
  const d = autoAssign(doc(parts, [[system([0.1, 0.2, 0.3]), system([0.4, 0.5]), system([0.6, 0.7, 0.8])]]));
  const kinds = findIssues(d).map((issue) => issue.kind);
  assert.ok(kinds.includes('part-count'));
  assert.ok(kinds.includes('odd-system'));
});
