// The editor's document. Everything here is plain JSON so it can be saved
// as-is (IndexedDB today, the Project API's pageLayout later).
//
// Coordinates are fractions of the page (0–1), so they don't depend on the
// resolution a page was rendered at.
//   - Systems and staffs are in DESKEWED page space (what detect() returns).
//   - Regions are in ORIGINAL page space (what the user sees and draws on).
// For normal scans the deskew angle is a fraction of a degree, so the two are
// nearly identical; export maps both back to the original PDF exactly.

export type Id = string;

export interface Part {
  id: Id;
  name: string;
  color: string;
  /** Staffs per system: 1 for most instruments, 2 for piano/harp, 3 for organ. */
  staffCount: number;
  /** Percussion parts are preferred for 1-line staffs. */
  percussion: boolean;
}

export interface StaffDoc {
  id: Id;
  /** Top and bottom staff line, as fractions of page height. Equal for a 1-line staff. */
  top: number;
  bottom: number;
  /** Distance between staff lines, as a fraction of page height. */
  spacing: number;
  /** 5, or 1 for a percussion line. */
  lineCount: number;
  /** null = not assigned to any part (left out of every part). */
  partId: Id | null;
  /** User-moved crop boundary between this staff and the one above it in the system. */
  splitAbove?: number;
}

/**
 * auto      = matched the part list cleanly, or repeated a confirmed layout
 * review    = a best guess; the staff count didn't match, so the user should check it
 * confirmed = the user set or confirmed it; never changed automatically
 */
export type SystemStatus = 'auto' | 'review' | 'confirmed';

export interface SystemDoc {
  id: Id;
  staffs: StaffDoc[];
  status: SystemStatus;
  /** User-moved crop boundaries above the first staff and below the last. */
  bandTop?: number;
  bandBottom?: number;
}

export interface PageDoc {
  /** Size in pixels at detection resolution (only the ratio really matters). */
  width: number;
  height: number;
  /** Deskew angle in degrees from detect(). */
  angle: number;
  detected: boolean;
  systems: SystemDoc[];
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * shared = text copied to every chosen part (tempo, rehearsal letters, titles)
 * staff  = text that belongs to one part's staff (a dynamic hanging below it,
 *          high notes poking up). It joins that part's band and is cut out of
 *          any other part's band it overlaps.
 */
export type RegionKind = 'shared' | 'staff';

/**
 * A shape made of one or more rectangles. Overlapping boxes drawn with the
 * same tool merge into one region, so the shape is exported once, as a
 * whole, and nothing inside it can be duplicated.
 */
export interface Region {
  id: Id;
  page: number;
  kind: RegionKind;
  rects: Rect[];
  /** Shared text: which parts get it. */
  targets: 'all' | Id[];
  /** Staff text: the part it belongs to. */
  partId: Id | null;
  /** Suggested automatically and not yet accepted. Ignored by export until accepted. */
  suggested: boolean;
}

export type Step = 'setup' | 'assign' | 'export';

export interface ProjectDoc {
  id: Id;
  title: string;
  fileName: string;
  pageCount: number;
  createdAt: number;
  updatedAt: number;
  step: Step;
  parts: Part[];
  pages: PageDoc[];
  regions: Region[];
  dismissedIssues: string[];
}

export interface SystemRef {
  page: number;
  systemId: Id;
}

export function uid(): Id {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function systemTop(system: SystemDoc): number {
  return system.staffs[0].top;
}

export function systemBottom(system: SystemDoc): number {
  return system.staffs[system.staffs.length - 1].bottom;
}

/** Every system in reading order. */
export function allSystems(doc: ProjectDoc): { page: number; index: number; system: SystemDoc }[] {
  const list: { page: number; index: number; system: SystemDoc }[] = [];
  doc.pages.forEach((page, pageIndex) => {
    page.systems.forEach((system, index) => list.push({ page: pageIndex, index, system }));
  });
  return list;
}

/**
 * Brings projects saved by older versions up to date. Older regions were a
 * single box (x, y, w, h) and always shared text.
 */
export function migrateDoc(doc: ProjectDoc): ProjectDoc {
  const regions = doc.regions.map((region) => {
    const old = region as Partial<Region> & Partial<Rect>;
    if (Array.isArray(old.rects)) return region;
    return {
      id: region.id,
      page: region.page,
      kind: 'shared' as const,
      rects: [{ x: old.x ?? 0, y: old.y ?? 0, w: old.w ?? 0, h: old.h ?? 0 }],
      targets: old.targets ?? 'all',
      partId: null,
      suggested: old.suggested ?? false,
    };
  });
  return { ...doc, regions };
}

export function emptyPage(): PageDoc {
  return { width: 0, height: 0, angle: 0, detected: false, systems: [] };
}
