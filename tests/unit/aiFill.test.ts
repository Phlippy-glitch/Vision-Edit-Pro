import { describe, expect, it } from 'vitest';
import { aiCropBox, blendAlpha, chooseSize } from '../../src/services/aiFill';

describe('aiFill', () => {
  it('chooses the output size by aspect ratio', () => {
    expect(chooseSize(2)).toBe('1536x1024');
    expect(chooseSize(1)).toBe('1024x1024');
    expect(chooseSize(0.5)).toBe('1024x1536');
  });

  describe('aiCropBox', () => {
    const W = 2048;
    const H = 1536;

    it('adds context around the painted area and matches the output aspect exactly', () => {
      const crop = aiCropBox({ x0: 900, y0: 900, x1: 1300, y1: 1100 }, W, H);
      expect(crop.width / crop.height).toBeCloseTo(crop.outWidth / crop.outHeight, 2);
      expect(crop.x).toBeLessThanOrEqual(900);
      expect(crop.x + crop.width).toBeGreaterThanOrEqual(1300);
      expect(crop.y).toBeLessThanOrEqual(900);
      expect(crop.y + crop.height).toBeGreaterThanOrEqual(1100);
    });

    it('stays inside the photo near an edge', () => {
      const crop = aiCropBox({ x0: 1950, y0: 1450, x1: 2040, y1: 1530 }, W, H);
      expect(crop.x).toBeGreaterThanOrEqual(0);
      expect(crop.y).toBeGreaterThanOrEqual(0);
      expect(crop.x + crop.width).toBeLessThanOrEqual(W);
      expect(crop.y + crop.height).toBeLessThanOrEqual(H);
    });

    it('uses a minimum crop so small edits get enough context', () => {
      const crop = aiCropBox({ x0: 1000, y0: 700, x1: 1010, y1: 710 }, W, H);
      expect(Math.min(crop.width, crop.height)).toBeGreaterThanOrEqual(400);
    });

    it('fits photos smaller than the crop', () => {
      const crop = aiCropBox({ x0: 10, y0: 10, x1: 300, y1: 200 }, 320, 240);
      expect(crop.width).toBeLessThanOrEqual(320);
      expect(crop.height).toBeLessThanOrEqual(240);
    });
  });

  it('blends fully inside the painted area and not far outside it', () => {
    const W = 100;
    const H = 100;
    const mask = new Uint8Array(W * H);
    for (let y = 40; y < 60; y++) for (let x = 40; x < 60; x++) mask[y * W + x] = 1;
    const alpha = blendAlpha(mask, W, H, { x: 0, y: 0, width: W, height: H });
    expect(alpha[50 * W + 50]).toBeCloseTo(1);
    expect(alpha[40 * W + 40]).toBeGreaterThan(0.5);
    expect(alpha[20 * W + 20]).toBe(0);
  });
});
