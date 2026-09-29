import { describe, expect, it } from 'vitest';
import { floodSelect, makeCutout } from '../../src/services/cutout';
import { createRGBAImage, type RGBAImage } from '../../src/utils/pixels';

/** 40×30 white background with a green "plant" block at x 10..29, y 5..24. */
function plantPhoto(): RGBAImage {
  const img = createRGBAImage(40, 30);
  for (let y = 0; y < 30; y++) {
    for (let x = 0; x < 40; x++) {
      const plant = x >= 10 && x < 30 && y >= 5 && y < 25;
      const noise = (x * 7 + y * 13) % 9; // slight texture, within tolerance
      img.data.set(plant ? [40 + noise, 120 + noise, 40, 255] : [245 - noise, 245 - noise, 240, 255], (y * 40 + x) * 4);
    }
  }
  return img;
}

const count = (mask: Uint8Array) => mask.reduce((a, b) => a + b, 0);

describe('cutout', () => {
  describe('floodSelect', () => {
    it('selects the connected background but not the plant', () => {
      const selected = floodSelect(plantPhoto(), 1, 1, 0.1);
      expect(count(selected)).toBe(40 * 30 - 20 * 20);
      expect(selected[15 * 40 + 20]).toBe(0);
    });

    it('does not cross into regions that are not connected', () => {
      const img = plantPhoto();
      // A white hole inside the plant, not connected to the outer background.
      for (let y = 12; y < 16; y++) for (let x = 18; x < 22; x++) img.data.set([245, 245, 240, 255], (y * 40 + x) * 4);
      const selected = floodSelect(img, 0, 0, 0.1);
      expect(selected[14 * 40 + 20]).toBe(0);
    });

    it('selects nothing for a tap outside the image', () => {
      expect(count(floodSelect(plantPhoto(), -5, 3, 0.2))).toBe(0);
    });

    it('grows with tolerance', () => {
      const tight = count(floodSelect(plantPhoto(), 1, 1, 0.001));
      const loose = count(floodSelect(plantPhoto(), 1, 1, 0.1));
      expect(tight).toBeLessThan(loose);
    });
  });

  describe('makeCutout', () => {
    it('trims to the plant after erasing the background', () => {
      const img = plantPhoto();
      const result = makeCutout(img, { outline: null, erased: floodSelect(img, 0, 0, 0.1), feather: 0 })!;
      expect([result.x, result.y, result.image.width, result.image.height]).toEqual([10, 5, 20, 20]);
      expect(result.image.data[3]).toBe(255);
    });

    it('keeps only what is inside the outline', () => {
      const result = makeCutout(plantPhoto(), {
        outline: [
          { x: 5, y: 2 },
          { x: 15, y: 2 },
          { x: 15, y: 12 },
          { x: 5, y: 12 },
        ],
        erased: null,
        feather: 0,
      })!;
      expect([result.x, result.y, result.image.width, result.image.height]).toEqual([5, 2, 10, 10]);
    });

    it('returns null when everything was erased', () => {
      const img = plantPhoto();
      expect(makeCutout(img, { outline: null, erased: new Uint8Array(40 * 30).fill(1), feather: 0 })).toBeNull();
    });

    it('softens edges when feathered', () => {
      const img = plantPhoto();
      const result = makeCutout(img, { outline: null, erased: floodSelect(img, 0, 0, 0.1), feather: 2 })!;
      const edgeAlpha = result.image.data[((result.image.height >> 1) * result.image.width) * 4 + 3];
      expect(edgeAlpha).toBeGreaterThan(0);
      expect(edgeAlpha).toBeLessThan(255);
    });
  });
});
