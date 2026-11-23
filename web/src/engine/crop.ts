// Works out what gets cut out for each part.
//
// Each staff gets a horizontal band. Inside a system the boundary between two
// staffs sits halfway between them, so dynamics and lyrics go with the nearer
// staff. Above/below a system the band reaches halfway to the next system
// (at most a few staff-spaces). Users can move any boundary by hand.
// Consecutive staffs of the same part (piano, harp, divisi) form one band.
//
// Regions then reshape those bands:
//   - shared text inside a part's band joins that band (so it isn't added twice)
//     and is copied as its own piece for every other part
//   - staff text joins its own part's band and is cut out of everyone else's

import type { Id, PageDoc, ProjectDoc, Rect, Region, SystemDoc } from '../model/types.ts';
import { allSystems, systemBottom, systemTop } from '../model/types.ts';
import { bounds, overlap1d, subtractAll } from './geometry.ts';

/** How far a band may reach above/below its system, in staff-spaces. */
const MAX_REACH = 6;

export interface Boundaries {
  above: number;
  /** between[i] = boundary between staff i and staff i + 1. */
  between: number[];
  below: number;
}

export function systemBoundaries(page: PageDoc, systemIndex: number): Boundaries {
  const system = page.systems[systemIndex];
  const previous = page.systems[systemIndex - 1];
  const next = page.systems[systemIndex + 1];
  const top = systemTop(system);
  const bottom = systemBottom(system);
  const firstSpacing = system.staffs[0].spacing;
  const lastSpacing = system.staffs[system.staffs.length - 1].spacing;

  let above = Math.max(top - firstSpacing * MAX_REACH, previous ? (systemBottom(previous) + top) / 2 : 0);
  if (system.bandTop !== undefined) above = system.bandTop;

  let below = Math.min(bottom + lastSpacing * MAX_REACH, next ? (bottom + systemTop(next)) / 2 : 1);
  if (system.bandBottom !== undefined) below = system.bandBottom;

  const between: number[] = [];
  for (let i = 0; i < system.staffs.length - 1; i++) {
    const lower = system.staffs[i + 1];
    between.push(lower.splitAbove ?? (system.staffs[i].bottom + lower.top) / 2);
  }

  return { above: clamp01(above), between, below: clamp01(below) };
}

export interface Band {
  partId: Id | null;
  staffIds: Id[];
  /** Index of the first staff in the band. */
  firstStaff: number;
  top: number;
  bottom: number;
}

/** Bands for one system, grouping consecutive staffs of the same part. */
export function systemBands(page: PageDoc, systemIndex: number): Band[] {
  const system = page.systems[systemIndex];
  const bounds = systemBoundaries(page, systemIndex);
  const bands: Band[] = [];

  system.staffs.forEach((staff, index) => {
    const top = index === 0 ? bounds.above : bounds.between[index - 1];
    const bottom = index === system.staffs.length - 1 ? bounds.below : bounds.between[index];
    const last = bands[bands.length - 1];
    if (last && staff.partId !== null && last.partId === staff.partId) {
      last.staffIds.push(staff.id);
      last.bottom = bottom;
    } else {
      bands.push({ partId: staff.partId, staffIds: [staff.id], firstStaff: index, top, bottom });
    }
  });

  return bands;
}

/**
 * Which system each region belongs to.
 * - Staff text: the system where its part's band overlaps it the most.
 * - Shared text (or staff text that touches no band of its part): the system
 *   directly below it on its page, else the last system on the page. On a page
 *   with no systems (a title page), the next system in the score.
 */
export function attachRegions(doc: ProjectDoc): Map<Id, Region[]> {
  const attached = new Map<Id, Region[]>();
  const add = (systemId: Id, region: Region) => {
    if (!attached.has(systemId)) attached.set(systemId, []);
    attached.get(systemId)!.push(region);
  };
  const systems = allSystems(doc);

  for (const region of doc.regions) {
    const page = doc.pages[region.page];
    if (!page || region.rects.length === 0) continue;
    const box = bounds(region.rects);
    let target: SystemDoc | undefined;

    if (region.kind === 'staff' && region.partId) {
      let best = 0;
      page.systems.forEach((system, index) => {
        for (const band of systemBands(page, index)) {
          if (band.partId !== region.partId) continue;
          const amount = overlap1d(band.top, band.bottom, box.y, box.y + box.h);
          if (amount > best) {
            best = amount;
            target = system;
          }
        }
      });
    }

    if (!target) {
      const center = box.y + box.h / 2;
      target = page.systems.find((system) => systemBottom(system) >= center) ?? page.systems[page.systems.length - 1];
    }
    if (!target) target = systems.find((entry) => entry.page > region.page)?.system;
    if (target) add(target.id, region);
  }

  for (const list of attached.values()) list.sort((a, b) => bounds(a.rects).y - bounds(b.rects).y);
  return attached;
}

