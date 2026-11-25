// Builds part PDFs. Each source page is embedded once and drawn through a
// clip shaped like each piece (a band, a band plus attached text, a merged
// text region...), so the output keeps the original vector quality (or scan
// resolution) instead of being a screenshot. A clip made of several
// rectangles is their union, so overlapping areas are drawn only once.

import { PDFDocument, StandardFonts, clip, endPath, popGraphicsState, pushGraphicsState, rectangle, rgb } from 'pdf-lib';
import type { PDFEmbeddedPage, PDFFont, PDFPage } from 'pdf-lib';
import { partShapes } from '../engine/crop.ts';
import type { Shape, ShapeRect } from '../engine/crop.ts';
import type { Id, PageDoc, ProjectDoc } from '../model/types.ts';
import type { PdfDocument } from './render.ts';

const PAGE_WIDTH = 612; // US Letter, points
const PAGE_HEIGHT = 792;
const MARGIN = 36;
const SYSTEM_GAP = 14;
const PIECE_GAP = 2;

interface Box {
  left: number;
  bottom: number;
  right: number;
  top: number;
}

interface Viewport {
  width: number;
  height: number;
  convertToPdfPoint(x: number, y: number): number[];
}

/**
 * Page-fraction rectangle -> PDF user-space box. Band rectangles are in
 * deskewed space, so their corners are first rotated back by the deskew
 * angle (the box then covers the slightly tilted band).
 */
function toPdfBox(rect: ShapeRect, page: PageDoc, viewport: Viewport): Box {
  const corners = [
    [rect.x, rect.y],
    [rect.x + rect.w, rect.y],
    [rect.x, rect.y + rect.h],
    [rect.x + rect.w, rect.y + rect.h],
  ];
  const angle = rect.space === 'deskewed' ? (-page.angle * Math.PI) / 180 : 0;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const w = page.width || viewport.width;
  const h = page.height || viewport.height;

  const xs: number[] = [];
  const ys: number[] = [];
  for (const [fx, fy] of corners) {
    // Into pixel space, rotate about the center, back to fractions.
    const dx = fx * w - w / 2;
    const dy = fy * h - h / 2;
    const ox = (dx * cos - dy * sin + w / 2) / w;
    const oy = (dx * sin + dy * cos + h / 2) / h;
    const [px, py] = viewport.convertToPdfPoint(ox * viewport.width, oy * viewport.height);
    xs.push(px);
    ys.push(py);
  }
  return { left: Math.min(...xs), right: Math.max(...xs), bottom: Math.min(...ys), top: Math.max(...ys) };
}

function union(boxes: Box[]): Box {
  return {
    left: Math.min(...boxes.map((b) => b.left)),
    right: Math.max(...boxes.map((b) => b.right)),
    bottom: Math.min(...boxes.map((b) => b.bottom)),
    top: Math.max(...boxes.map((b) => b.top)),
  };
}

interface PlacedShape {
  shape: Shape;
  boxes: Box[];
  outer: Box;
}

interface PlacedGroup {
  shapes: PlacedShape[];
  height: number;
}

class PartWriter {
  private page: PDFPage | null = null;
  private cursor = 0;
  private pageNumber = 0;
  private readonly out: PDFDocument;
  private readonly font: PDFFont;
  private readonly bold: PDFFont;
  private readonly partName: string;
  private readonly title: string;

  constructor(out: PDFDocument, font: PDFFont, bold: PDFFont, partName: string, title: string) {
    this.out = out;
    this.font = font;
    this.bold = bold;
    this.partName = partName;
    this.title = title;
  }

  newPage() {
    this.page = this.out.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.pageNumber++;
    let top = PAGE_HEIGHT - MARGIN;
    if (this.pageNumber === 1) {
      this.page.drawText(this.partName, { x: MARGIN, y: top - 16, size: 16, font: this.bold, color: rgb(0.08, 0.1, 0.12) });
      if (this.title) {
        this.page.drawText(this.title, { x: MARGIN, y: top - 30, size: 9, font: this.font, color: rgb(0.4, 0.42, 0.45) });
      }
      top -= 42;
    } else {
      const header = this.title ? `${this.partName} · ${this.title}` : this.partName;
      this.page.drawText(header, { x: MARGIN, y: top - 9, size: 8, font: this.font, color: rgb(0.4, 0.42, 0.45) });
      const number = String(this.pageNumber);
      this.page.drawText(number, {
        x: PAGE_WIDTH - MARGIN - this.font.widthOfTextAtSize(number, 8),
        y: top - 9,
        size: 8,
        font: this.font,
        color: rgb(0.4, 0.42, 0.45),
      });
      top -= 18;
    }
    this.cursor = top;
  }

