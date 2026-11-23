import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export type PdfDocument = pdfjs.PDFDocumentProxy;

// PDF pages are measured in points, 72 per inch: 300 dpi = scale 300 / 72.
export const POINTS_PER_INCH = 72;

// Canvases past these limits silently render blank or patchy. Safari caps the
// total area at ~16.7M pixels; browsers cap each side. A page that would
// exceed them is rendered at a slightly lower dpi instead.
const MAX_CANVAS_AREA = 16_777_216;
const MAX_CANVAS_SIDE = 16_384;

export function loadPdf(bytes: Uint8Array): Promise<PdfDocument> {
  // pdf.js takes ownership of (detaches) the buffer it's given, so hand it a copy.
  return pdfjs.getDocument({ data: bytes.slice() }).promise;
}

/** Frees a loaded PDF (its worker data and caches). */
export function closePdf(pdf: PdfDocument | null | undefined): void {
  void pdf?.loadingTask.destroy();
}

export interface RenderedPage {
  canvas: HTMLCanvasElement;
  dpi: number;
}

/**
 * Renders one page onto a fresh white canvas. Always a fresh canvas: two
 * renders sharing a canvas is what produces patchy, half-drawn pages.
 */
export async function renderPage(
  pdf: PdfDocument,
  pageIndex: number,
  dpi: number,
  options: { signal?: AbortSignal; intent?: 'display' | 'print' } = {},
): Promise<RenderedPage | null> {
  const page = await pdf.getPage(pageIndex + 1);
  try {
    let scale = dpi / POINTS_PER_INCH;
    let viewport = page.getViewport({ scale });
    const shrink = Math.min(
      1,
      Math.sqrt(MAX_CANVAS_AREA / (viewport.width * viewport.height)),
      MAX_CANVAS_SIDE / viewport.width,
      MAX_CANVAS_SIDE / viewport.height,
    );
    if (shrink < 1) {
      scale *= shrink * 0.999;
      viewport = page.getViewport({ scale });
    }

    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    // No alpha + a white fill: transparent parts of the PDF come out as paper.
    const context = canvas.getContext('2d', { alpha: false, willReadFrequently: options.intent === 'print' });
    if (!context) throw new Error('Could not create a canvas');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);

    const task = page.render({
      canvas,
      canvasContext: context,
      viewport,
      background: 'rgb(255,255,255)',
      intent: options.intent ?? 'display',
    });
    const abort = () => task.cancel();
    options.signal?.addEventListener('abort', abort);
    try {
      await task.promise;
    } catch (error) {
      if ((error as Error)?.name === 'RenderingCancelledException') return null;
      throw error;
    } finally {
      options.signal?.removeEventListener('abort', abort);
    }
    if (options.signal?.aborted) return null;
    return { canvas, dpi: scale * POINTS_PER_INCH };
  } finally {
    page.cleanup();
  }
}

/** Page aspect ratio (height / width) without rendering. */
export async function pageAspect(pdf: PdfDocument, pageIndex: number): Promise<number> {
  const page = await pdf.getPage(pageIndex + 1);
  const viewport = page.getViewport({ scale: 1 });
  return viewport.height / viewport.width;
}
