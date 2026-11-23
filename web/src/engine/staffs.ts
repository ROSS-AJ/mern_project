// Adding staffs the detector missed, without making the user do the math.
//
//   planNewStaff     size a new staff like its neighbors and snap it into the
//                    gap where a staff belongs
//   inferPart        which player a staff at that position most likely is
//   fillFromTemplate rebuild a short system from a complete one nearby, adding
//                    every missing staff at once (with players)
//
// All positions are page fractions in deskewed space, like the rest of the model.

import type { Id, PageDoc, Part, ProjectDoc, StaffDoc, SystemDoc } from '../model/types.ts';
import { expectedStaffCount } from './assign.ts';

const center = (staff: Pick<StaffDoc, 'top' | 'bottom'>) => (staff.top + staff.bottom) / 2;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * Typical distance from one staff's center to the next inside a system.
 * Uses the given system if it has at least two staffs, else the whole page.
 */
export function staffPitch(page: PageDoc, system?: SystemDoc): number | null {
  const gaps = (s: SystemDoc) => s.staffs.slice(1).map((staff, i) => center(staff) - center(s.staffs[i]));
  if (system && system.staffs.length >= 2) return median(gaps(system));
  return median(page.systems.flatMap(gaps));
}

/** The 5-line staff closest to y: the system's own if it has one, else the page's. */
function referenceStaff(page: PageDoc, y: number, system?: SystemDoc): StaffDoc | undefined {
  const pick = (staffs: StaffDoc[]) =>
    staffs.filter((s) => s.lineCount === 5).sort((a, b) => Math.abs(center(a) - y) - Math.abs(center(b) - y))[0];
  return (system && pick(system.staffs)) ?? pick(page.systems.flatMap((s) => s.staffs));
}

export interface NewStaffPlan {
  /** Index of the system it joins, or -1 to start a new system. */
  systemIndex: number;
  top: number;
  bottom: number;
  spacing: number;
  lineCount: number;
  /** True when the position was snapped to the system's staff pattern. */
  snapped: boolean;
}

export function planNewStaff(page: PageDoc, y: number, lineCount: number): NewStaffPlan {
  const fallbackSpacing = median(page.systems.flatMap((s) => s.staffs.map((st) => st.spacing))) ?? 0.008;
  const pitch = staffPitch(page) ?? fallbackSpacing * 10;

  // Join the system the click is in, or right next to (within one staff pitch).
  const systemIndex = page.systems.findIndex(
    (s) => y >= s.staffs[0].top - pitch && y <= s.staffs[s.staffs.length - 1].bottom + pitch,
  );
  const system = page.systems[systemIndex];
  const reference = referenceStaff(page, y, system);
  const spacing = reference?.spacing ?? fallbackSpacing;
  const height = lineCount === 1 ? 0 : spacing * 4;

  // Snap to where a staff "should" be: one pitch above or below an existing
  // staff, if that spot is free and the click is near it.
  let centerY = y;
  let snapped = false;
  if (system) {
    const localPitch = staffPitch(page, system) ?? pitch;
    const centers = system.staffs.map(center);
    const candidates = centers
      .flatMap((c) => [c - localPitch, c + localPitch])
      .filter((c) => centers.every((existing) => Math.abs(existing - c) > localPitch * 0.5));
    const nearest = candidates.sort((a, b) => Math.abs(a - y) - Math.abs(b - y))[0];
    if (nearest !== undefined && Math.abs(nearest - y) < localPitch * 0.5) {
      centerY = nearest;
      snapped = true;
    }
  }

  return { systemIndex, top: centerY - height / 2, bottom: centerY + height / 2, spacing, lineCount, snapped };
}

/** How many staffs of each part a system already has. */
function usage(staffs: StaffDoc[]): Map<Id, number> {
  const counts = new Map<Id, number>();
  for (const staff of staffs) if (staff.partId) counts.set(staff.partId, (counts.get(staff.partId) ?? 0) + 1);
  return counts;
}

/**
 * The player a staff inserted at `index` most likely belongs to: the second
 * staff of a two-staff player right above it, else the next player in score
 * order that this system is still missing, as long as it comes before the
 * player right below.
 */
export function inferPart(staffs: StaffDoc[], index: number, parts: Part[]): Id | null {
  if (parts.length === 0) return null;
  const order = new Map(parts.map((part, i) => [part.id, i]));
  const others = staffs.filter((_, i) => i !== index);
  const used = usage(others);
  const above = [...staffs.slice(0, index)].reverse().find((s) => s.partId && order.has(s.partId));
  const below = staffs.slice(index + 1).find((s) => s.partId && order.has(s.partId));

  if (above?.partId) {
    const part = parts[order.get(above.partId)!];
    if ((used.get(part.id) ?? 0) < part.staffCount) return part.id;
  }

  const start = above?.partId ? order.get(above.partId)! + 1 : 0;
  const end = below?.partId ? order.get(below.partId)! : parts.length;
  for (let i = start; i < end; i++) {
    if ((used.get(parts[i].id) ?? 0) < parts[i].staffCount) return parts[i].id;
  }
  return null;
}

