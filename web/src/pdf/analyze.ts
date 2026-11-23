// Runs detect() on a PDF page and converts the result into the editor's
// page-relative document format.

import { detect } from '../engine/detect.ts';
import { suggestRegions } from '../engine/suggest.ts';
import type { PageDoc, Region } from '../model/types.ts';
import { uid } from '../model/types.ts';
import type { PdfDocument } from './render.ts';
import { renderPage } from './render.ts';

export const DETECTION_DPI = 300;

export interface PageAnalysis {
  page: PageDoc;
  suggestions: Omit<Region, 'id'>[];
}

export async function analyzePage(pdf: PdfDocument, pageIndex: number, signal?: AbortSignal): Promise<PageAnalysis | null> {
  const rendered = await renderPage(pdf, pageIndex, DETECTION_DPI, { signal, intent: 'print' });
  if (!rendered) return null;

  const { canvas } = rendered;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Could not read the rendered page');
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  // Release the big canvas as soon as the pixels are copied out.
  canvas.width = 0;
  canvas.height = 0;

  const pixels = { data: image.data, width: image.width, height: image.height };
  // detect() reads the pixels without changing them; suggestRegions reuses them.
  const result = detect(pixels);
  const { imageWidth: width, imageHeight: height } = result;

  const page: PageDoc = {
    width,
    height,
    angle: result.angle,
    detected: true,
    systems: result.systems.map((system) => ({
      id: uid(),
      status: 'auto',
      staffs: system.staffs.map((staff) => ({
        id: uid(),
        top: staff.top / height,
        bottom: staff.bottom / height,
        spacing: staff.spacing / height,
        lineCount: staff.lines.length,
        partId: null,
      })),
    })),
  };

  const suggestions = suggestRegions(page, pageIndex, pixels, result.threshold);
  return { page, suggestions };
}
