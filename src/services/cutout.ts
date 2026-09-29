import { boxBlur, createRGBAImage, type RGBAImage } from '../utils/pixels';
import type { Point } from '../types/Editor.types';
import { rasterizePolygon } from './surface';

/**
 * Cutting a plant out of a photo for use as a custom catalog item.
 * The user outlines the plant and/or taps background areas to erase
 * contiguous similar colors (a "magic eraser"). Canvas-free for testing.
 */

/** Largest RGB distance (black to white). */
const MAX_COLOR_DISTANCE = Math.sqrt(3 * 255 * 255);

/**
 * Marks pixels connected to (x, y) whose color is within `tolerance`
 * (0..1) of the tapped color. Returns 1 for erased pixels.
 */
export function floodSelect(image: RGBAImage, x: number, y: number, tolerance: number): Uint8Array {
  const { width, height, data } = image;
  const selected = new Uint8Array(width * height);
  const sx = Math.floor(x);
  const sy = Math.floor(y);
  if (sx < 0 || sy < 0 || sx >= width || sy >= height) return selected;
  const seed = (sy * width + sx) * 4;
  const r0 = data[seed];
  const g0 = data[seed + 1];
  const b0 = data[seed + 2];
  const limit = (tolerance * MAX_COLOR_DISTANCE) ** 2;
  const matches = (i: number) => {
    const p = i * 4;
    const dr = data[p] - r0;
    const dg = data[p + 1] - g0;
    const db = data[p + 2] - b0;
    return data[p + 3] > 0 && dr * dr + dg * dg + db * db <= limit;
  };
  // Explicit stack: recursion would overflow on large regions.
  const stack = [sy * width + sx];
  selected[stack[0]] = 1;
  while (stack.length) {
    const i = stack.pop()!;
    const px = i % width;
    const neighbors = [px > 0 ? i - 1 : -1, px < width - 1 ? i + 1 : -1, i - width, i + width];
    for (const n of neighbors) {
      if (n < 0 || n >= selected.length || selected[n] || !matches(n)) continue;
      selected[n] = 1;
      stack.push(n);
    }
  }
  return selected;
}

export interface CutoutOptions {
  /** Outline around the plant; everything outside is removed. Optional. */
  outline: readonly Point[] | null;
  /** Pixels erased with the magic eraser (1 = erased). */
  erased: Uint8Array | null;
  /** Edge softening radius in pixels. */
  feather: number;
}

export interface CutoutResult {
  image: RGBAImage;
  /** Offset of the trimmed result within the source photo. */
  x: number;
  y: number;
}

/** Applies outline + eraser, softens the edge, and trims to the remaining pixels. */
export function makeCutout(source: RGBAImage, options: CutoutOptions): CutoutResult | null {
  const { width, height } = source;
  const alpha =
    options.outline && options.outline.length >= 3
      ? rasterizePolygon(options.outline, { x: 0, y: 0, width, height })
      : new Float32Array(width * height).fill(1);
  if (options.erased) {
    for (let i = 0; i < alpha.length; i++) if (options.erased[i]) alpha[i] = 0;
  }
  if (options.feather >= 1) boxBlur(alpha, width, height, options.feather);

  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (alpha[y * width + x] * (source.data[(y * width + x) * 4 + 3] / 255) < 0.04) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return null;

  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const out = createRGBAImage(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = (y + y0) * width + x + x0;
      const o = (y * w + x) * 4;
      out.data[o] = source.data[si * 4];
      out.data[o + 1] = source.data[si * 4 + 1];
      out.data[o + 2] = source.data[si * 4 + 2];
      out.data[o + 3] = Math.min(1, alpha[si]) * source.data[si * 4 + 3];
    }
  }
  return { image: out, x: x0, y: y0 };
}
