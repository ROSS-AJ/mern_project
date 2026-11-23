// Suggests shared-text regions: ink sitting above a system, such as tempo
// markings, rehearsal letters, and the title block on the first page. These
// are only suggestions; the user accepts or rejects them in the editor.

import type { PageDoc, Region } from '../model/types.ts';
import { systemBottom, systemTop } from '../model/types.ts';

export interface RgbaPixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** Ink this close above the top staff is assumed to be notes/ledger lines, not text. */
const CLEARANCE_SPACES = 2.5;
/** Ink this close below the previous system is assumed to belong to it. */
const PREVIOUS_CLEARANCE_SPACES = 4;

export function suggestRegions(page: PageDoc, pageIndex: number, pixels: RgbaPixels, threshold: number): Omit<Region, 'id'>[] {
  const { data, width, height } = pixels;
  const suggestions: Omit<Region, 'id'>[] = [];
  const isInk = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2] <= threshold;
  };

  page.systems.forEach((system, index) => {
    const spacing = system.staffs[0].spacing;
    const previous = page.systems[index - 1];
    const zoneTop = previous ? systemBottom(previous) + spacing * PREVIOUS_CLEARANCE_SPACES : 0.02;
    const zoneBottom = systemTop(system) - spacing * CLEARANCE_SPACES;
    if (zoneBottom - zoneTop < spacing) return;

    const y0 = Math.max(0, Math.floor(zoneTop * height));
    const y1 = Math.min(height - 1, Math.ceil(zoneBottom * height));
    const minInk = Math.max(2, Math.round(width * 0.001));

    // Rows with ink, from the bottom of the zone upwards.
    const inkRows: boolean[] = [];
    for (let y = y0; y <= y1; y++) {
      let count = 0;
      for (let x = 0; x < width && count < minInk; x += 1) if (isInk(x, y)) count++;
      inkRows[y - y0] = count >= minInk;
    }

    // First page: take everything in the zone (title, composer, tempo).
    // Other systems: take the block of ink nearest the system, allowing small
    // gaps between lines of text.
    const gapAllowed = Math.round(spacing * height * 1.5);
    let blockBottom = -1;
    let blockTop = -1;
    let gap = 0;
    for (let r = inkRows.length - 1; r >= 0; r--) {
      if (inkRows[r]) {
        if (blockBottom === -1) blockBottom = r;
        blockTop = r;
        gap = 0;
      } else if (blockBottom !== -1) {
        gap++;
        const keepGoing = pageIndex === 0 && index === 0;
        if (!keepGoing && gap > gapAllowed) break;
      }
    }
    if (blockBottom === -1) return;

    // Text sitting low (close to the staff) gets cut by the zone's bottom edge.
    // Let the block keep growing downward while its ink continues, stopping
    // one staff-space above the top staff line.
    if (blockBottom === inkRows.length - 1) {
      const limit = Math.floor((systemTop(system) - spacing) * height);
      let y = y0 + blockBottom + 1;
      const rowHasInk = (row: number) => {
        let count = 0;
        for (let x = 0; x < width && count < minInk; x++) if (isInk(x, row)) count++;
        return count >= minInk;
      };
      while (y <= limit && rowHasInk(y)) y++;
      blockBottom = y - 1 - y0;
    }

    if ((blockBottom - blockTop) / height < spacing * 0.5) return;

    let left = width;
    let right = -1;
    for (let y = y0 + blockTop; y <= y0 + blockBottom; y++) {
      for (let x = 0; x < width; x++) {
        if (isInk(x, y)) {
          if (x < left) left = x;
          if (x > right) right = x;
        }
      }
    }
    if (right < left) return;

    const pad = spacing * 0.5;
    const padX = pad * (height / width);
    const x = Math.max(0, left / width - padX);
    const y = Math.max(0, (y0 + blockTop) / height - pad);
    suggestions.push({
      page: pageIndex,
      kind: 'shared',
      rects: [
        {
          x,
          y,
          w: Math.min(1, (right + 1) / width + padX) - x,
          h: Math.min(systemTop(system), (y0 + blockBottom + 1) / height + pad) - y,
        },
      ],
      targets: 'all',
      partId: null,
      suggested: true,
    });
  });

  return suggestions;
}