  place(group: PlacedGroup, scale: number, embedded: (page: number) => PDFEmbeddedPage, origins: Map<number, { left: number; bottom: number }>) {
    const available = PAGE_HEIGHT - MARGIN * 2 - 42;
    // A system taller than a whole page is shrunk to fit.
    const s = group.height * scale > available ? available / group.height : scale;
    if (!this.page || this.cursor - group.height * s < MARGIN) this.newPage();
    const page = this.page!;

    for (const { shape, boxes, outer } of group.shapes) {
      const origin = origins.get(shape.page)!;
      // Where the shape's outer box lands on the output page.
      const x = MARGIN + (outer.left - origin.left) * s;
      const y = this.cursor - (outer.top - outer.bottom) * s;

      const clipRects = boxes.map((box) =>
        rectangle(x + (box.left - outer.left) * s, y + (box.bottom - outer.bottom) * s, (box.right - box.left) * s, (box.top - box.bottom) * s),
      );
      page.pushOperators(pushGraphicsState(), ...clipRects, clip(), endPath());
      page.drawPage(embedded(shape.page), {
        x: x - (outer.left - origin.left) * s,
        y: y - (outer.bottom - origin.bottom) * s,
        xScale: s,
        yScale: s,
      });
      page.pushOperators(popGraphicsState());
      this.cursor = y - PIECE_GAP;
    }
    this.cursor -= SYSTEM_GAP - PIECE_GAP;
  }
}

/** One PDF containing each of the given parts, each starting on a new page. */
export async function buildPartsPdf(doc: ProjectDoc, sourceBytes: Uint8Array, pdf: PdfDocument, partIds: Id[]): Promise<Uint8Array> {
  const source = await PDFDocument.load(sourceBytes, { ignoreEncryption: true });
  const out = await PDFDocument.create();
  out.setTitle(doc.title);
  const font = await out.embedFont(StandardFonts.Helvetica);
  const bold = await out.embedFont(StandardFonts.HelveticaBold);

  const viewports = new Map<number, Viewport>();
  const origins = new Map<number, { left: number; bottom: number }>();
  const embeddedPages = new Map<number, PDFEmbeddedPage>();

  const viewportFor = async (index: number) => {
    if (!viewports.has(index)) {
      const page = await pdf.getPage(index + 1);
      viewports.set(index, page.getViewport({ scale: 1 }));
      const media = source.getPage(index).getMediaBox();
      origins.set(index, { left: media.x, bottom: media.y });
    }
    return viewports.get(index)!;
  };

  for (const partId of partIds) {
    const part = doc.parts.find((p) => p.id === partId);
    if (!part) continue;

    const groups: PlacedGroup[] = [];
    for (const group of partShapes(doc, partId)) {
      const shapes: PlacedShape[] = [];
      let height = 0;
      for (const shape of group) {
        if (shape.rects.length === 0) continue;
        const viewport = await viewportFor(shape.page);
        const boxes = shape.rects.map((rect) => toPdfBox(rect, doc.pages[shape.page], viewport));
        const outer = union(boxes);
        shapes.push({ shape, boxes, outer });
        height += outer.top - outer.bottom + PIECE_GAP;
        if (!embeddedPages.has(shape.page)) embeddedPages.set(shape.page, await out.embedPage(source.getPage(shape.page)));
      }
      if (shapes.length > 0) groups.push({ shapes, height });
    }

    // One scale for the whole part so every system is the same size.
    const widest = Math.max(
      1,
      ...groups.flatMap((g) => g.shapes.map(({ shape, outer }) => (shape.kind === 'band' ? outer.right - outer.left : 0))),
    );
    const scale = Math.min(1, (PAGE_WIDTH - MARGIN * 2) / widest);

    const writer = new PartWriter(out, font, bold, part.name || 'Untitled part', doc.title);
    if (groups.length === 0) {
      writer.newPage();
      continue;
    }
    for (const group of groups) writer.place(group, scale, (index) => embeddedPages.get(index)!, origins);
  }

  return out.save();
}

export function downloadBytes(bytes: Uint8Array, fileName: string, type = 'application/pdf') {
  const blob = new Blob([bytes as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'part';
}
