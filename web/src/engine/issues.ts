// Things the editor should point out to the user.

import type { ProjectDoc } from '../model/types.ts';
import { allSystems } from '../model/types.ts';
import { expectedStaffCount } from './assign.ts';

export interface Issue {
  id: string;
  kind: 'part-count' | 'odd-system' | 'unused-part' | 'no-parts';
  message: string;
  page?: number;
  systemId?: string;
}

export interface StaffCountSummary {
  /** staff count -> number of systems with that many staffs */
  counts: Map<number, number>;
  mostCommon: number | null;
  systems: number;
}

export function staffCountSummary(doc: ProjectDoc): StaffCountSummary {
  const counts = new Map<number, number>();
  const systems = allSystems(doc);
  for (const { system } of systems) {
    counts.set(system.staffs.length, (counts.get(system.staffs.length) ?? 0) + 1);
  }
  let mostCommon: number | null = null;
  for (const [count, total] of counts) {
    if (mostCommon === null || total > (counts.get(mostCommon) ?? 0)) mostCommon = count;
  }
  return { counts, mostCommon, systems: systems.length };
}

export function findIssues(doc: ProjectDoc): Issue[] {
  const issues: Issue[] = [];
  const systems = allSystems(doc);
  const expected = expectedStaffCount(doc.parts);

  if (doc.parts.length === 0) {
    issues.push({ id: 'no-parts', kind: 'no-parts', message: 'Add your parts so staffs can be assigned.' });
  }

  // The part list disagrees with most of the score.
  const summary = staffCountSummary(doc);
  if (doc.parts.length > 0 && summary.mostCommon !== null && summary.systems >= 3) {
    const share = (summary.counts.get(summary.mostCommon) ?? 0) / summary.systems;
    if (summary.mostCommon !== expected && share >= 0.5) {
      const diff = summary.mostCommon - expected;
      issues.push({
        id: `part-count:${summary.mostCommon}:${expected}`,
        kind: 'part-count',
        message:
          diff > 0
            ? `Most systems have ${summary.mostCommon} staffs, but your parts add up to ${expected}. A part may be missing from your list.`
            : `Most systems have ${summary.mostCommon} staffs, but your parts add up to ${expected}. Your list may have an extra part, or a part's staff count is off.`,
      });
    }
  }

  // A system whose staff count differs from both neighbors, which usually means
  // a missed or extra staff in detection.
  for (let i = 1; i < systems.length - 1; i++) {
    const { system, page } = systems[i];
    if (system.status === 'confirmed') continue;
    const before = systems[i - 1].system.staffs.length;
    const after = systems[i + 1].system.staffs.length;
    const count = system.staffs.length;
    if (before === after && count !== before) {
      issues.push({
        id: `odd-system:${system.id}:${count}`,
        kind: 'odd-system',
        page,
        systemId: system.id,
        message: `This system has ${count} staff${count === 1 ? '' : 's'} but the ones around it have ${before}. A staff may have been ${count < before ? 'missed' : 'added by mistake'}.`,
      });
    }
  }

  // Parts that never appear.
  if (systems.length > 0) {
    const used = new Set<string>();
    for (const { system } of systems) for (const staff of system.staffs) if (staff.partId) used.add(staff.partId);
    for (const part of doc.parts) {
      if (!used.has(part.id)) {
        issues.push({ id: `unused-part:${part.id}`, kind: 'unused-part', message: `${part.name || 'A part'} isn't assigned to any staff yet.` });
      }
    }
  }

  return issues.filter((issue) => !doc.dismissedIssues.includes(issue.id));
}