/**
 * A complete system to copy from: one with exactly as many staffs as the part
 * list needs, preferring the same page (nearest first), then nearby pages.
 */
function findTemplate(doc: ProjectDoc, pageIndex: number, systemIndex: number, expected: number) {
  const candidates: { page: number; system: SystemDoc; distance: number }[] = [];
  doc.pages.forEach((page, p) => {
    page.systems.forEach((system, s) => {
      if (system.staffs.length !== expected || (p === pageIndex && s === systemIndex)) return;
      if (system.staffs.some((staff) => staff.lineCount !== 5 && staff.lineCount !== 1)) return;
      candidates.push({ page: p, system, distance: Math.abs(p - pageIndex) * 100 + (p === pageIndex ? Math.abs(s - systemIndex) : 50) });
    });
  });
  candidates.sort((a, b) => a.distance - b.distance);
  return candidates[0];
}

/** How many staffs fillFromTemplate would add (0 when it can't help). */
export function missingStaffs(doc: ProjectDoc, pageIndex: number, systemIndex: number): number {
  const system = doc.pages[pageIndex]?.systems[systemIndex];
  const expected = expectedStaffCount(doc.parts);
  if (!system || doc.parts.length === 0 || system.staffs.length >= expected) return 0;
  return findTemplate(doc, pageIndex, systemIndex, expected) ? expected - system.staffs.length : 0;
}

/**
 * Rebuild a system that's missing staffs, using a complete system as the
 * pattern. Existing staffs are lined up with the pattern (the best fit of
 * their centers); every unmatched slot gets a new staff with the pattern's
 * size, spacing and player. A matched staff whose line count is wrong (a
 * single detected line that's really a 5-line staff) takes the pattern's shape.
 */
export function fillFromTemplate(
  doc: ProjectDoc,
  pageIndex: number,
  systemIndex: number,
  makeId: () => Id,
): SystemDoc | null {
  const page = doc.pages[pageIndex];
  const system = page?.systems[systemIndex];
  const expected = expectedStaffCount(doc.parts);
  if (!system || system.staffs.length >= expected) return null;
  const template = findTemplate(doc, pageIndex, systemIndex, expected);
  if (!template) return null;

  const slots = template.system.staffs.map((staff) => ({
    offset: center(staff) - center(template.system.staffs[0]),
    height: staff.bottom - staff.top,
    spacing: staff.spacing,
    lineCount: staff.lineCount,
    partId: staff.partId,
  }));
  const existing = system.staffs.map(center);

  // Try anchoring each existing staff to each slot; keep the best fit.
  let best = { shift: existing[0] - slots[0].offset, cost: Infinity };
  for (const e of existing) {
    for (const slot of slots) {
      const shift = e - slot.offset;
      const first = shift + slots[0].offset - slots[0].height / 2;
      const last = shift + slots[slots.length - 1].offset + slots[slots.length - 1].height / 2;
      if (first < -0.01 || last > 1.01) continue; // would run off the page
      const cost = existing.reduce((sum, c) => sum + Math.min(...slots.map((s) => Math.abs(shift + s.offset - c))), 0);
      if (cost < best.cost) best = { shift, cost };
    }
  }

  // Match each existing staff to its nearest free slot (closest pairs first).
  const pitch = staffPitch(page, template.system) ?? 0.05;
  const pairs = existing
    .flatMap((c, j) => slots.map((s, k) => ({ j, k, d: Math.abs(best.shift + s.offset - c) })))
    .filter((p) => p.d < pitch * 0.45)
    .sort((a, b) => a.d - b.d);
  const slotOf = new Map<number, number>();
  const taken = new Set<number>();
  for (const p of pairs) {
    if (slotOf.has(p.j) || taken.has(p.k)) continue;
    slotOf.set(p.j, p.k);
    taken.add(p.k);
  }

  const staffs: StaffDoc[] = [];
  slots.forEach((slot, k) => {
    const c = best.shift + slot.offset;
    const j = [...slotOf.entries()].find(([, kk]) => kk === k)?.[0];
    const current = j !== undefined ? system.staffs[j] : undefined;
    const keepShape = current && current.lineCount === slot.lineCount;
    staffs.push({
      id: current?.id ?? makeId(),
      top: keepShape ? current.top : c - slot.height / 2,
      bottom: keepShape ? current.bottom : c + slot.height / 2,
      spacing: keepShape ? current.spacing : slot.spacing,
      lineCount: slot.lineCount,
      partId: slot.partId,
    });
  });
  // Staffs that matched no slot (likely not staffs at all) are kept, unassigned.
  system.staffs.forEach((staff, j) => {
    if (!slotOf.has(j)) staffs.push({ ...staff, partId: null });
  });
  staffs.sort((a, b) => center(a) - center(b));

  return { ...system, staffs, status: 'confirmed' };
}
