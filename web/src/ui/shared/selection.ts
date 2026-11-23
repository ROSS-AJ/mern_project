import type { Id, PageDoc, ProjectDoc } from '../../model/types.ts';
import { allSystems } from '../../model/types.ts';

export type Tool = 'select' | 'text' | 'partText' | 'staff';

export interface Selection {
  /** Selected systems on the current page (shift-click adds more). */
  systemIds: Id[];
  staffId: Id | null;
  regionId: Id | null;
}

export const emptySelection: Selection = { systemIds: [], staffId: null, regionId: null };

/** Deskew-space point from an on-screen point, both in display pixels. */
export function toDeskewed(x: number, y: number, width: number, height: number, angleDegrees: number) {
  const a = (angleDegrees * Math.PI) / 180;
  const dx = x - width / 2;
  const dy = y - height / 2;
  return {
    x: dx * Math.cos(a) - dy * Math.sin(a) + width / 2,
    y: dx * Math.sin(a) + dy * Math.cos(a) + height / 2,
  };
}

/** Staffs on a page in top-to-bottom order, with the system each is in. */
export function pageStaffs(page: PageDoc) {
  return page.systems.flatMap((system) => system.staffs.map((staff, index) => ({ system, staff, index })));
}

/** The next (or previous) system needing review, starting after the given position. */
export function findReview(doc: ProjectDoc, fromPage: number, fromSystemId: Id | null, direction: 1 | -1) {
  const list = allSystems(doc);
  let start = list.findIndex((entry) => entry.system.id === fromSystemId);
  if (start === -1) {
    // Start just before/after the first system on the current page.
    start = list.findIndex((entry) => entry.page >= fromPage);
    if (start === -1) start = list.length;
    if (direction === 1) start -= 1;
  }
  for (let step = 1; step <= list.length; step++) {
    const index = (((start + step * direction) % list.length) + list.length) % list.length;
    if (list[index].system.status === 'review') return list[index];
  }
  return null;
}
