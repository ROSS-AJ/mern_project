// Rectangle math for region shapes. All values are page fractions.

import type { Rect } from '../model/types.ts';

const EPSILON = 1e-9;

export function bounds(rects: Rect[]): Rect {
  const left = Math.min(...rects.map((r) => r.x));
  const top = Math.min(...rects.map((r) => r.y));
  const right = Math.max(...rects.map((r) => r.x + r.w));
  const bottom = Math.max(...rects.map((r) => r.y + r.h));
  return { x: left, y: top, w: right - left, h: bottom - top };
}

/** Overlap length of two ranges (0 if they don't overlap). */
export function overlap1d(a0: number, a1: number, b0: number, b1: number): number {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

/** True when the rectangles overlap or touch. */
export function touches(a: Rect, b: Rect): boolean {
  return a.x <= b.x + b.w + EPSILON && b.x <= a.x + a.w + EPSILON && a.y <= b.y + b.h + EPSILON && b.y <= a.y + a.h + EPSILON;
}

export function shapesTouch(a: Rect[], b: Rect[]): boolean {
  return a.some((ra) => b.some((rb) => touches(ra, rb)));
}

/** `a` with `cut` removed, as up to four rectangles. */
export function subtract(a: Rect, cut: Rect): Rect[] {
  const left = Math.max(a.x, cut.x);
  const right = Math.min(a.x + a.w, cut.x + cut.w);
  const top = Math.max(a.y, cut.y);
  const bottom = Math.min(a.y + a.h, cut.y + cut.h);
  if (right - left <= EPSILON || bottom - top <= EPSILON) return [a];

  const pieces: Rect[] = [];
  if (top > a.y) pieces.push({ x: a.x, y: a.y, w: a.w, h: top - a.y });
  if (bottom < a.y + a.h) pieces.push({ x: a.x, y: bottom, w: a.w, h: a.y + a.h - bottom });
  if (left > a.x) pieces.push({ x: a.x, y: top, w: left - a.x, h: bottom - top });
  if (right < a.x + a.w) pieces.push({ x: right, y: top, w: a.x + a.w - right, h: bottom - top });
  return pieces.filter((p) => p.w > EPSILON && p.h > EPSILON);
}

/** A shape with every rectangle in `cuts` removed. */
export function subtractAll(rects: Rect[], cuts: Rect[]): Rect[] {
  let result = rects;
  for (const cut of cuts) result = result.flatMap((rect) => subtract(rect, cut));
  return result;
}

/**
 * SVG paths for a union of rectangles, scaled to `width` x `height` pixels.
 * `fill` covers the area once (no darker overlaps). `outline` traces only the
 * outer edges, so a merged shape shows no lines through its middle.
 */
export function unionPaths(rects: Rect[], width: number, height: number): { fill: string; outline: string } {
  const xs = [...new Set(rects.flatMap((r) => [r.x, r.x + r.w]))].sort((a, b) => a - b);
  const ys = [...new Set(rects.flatMap((r) => [r.y, r.y + r.h]))].sort((a, b) => a - b);
  const covered = (i: number, j: number) => {
    if (i < 0 || j < 0 || i >= xs.length - 1 || j >= ys.length - 1) return false;
    const cx = (xs[i] + xs[i + 1]) / 2;
    const cy = (ys[j] + ys[j + 1]) / 2;
    return rects.some((r) => cx > r.x && cx < r.x + r.w && cy > r.y && cy < r.y + r.h);
  };

  const fill: string[] = [];
  const outline: string[] = [];
  const X = (v: number) => (v * width).toFixed(1);
  const Y = (v: number) => (v * height).toFixed(1);
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < ys.length - 1; j++) {
      if (!covered(i, j)) continue;
      const [x0, x1, y0, y1] = [xs[i], xs[i + 1], ys[j], ys[j + 1]];
      fill.push(`M${X(x0)} ${Y(y0)}H${X(x1)}V${Y(y1)}H${X(x0)}Z`);
      if (!covered(i, j - 1)) outline.push(`M${X(x0)} ${Y(y0)}H${X(x1)}`);
      if (!covered(i, j + 1)) outline.push(`M${X(x0)} ${Y(y1)}H${X(x1)}`);
      if (!covered(i - 1, j)) outline.push(`M${X(x0)} ${Y(y0)}V${Y(y1)}`);
      if (!covered(i + 1, j)) outline.push(`M${X(x1)} ${Y(y0)}V${Y(y1)}`);
    }
  }
  return { fill: fill.join(''), outline: outline.join('') };
}
