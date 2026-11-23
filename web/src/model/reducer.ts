// All edits to a project go through here as named actions. To add a new kind
// of edit: add an action type, then a case in applyEdit. Undo/redo and
// re-running auto-assignment come for free.

import { autoAssign } from '../engine/assign.ts';
import { shapesTouch, subtractAll } from '../engine/geometry.ts';
import type { Id, PageDoc, Part, ProjectDoc, Rect, Region, RegionKind, Step, SystemDoc } from './types.ts';
import { migrateDoc, uid } from './types.ts';

/** Regions that merge when they touch: same page, same kind, same parts. */
function sameGroup(a: Region, b: Region): boolean {
  if (a.page !== b.page || a.kind !== b.kind) return false;
  if (a.kind === 'staff') return a.partId === b.partId;
  const key = (targets: Region['targets']) => (targets === 'all' ? 'all' : [...targets].sort().join(','));
  return key(a.targets) === key(b.targets);
}

/** The id the region will have after `draft` is drawn (so it can be selected). */
export function mergeTargetId(doc: ProjectDoc, draft: Region): Id {
  return doc.regions.find((region) => sameGroup(region, draft) && shapesTouch(region.rects, draft.rects))?.id ?? draft.id;
}

export type BoundaryTarget = { kind: 'above' } | { kind: 'below' } | { kind: 'between'; staffIndex: number };

export type EditAction =
  | { type: 'setTitle'; title: string }
  | { type: 'setParts'; parts: Part[] }
  | { type: 'assignStaff'; page: number; systemId: Id; staffId: Id; partId: Id | null }
  | { type: 'confirmSystems'; refs: { page: number; systemId: Id }[] }
  | { type: 'resetSystems'; refs: { page: number; systemId: Id }[] }
  | { type: 'applyLayoutToMatching'; page: number; systemId: Id }
  | { type: 'removeStaff'; page: number; systemId: Id; staffId: Id }
  | { type: 'addStaff'; page: number; y: number; lineCount: number }
  | { type: 'splitSystem'; page: number; systemId: Id; beforeStaff: number }
  | { type: 'joinWithNext'; page: number; systemId: Id }
  | { type: 'moveBoundary'; page: number; systemId: Id; target: BoundaryTarget; y: number }
  | { type: 'resetBoundaries'; page: number; systemId: Id }
  /** Add a drawn box; it merges into any touching region of the same kind. */
  | { type: 'drawRegion'; draft: Region }
  /** Alt-drag: cut a box out of every region of this kind on the page. */
  | { type: 'cutRegions'; page: number; kind: RegionKind; rect: Rect }
  | { type: 'updateRegion'; id: Id; patch: Partial<Omit<Region, 'id'>> }
  | { type: 'removeRegion'; id: Id }
  | { type: 'acceptSuggestions'; page?: number }
  | { type: 'rejectSuggestions'; page?: number }
  | { type: 'dismissIssue'; id: string };

export type Action =
  | { type: 'load'; doc: ProjectDoc }
  | { type: 'close' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'setStep'; step: Step }
  | { type: 'pageDetected'; index: number; page: PageDoc; suggestions: Omit<Region, 'id'>[] }
  /** coalesce: consecutive edits with the same key make one undo step (typing a name). */
  | { type: 'edit'; edit: EditAction; coalesce?: string };

export interface EditorState {
  doc: ProjectDoc | null;
  past: ProjectDoc[];
  future: ProjectDoc[];
  lastCoalesce: string | null;
}

export const initialState: EditorState = { doc: null, past: [], future: [], lastCoalesce: null };

const HISTORY_LIMIT = 100;

