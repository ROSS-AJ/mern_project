// Decides which part each staff belongs to.
//
// 1. A system with the same staff pattern as a system the user confirmed
//    reuses that layout (the nearest earlier one, else the nearest later one).
//    This is how one fix repeats through the whole score.
// 2. Otherwise the staffs are lined up against the part list in order, with a
//    small dynamic-programming search that may skip resting parts, keep
//    grand-staff parts together and prefer percussion parts for 1-line staffs.
//    If that needed any compromise, the system is marked for review.

import type { Id, Part, ProjectDoc, StaffDoc, SystemDoc } from '../model/types.ts';
import { allSystems } from '../model/types.ts';

export function expectedStaffCount(parts: Part[]): number {
  return parts.reduce((sum, part) => sum + part.staffCount, 0);
}

/** Staff pattern of a system, e.g. "5515" = three 5-line staffs and a percussion line. */
export function signature(system: SystemDoc): string {
  return system.staffs.map((staff) => (staff.lineCount === 1 ? '1' : '5')).join('');
}

export interface Guess {
  partIds: (Id | null)[];
  /** True when every part got exactly its staffs with no compromises. */
  clean: boolean;
}

const SKIP_PART = -1;       // a part resting in this system (hidden staff)
const UNASSIGNED = -3;      // a staff no part claims
const MISSING_STAFF = -1.5; // a grand-staff part with fewer staffs than usual

function matchScore(staff: StaffDoc, part: Part): number {
  if (staff.lineCount === 1) return part.percussion ? 2 : -2;
  return part.percussion ? 0.5 : 1;
}

export function guessLayout(staffs: StaffDoc[], parts: Part[]): Guess {
  const n = parts.length;
  const m = staffs.length;
  if (n === 0) return { partIds: staffs.map(() => null), clean: false };

  // best[i][j]: best score having handled the first i parts and first j staffs.
  type Step = { kind: 'skip' } | { kind: 'unassigned' } | { kind: 'place'; count: number; penalty: boolean };
  const best: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(-Infinity));
  const from: (Step | null)[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(null));
  best[0][0] = 0;

  const relax = (i: number, j: number, score: number, step: Step) => {
    if (score > best[i][j]) {
      best[i][j] = score;
      from[i][j] = step;
    }
  };

  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= m; j++) {
      const here = best[i][j];
      if (here === -Infinity) continue;
      if (j < m) relax(i, j + 1, here + UNASSIGNED, { kind: 'unassigned' });
      if (i < n) {
        const part = parts[i];
        relax(i + 1, j, here + SKIP_PART, { kind: 'skip' });
        for (let count = 1; count <= part.staffCount && j + count <= m; count++) {
          let score = here + (part.staffCount - count) * MISSING_STAFF;
          let penalty = count < part.staffCount;
          for (let k = j; k < j + count; k++) {
            const s = matchScore(staffs[k], part);
            if (s < 0) penalty = true;
            score += s;
          }
          relax(i + 1, j + count, score, { kind: 'place', count, penalty });
        }
      }
    }
  }

  const partIds: (Id | null)[] = new Array(m).fill(null);
  let clean = m === expectedStaffCount(parts);
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const step = from[i][j];
    if (!step) break;
    if (step.kind === 'unassigned') {
      clean = false;
      j--;
    } else if (step.kind === 'skip') {
      clean = false;
      i--;
    } else {
      if (step.penalty) clean = false;
      for (let k = j - step.count; k < j; k++) partIds[k] = parts[i - 1].id;
      j -= step.count;
      i--;
    }
  }

  return { partIds, clean };
}

function withPartIds(system: SystemDoc, partIds: (Id | null)[], status: SystemDoc['status']): SystemDoc {
  const unchanged =
    system.status === status && system.staffs.every((staff, index) => staff.partId === partIds[index]);
  if (unchanged) return system;
  return {
    ...system,
    status,
    staffs: system.staffs.map((staff, index) => ({ ...staff, partId: partIds[index] ?? null })),
  };
}

/**
 * Re-derives every system that isn't confirmed. Confirmed systems are left
 * alone except that references to deleted parts are cleared.
 */
export function autoAssign(doc: ProjectDoc): ProjectDoc {
  const partIds = new Set(doc.parts.map((part) => part.id));
  const systems = allSystems(doc);

  const confirmed = new Map<string, { order: number; partIds: (Id | null)[] }[]>();
  systems.forEach(({ system }, order) => {
    if (system.status !== 'confirmed') return;
    const ids = system.staffs.map((staff) => (staff.partId && partIds.has(staff.partId) ? staff.partId : null));
    const sig = signature(system);
    if (!confirmed.has(sig)) confirmed.set(sig, []);
    confirmed.get(sig)!.push({ order, partIds: ids });
  });

  const next = new Map<string, SystemDoc>();
  systems.forEach(({ system }, order) => {
    if (system.status === 'confirmed') {
      const ids = system.staffs.map((staff) => (staff.partId && partIds.has(staff.partId) ? staff.partId : null));
      next.set(system.id, withPartIds(system, ids, 'confirmed'));
      return;
    }

    const candidates = confirmed.get(signature(system));
    if (candidates && candidates.length > 0) {
      const before = candidates.filter((c) => c.order < order);
      const source = before.length > 0 ? before[before.length - 1] : candidates[0];
      next.set(system.id, withPartIds(system, source.partIds, 'auto'));
      return;
    }

    const guess = guessLayout(system.staffs, doc.parts);
    next.set(system.id, withPartIds(system, guess.partIds, guess.clean ? 'auto' : 'review'));
  });

  let changed = false;
  const pages = doc.pages.map((page) => {
    let pageChanged = false;
    const updated = page.systems.map((system) => {
      const replacement = next.get(system.id) ?? system;
      if (replacement !== system) pageChanged = true;
      return replacement;
    });
    if (!pageChanged) return page;
    changed = true;
    return { ...page, systems: updated };
  });

  return changed ? { ...doc, pages } : doc;
}
