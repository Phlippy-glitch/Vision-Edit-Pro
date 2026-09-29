import { boxBlur, createRGBAImage, type RGBAImage } from '../utils/pixels';

/**
 * Object removal ("subtract a feature").
 *
 * 1. Search the surroundings for an offset whose pixels best continue the
 *    ring just outside the masked region (like a content-aware patch tool).
 * 2. Copy that source texture over the mask.
 * 3. Correct color/lighting with a membrane: the difference between the
 *    target ring and the source ring is interpolated smoothly across the
 *    mask (a Laplace solve on a coarse grid), so the patch matches its
 *    surroundings without visible seams.
 *
 * Several distinct offsets are kept so the user can cycle through
 * alternatives when the first pick is not convincing.
 */

export interface InpaintResult {
  x: number;
  y: number;
  image: RGBAImage;
  /** Number of distinct source candidates available for `candidateIndex`. */
  candidateCount: number;
}

interface Offset {
  dx: number;
  dy: number;
  score: number;
}

const MAX_SAMPLES = 1500;
const MAX_CANDIDATES = 6;
const COARSE_GRID = 112;

export function inpaint(src: RGBAImage, mask: Uint8Array, candidateIndex = 0): InpaintResult | null {
  const { width: W, height: H } = src;
  const box = maskBounds(mask, W, H);
  if (!box) return null;
  const maskW = box.x1 - box.x0;
  const maskH = box.y1 - box.y0;
  const maxDim = Math.max(maskW, maskH);

  // Coarse grid factor for the membrane; the ring must be at least two
  // coarse cells wide so every masked cell borders known data.
  const cell = Math.max(1, Math.ceil(maxDim / COARSE_GRID));
  const ringWidth = Math.max(6, cell * 2 + 2);

  const rx0 = Math.max(0, box.x0 - ringWidth);
  const ry0 = Math.max(0, box.y0 - ringWidth);
  const rx1 = Math.min(W, box.x1 + ringWidth);
  const ry1 = Math.min(H, box.y1 + ringWidth);
  const rw = rx1 - rx0;
  const rh = ry1 - ry0;

  const localMask = new Float32Array(rw * rh);
  for (let y = 0; y < rh; y++) {
    for (let x = 0; x < rw; x++) {
      localMask[y * rw + x] = mask[(y + ry0) * W + x + rx0];
    }
  }
  const dilated = Float32Array.from(localMask);
  boxBlur(dilated, rw, rh, ringWidth);
  const isRing = new Uint8Array(rw * rh);
  const ringIdx: number[] = [];
  const maskIdx: number[] = [];
  for (let i = 0; i < rw * rh; i++) {
    if (localMask[i]) maskIdx.push(i);
    else if (dilated[i] > 1e-4) {
      isRing[i] = 1;
      ringIdx.push(i);
    }
  }
  if (ringIdx.length === 0) return null;

  const ringSamples = subsample(ringIdx, MAX_SAMPLES).map((i) => toGlobal(i, rw, rx0, ry0, W));
  const maskSamples = subsample(maskIdx, MAX_SAMPLES).map((i) => toGlobal(i, rw, rx0, ry0, W));
  const region = { x0: rx0, y0: ry0, x1: rx1, y1: ry1 };

  const step = Math.max(2, Math.round(maxDim / 5));
  const reach = Math.round(maxDim * 2.5) + ringWidth * 2;
  const ctx: SearchContext = { src, mask, region, ringSamples, maskSamples, maxDim };

  const scored: Offset[] = [];
  for (let dy = -reach; dy <= reach; dy += step) {
    for (let dx = -reach; dx <= reach; dx += step) {
      const score = scoreOffset(ctx, dx, dy);
      if (score !== null) scored.push({ dx, dy, score });
    }
  }
  if (scored.length === 0) return null;
  scored.sort((a, b) => a.score - b.score);

  const picks: Offset[] = [];
  for (const cand of scored) {
    const distinct = picks.every((p) => Math.abs(p.dx - cand.dx) > step * 1.5 || Math.abs(p.dy - cand.dy) > step * 1.5);
    if (distinct) picks.push(cand);
    if (picks.length === MAX_CANDIDATES) break;
  }
  const chosen = refine(ctx, picks[candidateIndex % picks.length], step);

  // Copy source pixels and record the ring color difference (target - source).
  const out = createRGBAImage(rw, rh);
  const copy = new Float32Array(rw * rh * 3);
  const cw = Math.ceil(rw / cell);
  const ch = Math.ceil(rh / cell);
  const diffSum = new Float32Array(cw * ch * 3);
  const ringCount = new Uint32Array(cw * ch);
  const maskCount = new Uint32Array(cw * ch);
  for (let y = 0; y < rh; y++) {
    for (let x = 0; x < rw; x++) {
      const i = y * rw + x;
      const t = ((y + ry0) * W + x + rx0) * 4;
      const s = ((y + ry0 + chosen.dy) * W + x + rx0 + chosen.dx) * 4;
      const c = Math.floor(y / cell) * cw + Math.floor(x / cell);
      for (let k = 0; k < 3; k++) copy[i * 3 + k] = src.data[s + k];
      if (localMask[i]) {
        maskCount[c]++;
      } else if (isRing[i]) {
        ringCount[c]++;
        for (let k = 0; k < 3; k++) diffSum[c * 3 + k] += src.data[t + k] - src.data[s + k];
      }
    }
  }

  const known = new Uint8Array(cw * ch);
  const membrane = new Float32Array(cw * ch * 3);
  for (let c = 0; c < cw * ch; c++) {
    if (ringCount[c] > 0 && maskCount[c] === 0) {
      known[c] = 1;
      for (let k = 0; k < 3; k++) membrane[c * 3 + k] = diffSum[c * 3 + k] / ringCount[c];
    }
  }
  solveMembrane(membrane, known, cw, ch);

  const alpha = Float32Array.from(localMask);
  boxBlur(alpha, rw, rh, 1);
  for (let i = 0; i < alpha.length; i++) alpha[i] = alpha[i] > 0 ? 1 : 0;
  boxBlur(alpha, rw, rh, 1.5);
  boxBlur(alpha, rw, rh, 1.5);

  const d = new Float32Array(3);
  for (let y = 0; y < rh; y++) {
    for (let x = 0; x < rw; x++) {
      const i = y * rw + x;
      if (alpha[i] <= 0.004) continue;
      sampleGrid(membrane, cw, ch, (x + 0.5) / cell - 0.5, (y + 0.5) / cell - 0.5, d);
      const o = i * 4;
      out.data[o] = copy[i * 3] + d[0];
      out.data[o + 1] = copy[i * 3 + 1] + d[1];
      out.data[o + 2] = copy[i * 3 + 2] + d[2];
      out.data[o + 3] = Math.min(1, alpha[i]) * 255;
    }
  }
  return { x: rx0, y: ry0, image: out, candidateCount: picks.length };
}

