import { describe, expect, it } from 'vitest';
import {
  createTextureMapping,
  mapToTexture,
  rasterizePolygon,
  renderSurface,
  surfaceBounds,
  type SurfaceParams,
} from '../../src/services/surface';
import { buildMipChain, createRGBAImage } from '../../src/utils/pixels';

function params(overrides: Partial<SurfaceParams> = {}): SurfaceParams {
  return {
    imageWidth: 400,
    imageHeight: 300,
    points: [
      { x: 50, y: 150 },
      { x: 350, y: 150 },
      { x: 350, y: 290 },
      { x: 50, y: 290 },
    ],
    horizonY: 100,
    tileSize: 50,
    textureAngle: 0,
    perspective: true,
    shading: 0,
    brightness: 1,
    feather: 0,
    ...overrides,
  };
}

function solidTexture(r: number, g: number, b: number) {
  const tex = createRGBAImage(16, 16);
  for (let i = 0; i < tex.data.length; i += 4) {
    tex.data[i] = r;
    tex.data[i + 1] = g;
    tex.data[i + 2] = b;
    tex.data[i + 3] = 255;
  }
  return buildMipChain(tex, 2);
}

describe('surface', () => {
  describe('rasterizePolygon', () => {
    it('covers the interior fully and the exterior not at all', () => {
      const bounds = { x: 0, y: 0, width: 20, height: 20 };
      const cov = rasterizePolygon(
        [
          { x: 5, y: 5 },
          { x: 15, y: 5 },
          { x: 15, y: 15 },
          { x: 5, y: 15 },
        ],
        bounds,
      );
      expect(cov[10 * 20 + 10]).toBeCloseTo(1);
      expect(cov[2 * 20 + 2]).toBe(0);
      const total = cov.reduce((a, b) => a + b, 0);
      expect(total).toBeCloseTo(100, 0);
    });

    it('antialiases fractional edges', () => {
      const cov = rasterizePolygon(
        [
          { x: 2.5, y: 0 },
          { x: 8, y: 0 },
          { x: 8, y: 4 },
          { x: 2.5, y: 4 },
        ],
        { x: 0, y: 0, width: 10, height: 4 },
      );
      expect(cov[2]).toBeCloseTo(0.5);
      expect(cov[3]).toBeCloseTo(1);
    });
  });

  describe('mapToTexture', () => {
    it('makes one tile span tileSize pixels horizontally at the nearest row', () => {
      const p = params();
      const bounds = surfaceBounds(p);
      const m = createTextureMapping(p, bounds);
      const out = new Float64Array(3);
      const bottom = bounds.y + bounds.height;
      mapToTexture(200, bottom, m, out);
      const u0 = out[0];
      mapToTexture(250, bottom, m, out);
      expect(out[0] - u0).toBeCloseTo(1);
    });

    it('shrinks tiles toward the horizon', () => {
      const p = params();
      const m = createTextureMapping(p, surfaceBounds(p));
      const out = new Float64Array(3);
      mapToTexture(200, 280, m, out);
      const nearFootprint = out[2];
      mapToTexture(200, 160, m, out);
      expect(out[2]).toBeGreaterThan(nearFootprint * 2);
    });

    it('rejects pixels above the horizon', () => {
      const p = params();
      const m = createTextureMapping(p, surfaceBounds(p));
      expect(mapToTexture(200, 90, m, new Float64Array(3))).toBe(false);
    });

    it('tiles uniformly without perspective', () => {
      const p = params({ perspective: false });
      const m = createTextureMapping(p, surfaceBounds(p));
      const out = new Float64Array(3);
      mapToTexture(100, 100, m, out);
      expect(out[0]).toBeCloseTo(2);
      expect(out[1]).toBeCloseTo(2);
    });
  });

  describe('renderSurface', () => {
    it('fills the polygon with the material and leaves the rest transparent', () => {
      const p = params();
      const bounds = surfaceBounds(p);
      const img = renderSurface(p, bounds, solidTexture(40, 160, 60), null);
      const inside = ((200 - bounds.y) * bounds.width + (200 - bounds.x)) * 4;
      expect(Array.from(img.data.slice(inside, inside + 4))).toEqual([40, 160, 60, 255]);
      expect(img.data[3]).toBe(0);
    });

    it('darkens the material where the photo is in shadow', () => {
      const p = params({ shading: 1 });
      const bounds = surfaceBounds(p);
      const luma = new Float32Array(bounds.width * bounds.height).fill(0.6);
      // Left half of the area is shaded.
      for (let row = 0; row < bounds.height; row++) {
        for (let col = 0; col < bounds.width / 2; col++) luma[row * bounds.width + col] = 0.2;
      }
      const img = renderSurface(p, bounds, solidTexture(200, 200, 200), luma);
      const at = (x: number, y: number) => img.data[((y - bounds.y) * bounds.width + (x - bounds.x)) * 4];
      expect(at(80, 220)).toBeLessThan(at(320, 220));
    });
  });
});