export function reducer(state: EditorState, action: Action): EditorState {
  switch (action.type) {
    case 'load':
      return { doc: autoAssign(migrateDoc(action.doc)), past: [], future: [], lastCoalesce: null };
    case 'close':
      return initialState;
    case 'undo': {
      if (!state.doc || state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      return {
        doc: previous,
        past: state.past.slice(0, -1),
        future: [state.doc, ...state.future],
        lastCoalesce: null,
      };
    }
    case 'redo': {
      if (!state.doc || state.future.length === 0) return state;
      return {
        doc: state.future[0],
        past: [...state.past, state.doc],
        future: state.future.slice(1),
        lastCoalesce: null,
      };
    }
    case 'setStep':
      if (!state.doc) return state;
      return { ...state, doc: { ...state.doc, step: action.step } };
    case 'pageDetected': {
      // Detection isn't an undoable edit; it fills in data that wasn't there.
      if (!state.doc) return state;
      const doc = state.doc;
      const pages = doc.pages.slice();
      pages[action.index] = action.page;
      const regions = [
        ...doc.regions.filter((region) => !(region.page === action.index && region.suggested)),
        ...action.suggestions.map((suggestion) => ({ ...suggestion, id: uid() })),
      ];
      return { ...state, doc: autoAssign({ ...doc, pages, regions }) };
    }
    case 'edit': {
      if (!state.doc) return state;
      const edited = applyEdit(state.doc, action.edit);
      if (edited === state.doc) return state;
      const doc = autoAssign({ ...edited, updatedAt: Date.now() });
      const merge = action.coalesce !== undefined && action.coalesce === state.lastCoalesce;
      return {
        doc,
        past: merge ? state.past : [...state.past, state.doc].slice(-HISTORY_LIMIT),
        future: [],
        lastCoalesce: action.coalesce ?? null,
      };
    }
  }
}

// ---------- helpers ----------

function updateSystem(doc: ProjectDoc, page: number, systemId: Id, change: (system: SystemDoc) => SystemDoc): ProjectDoc {
  const target = doc.pages[page];
  if (!target) return doc;
  const index = target.systems.findIndex((system) => system.id === systemId);
  if (index === -1) return doc;
  const systems = target.systems.slice();
  systems[index] = change(systems[index]);
  return replacePage(doc, page, { ...target, systems });
}

function replacePage(doc: ProjectDoc, index: number, page: PageDoc): ProjectDoc {
  const pages = doc.pages.slice();
  pages[index] = page;
  return { ...doc, pages };
}

function medianSpacing(page: PageDoc): number {
  const values = page.systems.flatMap((system) => system.staffs.map((staff) => staff.spacing)).sort((a, b) => a - b);
  return values.length > 0 ? values[Math.floor(values.length / 2)] : 0.008;
}

// ---------- edits ----------

function applyEdit(doc: ProjectDoc, edit: EditAction): ProjectDoc {
  switch (edit.type) {
    case 'setTitle':
      return { ...doc, title: edit.title };

    case 'setParts':
      return { ...doc, parts: edit.parts };

    case 'assignStaff': {
      // Picking a 2-staff part (piano) also fills the staff below it.
      const part = doc.parts.find((p) => p.id === edit.partId);
      return updateSystem(doc, edit.page, edit.systemId, (system) => {
        const start = system.staffs.findIndex((staff) => staff.id === edit.staffId);
        if (start === -1) return system;
        const count = part ? Math.min(part.staffCount, system.staffs.length - start) : 1;
        return {
          ...system,
          status: 'confirmed',
          staffs: system.staffs.map((staff, index) =>
            index >= start && index < start + count ? { ...staff, partId: edit.partId } : staff,
          ),
        };
      });
    }

    case 'confirmSystems': {
      let result = doc;
      for (const ref of edit.refs) {
        result = updateSystem(result, ref.page, ref.systemId, (system) => ({ ...system, status: 'confirmed' }));
      }
      return result;
    }

    case 'resetSystems': {
      let result = doc;
      for (const ref of edit.refs) {
        result = updateSystem(result, ref.page, ref.systemId, (system) => ({ ...system, status: 'auto' }));
      }
      return result;
    }

    case 'applyLayoutToMatching': {
      const source = doc.pages[edit.page]?.systems.find((system) => system.id === edit.systemId);
      if (!source) return doc;
      const pattern = source.staffs.map((staff) => staff.lineCount).join(',');
      const partIds = source.staffs.map((staff) => staff.partId);
      const pages = doc.pages.map((page) => ({
        ...page,
        systems: page.systems.map((system) =>
          system.staffs.map((staff) => staff.lineCount).join(',') === pattern
            ? { ...system, status: 'confirmed' as const, staffs: system.staffs.map((staff, i) => ({ ...staff, partId: partIds[i] })) }
            : system,
        ),
      }));
      return { ...doc, pages };
    }

    case 'removeStaff': {
      const page = doc.pages[edit.page];
      if (!page) return doc;
      const systems = page.systems
        .map((system) =>
          system.id === edit.systemId
            ? { ...system, status: 'confirmed' as const, staffs: system.staffs.filter((staff) => staff.id !== edit.staffId) }
            : system,
        )
        .filter((system) => system.staffs.length > 0);
      return replacePage(doc, edit.page, { ...page, systems });
    }

    case 'addStaff': {
      const page = doc.pages[edit.page];
      if (!page) return doc;
      const spacing = medianSpacing(page);
      const height = edit.lineCount === 1 ? 0 : spacing * 4;
      const staff = {
        id: uid(),
        top: edit.y - height / 2,
        bottom: edit.y + height / 2,
        spacing,
        lineCount: edit.lineCount,
        partId: null,
      };
      // Into the system it lands in (or right next to), else a new system.
      const reach = spacing * 8;
      const systemIndex = page.systems.findIndex(
        (system) => edit.y >= system.staffs[0].top - reach && edit.y <= system.staffs[system.staffs.length - 1].bottom + reach,
      );
      let systems: SystemDoc[];
      if (systemIndex === -1) {
        systems = [...page.systems, { id: uid(), status: 'auto' as const, staffs: [staff] }];
      } else {
        systems = page.systems.slice();
        const system = systems[systemIndex];
        systems[systemIndex] = {
          ...system,
          status: 'auto',
          staffs: [...system.staffs, staff].sort((a, b) => a.top - b.top),
        };
      }
      systems.sort((a, b) => a.staffs[0].top - b.staffs[0].top);
      return replacePage(doc, edit.page, { ...page, systems });
    }

    case 'splitSystem': {
      const page = doc.pages[edit.page];
      if (!page) return doc;
      const index = page.systems.findIndex((system) => system.id === edit.systemId);
      const system = page.systems[index];
      if (!system || edit.beforeStaff <= 0 || edit.beforeStaff >= system.staffs.length) return doc;
      const upper: SystemDoc = { ...system, staffs: system.staffs.slice(0, edit.beforeStaff), bandBottom: undefined };
      const lower: SystemDoc = {
        id: uid(),
        status: system.status,
        staffs: system.staffs.slice(edit.beforeStaff).map((staff, i) => (i === 0 ? { ...staff, splitAbove: undefined } : staff)),
        bandBottom: system.bandBottom,
      };
      const systems = page.systems.slice();
      systems.splice(index, 1, upper, lower);
      return replacePage(doc, edit.page, { ...page, systems });
    }

    case 'joinWithNext': {
      const page = doc.pages[edit.page];
      if (!page) return doc;
      const index = page.systems.findIndex((system) => system.id === edit.systemId);
      const system = page.systems[index];
      const next = page.systems[index + 1];
      if (!system || !next) return doc;
      const joined: SystemDoc = {
        ...system,
        status: 'auto',
        staffs: [...system.staffs, ...next.staffs],
        bandBottom: next.bandBottom,
      };
      const systems = page.systems.slice();
      systems.splice(index, 2, joined);
      return replacePage(doc, edit.page, { ...page, systems });
    }

    case 'moveBoundary':
      return updateSystem(doc, edit.page, edit.systemId, (system) => {
        const target = edit.target;
        if (target.kind === 'above') return { ...system, bandTop: edit.y };
        if (target.kind === 'below') return { ...system, bandBottom: edit.y };
        return {
          ...system,
          staffs: system.staffs.map((staff, i) => (i === target.staffIndex + 1 ? { ...staff, splitAbove: edit.y } : staff)),
        };
      });

    case 'resetBoundaries':
      return updateSystem(doc, edit.page, edit.systemId, (system) => ({
        ...system,
        bandTop: undefined,
        bandBottom: undefined,
        staffs: system.staffs.map((staff) => ({ ...staff, splitAbove: undefined })),
      }));

    case 'drawRegion': {
      // Merge with every region of the same kind (and same parts) the new box
      // touches, so overlapping boxes become one shape.
      const { draft } = edit;
      const merging = doc.regions.filter((region) => sameGroup(region, draft) && shapesTouch(region.rects, draft.rects));
      if (merging.length === 0) return { ...doc, regions: [...doc.regions, draft] };
      const merged: Region = {
        ...merging[0],
        suggested: false, // drawing onto a suggestion accepts it
        rects: [...merging.flatMap((region) => region.rects), ...draft.rects],
      };
      const ids = new Set(merging.map((region) => region.id));
      return { ...doc, regions: [...doc.regions.filter((region) => !ids.has(region.id) || region.id === merged.id).map((region) => (region.id === merged.id ? merged : region))] };
    }

    case 'cutRegions': {
      // Remove a box from every region of this kind it touches.
      const regions = doc.regions
        .map((region) =>
          region.page === edit.page && region.kind === edit.kind ? { ...region, rects: subtractAll(region.rects, [edit.rect]) } : region,
        )
        .filter((region) => region.rects.length > 0);
      return { ...doc, regions };
    }

    case 'updateRegion':
      return { ...doc, regions: doc.regions.map((region) => (region.id === edit.id ? { ...region, ...edit.patch } : region)) };

    case 'removeRegion':
      return { ...doc, regions: doc.regions.filter((region) => region.id !== edit.id) };

    case 'acceptSuggestions':
      return {
        ...doc,
        regions: doc.regions.map((region) =>
          region.suggested && (edit.page === undefined || region.page === edit.page) ? { ...region, suggested: false } : region,
        ),
      };

    case 'rejectSuggestions':
      return {
        ...doc,
        regions: doc.regions.filter((region) => !(region.suggested && (edit.page === undefined || region.page === edit.page))),
      };

    case 'dismissIssue':
      return { ...doc, dismissedIssues: [...doc.dismissedIssues, edit.id] };
  }
}