interface SearchContext {
  src: RGBAImage;
  mask: Uint8Array;
  region: { x0: number; y0: number; x1: number; y1: number };
  ringSamples: number[];
  maskSamples: number[];
  maxDim: number;
}

/** Mean squared ring mismatch, or null if the offset is unusable. */
function scoreOffset(ctx: SearchContext, dx: number, dy: number): number | null {
  const { src, mask, region, ringSamples, maskSamples } = ctx;
  const W = src.width;
  if (region.x0 + dx < 0 || region.y0 + dy < 0 || region.x1 + dx > W || region.y1 + dy > src.height) {
    return null;
  }
  const shift = dy * W + dx;
  // Sources must come from real (unmasked) pixels.
  for (const g of maskSamples) if (mask[g + shift]) return null;
  let sum = 0;
  for (const g of ringSamples) {
    if (mask[g + shift]) return null;
    const a = g * 4;
    const b = (g + shift) * 4;
    const r = src.data[a] - src.data[b];
    const gr = src.data[a + 1] - src.data[b + 1];
    const bl = src.data[a + 2] - src.data[b + 2];
    sum += r * r + gr * gr + bl * bl;
  }
  // Prefer nearby sources, especially on the same row: in yard photos
  // texture scale changes with depth (vertical position).
  const distancePenalty = 1 + (0.3 * Math.hypot(dx, dy * 2)) / ctx.maxDim;
  return (sum / ringSamples.length + 1) * distancePenalty;
}

function refine(ctx: SearchContext, start: Offset, step: number): Offset {
  let best = start;
  const half = Math.ceil(step / 2);
  for (let dy = start.dy - half; dy <= start.dy + half; dy++) {
    for (let dx = start.dx - half; dx <= start.dx + half; dx++) {
      const score = scoreOffset(ctx, dx, dy);
      if (score !== null && score < best.score) best = { dx, dy, score };
    }
  }
  return best;
}

/** Successive over-relaxation of Laplace's equation with fixed known cells. */
export function solveMembrane(values: Float32Array, known: Uint8Array, w: number, h: number): void {
  const mean = [0, 0, 0];
  let count = 0;
  for (let c = 0; c < w * h; c++) {
    if (!known[c]) continue;
    count++;
    for (let k = 0; k < 3; k++) mean[k] += values[c * 3 + k];
  }
  if (count === 0) return;
  for (let c = 0; c < w * h; c++) {
    if (known[c]) continue;
    for (let k = 0; k < 3; k++) values[c * 3 + k] = mean[k] / count;
  }
  const omega = 1.85;
  const iterations = Math.max(w, h) * 3 + 30;
  for (let it = 0; it < iterations; it++) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const c = y * w + x;
        if (known[c]) continue;
        let n = 0;
        let s0 = 0;
        let s1 = 0;
        let s2 = 0;
        const add = (j: number) => {
          n++;
          s0 += values[j * 3];
          s1 += values[j * 3 + 1];
          s2 += values[j * 3 + 2];
        };
        if (x > 0) add(c - 1);
        if (x < w - 1) add(c + 1);
        if (y > 0) add(c - w);
        if (y < h - 1) add(c + w);
        if (n === 0) continue;
        values[c * 3] += omega * (s0 / n - values[c * 3]);
        values[c * 3 + 1] += omega * (s1 / n - values[c * 3 + 1]);
        values[c * 3 + 2] += omega * (s2 / n - values[c * 3 + 2]);
      }
    }
  }
}

function sampleGrid(grid: Float32Array, w: number, h: number, gx: number, gy: number, out: Float32Array) {
  const x = Math.min(w - 1, Math.max(0, gx));
  const y = Math.min(h - 1, Math.max(0, gy));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(w - 1, x0 + 1);
  const y1 = Math.min(h - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  for (let k = 0; k < 3; k++) {
    const a = grid[(y0 * w + x0) * 3 + k];
    const b = grid[(y0 * w + x1) * 3 + k];
    const c = grid[(y1 * w + x0) * 3 + k];
    const d = grid[(y1 * w + x1) * 3 + k];
    const top = a + (b - a) * tx;
    out[k] = top + (c + (d - c) * tx - top) * ty;
  }
}

export function maskBounds(mask: Uint8Array, width: number, height: number) {
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!mask[y * width + x]) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

function subsample<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items;
  const stride = items.length / max;
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(items[Math.floor(i * stride)]);
  return out;
}

function toGlobal(i: number, rw: number, rx0: number, ry0: number, W: number): number {
  return (Math.floor(i / rw) + ry0) * W + (i % rw) + rx0;
}
