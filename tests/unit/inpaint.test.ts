import { describe, expect, it } from 'vitest';
import { inpaint, maskBounds, solveMembrane } from '../../src/services/inpaint';
import { createRGBAImage, type RGBAImage } from '../../src/utils/pixels';
import { createRng } from '../../src/utils/random';

function fill(width: number, height: number, color: (x: number, y: number) => [number, number, number]): RGBAImage {
  const img = createRGBAImage(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = color(x, y);
      const o = (y * width + x) * 4;
      img.data.set([r, g, b, 255], o);
    }
  }
  return img;
}

function rectMask(width: number, height: number, x0: number, y0: number, x1: number, y1: number): Uint8Array {
  const mask = new Uint8Array(width * height);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) mask[y * width + x] = 1;
  return mask;
}

/** Composites the patch over the source like the renderer does. */
function composite(src: RGBAImage, result: NonNullable<ReturnType<typeof inpaint>>): RGBAImage {
  const out = { ...src, data: Uint8ClampedArray.from(src.data) };
  const { image } = result;
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const p = (y * image.width + x) * 4;
      const a = image.data[p + 3] / 255;
      const o = ((y + result.y) * src.width + x + result.x) * 4;
      for (let k = 0; k < 3; k++) out.data[o + k] = out.data[o + k] * (1 - a) + image.data[p + k] * a;
    }
  }
  return out;
}

describe('inpaint', () => {
  it('returns null for an empty mask', () => {
    const src = fill(20, 20, () => [0, 0, 0]);
    expect(inpaint(src, new Uint8Array(400))).toBeNull();
  });

  it('removes an object from a uniform lawn', () => {
    const lawn: [number, number, number] = [60, 140, 50];
    const src = fill(120, 80, (x, y) => (x >= 50 && x < 70 && y >= 30 && y < 50 ? [220, 30, 30] : lawn));
    const mask = rectMask(120, 80, 48, 28, 72, 52);
    const result = inpaint(src, mask);
    expect(result).not.toBeNull();
    const out = composite(src, result!);
    const center = (40 * 120 + 60) * 4;
    expect(Math.abs(out.data[center] - lawn[0])).toBeLessThan(4);
    expect(Math.abs(out.data[center + 1] - lawn[1])).toBeLessThan(4);
  });

  it('continues a smooth lighting gradient across the hole', () => {
    const src = fill(160, 100, (x) => [x, 100, 50]);
    const mask = rectMask(160, 100, 70, 40, 90, 60);
    const out = composite(src, inpaint(src, mask)!);
    const at = (x: number) => out.data[(50 * 160 + x) * 4];
    expect(Math.abs(at(80) - 80)).toBeLessThan(6);
  });

  it('offers distinct alternative sources', () => {
    const rng = createRng(7);
    const src = fill(200, 120, () => [rng() * 255, rng() * 255, 90]);
    const mask = rectMask(200, 120, 90, 50, 110, 70);
    const first = inpaint(src, mask, 0)!;
    const second = inpaint(src, mask, 1)!;
    expect(first.candidateCount).toBeGreaterThan(1);
    expect(Array.from(first.image.data)).not.toEqual(Array.from(second.image.data));
  });

  it('computes mask bounds', () => {
    expect(maskBounds(rectMask(10, 10, 2, 3, 5, 7), 10, 10)).toEqual({ x0: 2, y0: 3, x1: 5, y1: 7 });
  });

  it('solves the membrane as a linear interpolation between fixed ends', () => {
    const w = 5;
    const values = new Float32Array(w * 3);
    const known = new Uint8Array(w);
    known[0] = 1;
    known[4] = 1;
    values[4 * 3] = 100;
    solveMembrane(values, known, w, 1);
    expect(values[2 * 3]).toBeCloseTo(50, 0);
  });
});