/** A rectangle plus the space it's in: bands are deskewed, regions are original. */
export interface ShapeRect extends Rect {
  space: 'deskewed' | 'original';
}

/** One piece of a part's export: the page drawn once through this shape. */
export interface Shape {
  page: number;
  kind: 'band' | 'region';
  rects: ShapeRect[];
}

interface WorkingBand {
  top: number;
  bottom: number;
  /** The band never shrinks to closer than one staff-space from its staffs. */
  maxTop: number;
  minBottom: number;
  extra: Rect[];
  cuts: Rect[];
}

/**
 * What one part's export is made of: one group of shapes per system it plays in.
 *
 * - Shared text whose center sits inside one of this part's bands joins that
 *   band's shape, so it's neither duplicated nor cut off. Other parts get the
 *   region as its own shape.
 * - A copied region that only overlaps the edge of a band trims that band back
 *   to the region's edge, so the overlapping text isn't in the part twice.
 * - Staff text for this part joins the band it touches. Staff text for any
 *   other part is cut out of this part's band.
 */
export function partShapes(doc: ProjectDoc, partId: Id): Shape[][] {
  const attached = attachRegions(doc);
  const groups: Shape[][] = [];

  doc.pages.forEach((page, pageIndex) => {
    page.systems.forEach((system, systemIndex) => {
      const mine: WorkingBand[] = systemBands(page, systemIndex)
        .filter((band) => band.partId === partId)
        .map((band) => {
          const first = system.staffs[band.firstStaff];
          const last = system.staffs[band.firstStaff + band.staffIds.length - 1];
          return {
            top: band.top,
            bottom: band.bottom,
            maxTop: first.top - first.spacing,
            minBottom: last.bottom + last.spacing,
            extra: [],
            cuts: [],
          };
        });
      if (mine.length === 0) return;

      const copies: Shape[] = [];
      for (const region of attached.get(system.id) ?? []) {
        if (region.suggested || region.rects.length === 0) continue;
        const box = bounds(region.rects);
        const samePage = region.page === pageIndex;

        if (region.kind === 'staff') {
          if (!samePage) continue;
          if (region.partId === partId) {
            const band = mine.reduce((best, band) =>
              overlap1d(band.top, band.bottom, box.y, box.y + box.h) > overlap1d(best.top, best.bottom, box.y, box.y + box.h) ? band : best,
            );
            band.extra.push(...region.rects);
          } else {
            for (const band of mine) {
              band.cuts.push(...region.rects.filter((r) => overlap1d(r.y, r.y + r.h, band.top, band.bottom) > 0));
            }
          }
          continue;
        }

        if (region.targets !== 'all' && !region.targets.includes(partId)) continue;
        const center = box.y + box.h / 2;
        const home = samePage ? mine.find((band) => center >= band.top && center <= band.bottom) : undefined;
        if (home) {
          home.extra.push(...region.rects);
          continue;
        }

        copies.push({ page: region.page, kind: 'region', rects: region.rects.map((r) => ({ ...r, space: 'original' })) });
        if (!samePage) continue;
        const boxBottom = box.y + box.h;
        for (const band of mine) {
          if (box.y < band.top && boxBottom > band.top) band.top = Math.min(boxBottom, band.maxTop);
          else if (box.y < band.bottom && boxBottom > band.bottom) band.bottom = Math.max(box.y, band.minBottom);
        }
      }

      groups.push([
        ...copies,
        ...mine.map((band): Shape => ({
          page: pageIndex,
          kind: 'band',
          rects: [
            ...subtractAll([{ x: 0, y: band.top, w: 1, h: band.bottom - band.top }], band.cuts).map((r) => ({ ...r, space: 'deskewed' as const })),
            ...band.extra.map((r) => ({ ...r, space: 'original' as const })),
          ],
        })),
      ]);
    });
  });

  return groups;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
