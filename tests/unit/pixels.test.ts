import { describe, expect, it } from 'vitest';
import { boxBlur, buildMipChain, createRGBAImage, cropImage, sampleWrapped } from '../../src/utils/pixels';
import { createRng } from '../../src/utils/random';

describe('pixels', () => {
  it('box blur preserves a constant image and spreads an impulse', () => {
    const flat = new Float32Array(25).fill(3);
    boxBlur(flat, 5, 5, 2);
    flat.forEach((v) => expect(v).toBeCloseTo(3));

    const impulse = new Float32Array(9 * 9);
    impulse[4 * 9 + 4] = 81;
    boxBlur(impulse, 9, 9, 1);
    expect(impulse[4 * 9 + 4]).toBeCloseTo(9);
    expect(impulse[3 * 9 + 3]).toBeCloseTo(9);
    expect(impulse[0]).toBe(0);
  });

  it('builds a mip chain down to the minimum size', () => {
    const chain = buildMipChain(createRGBAImage(64, 64), 8);
    expect(chain.map((m) => m.width)).toEqual([64, 32, 16, 8]);
  });

  it('samples with wrap-around', () => {
    const img = createRGBAImage(2, 1);
    img.data.set([0, 0, 0, 255, 200, 0, 0, 255]);
    const out = new Float32Array(3);
    sampleWrapped(img, 1.5, 0.5, out);
    expect(out[0]).toBeCloseTo(200);
    sampleWrapped(img, 3.5, 0.5, out);
    expect(out[0]).toBeCloseTo(200);
    sampleWrapped(img, 2, 0.5, out);
    expect(out[0]).toBeCloseTo(100);
  });

  it('samples negative coordinates just left of a seam without reading out of bounds', () => {
    const img = createRGBAImage(2, 1);
    img.data.set([0, 0, 0, 255, 200, 0, 0, 255]);
    const out = new Float32Array(3);
    sampleWrapped(img, -2.2, 0.5, out);
    expect(Number.isFinite(out[0])).toBe(true);
    expect(out[0]).toBeCloseTo(140);
  });

  it('crops with transparent padding outside the source', () => {
    const img = createRGBAImage(2, 2);
    img.data.fill(255);
    const crop = cropImage(img, 1, 1, 2, 2);
    expect(crop.data[3]).toBe(255);
    expect(crop.data[7]).toBe(0);
  });

  it('seeded random is deterministic', () => {
    const a = createRng(42);
    const b = createRng(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});
