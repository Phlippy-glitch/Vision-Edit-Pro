import { describe, expect, it } from 'vitest';
import { FOCAL_LENGTH_FACTOR } from '../../src/constants';
import { buildEstimate, clipBelow, groundArea, polygonArea } from '../../src/services/estimate';
import type { AreaLayer, DesignDoc, Point, RemovalLayer, StampLayer } from '../../src/types/Editor.types';

const W = 1600;
const H = 1200;
const HORIZON = 500;
const CAMERA_FT = 5;
const FOCAL = FOCAL_LENGTH_FACTOR * Math.max(W, H);

/** Projects a ground point (feet; X right, Z forward) into the photo. */
function project(X: number, Z: number): Point {
  const y = HORIZON + (FOCAL * CAMERA_FT) / Z;
  return { x: W / 2 + (X * (y - HORIZON)) / CAMERA_FT, y };
}

function area(id: string, points: Point[], overrides: Partial<AreaLayer> = {}): AreaLayer {
  return {
    id,
    kind: 'area',
    name: 'Lawn',
    visible: true,
    opacity: 1,
    materialId: 'lawn',
    points,
    tileSize: 100,
    textureAngle: 0,
    perspective: true,
    shading: 0.6,
    brightness: 1,
    feather: 2,
    ...overrides,
  };
}

function stamp(id: string, assetId: string, color?: string): StampLayer {
  return {
    id,
    kind: 'stamp',
    name: assetId,
    visible: true,
    opacity: 1,
    assetId,
    seed: 1,
    color,
    x: 0,
    y: 0,
    height: 10,
    rotation: 0,
    flipX: false,
    brightness: 1,
    shadow: true,
  };
}

const removal: RemovalLayer = { id: 'r', kind: 'removal', name: 'r', visible: true, opacity: 1, x: 0, y: 0, width: 1, height: 1, patch: '' };
const settings = { taxRate: 0, cameraHeightFt: CAMERA_FT };

describe('estimate', () => {
  describe('groundArea', () => {
    it('recovers the real area of a ground rectangle from its photo outline', () => {
      // A 20 ft × 10 ft patio starting 15 ft from the camera.
      const outline = [project(-10, 15), project(10, 15), project(10, 25), project(-10, 25)];
      const result = groundArea(outline, HORIZON, W, H, CAMERA_FT);
      expect(result.sqFt).toBeCloseTo(200, 0);
      expect(result.clipped).toBe(false);
    });

    it('scales with camera height', () => {
      const outline = [project(-10, 15), project(10, 15), project(10, 25), project(-10, 25)];
      expect(groundArea(outline, HORIZON, W, H, CAMERA_FT * 2).sqFt).toBeCloseTo(800, 0);
    });

    it('ignores the part of an outline above the horizon and flags it', () => {
      const result = groundArea(
        [
          { x: 0, y: 300 },
          { x: 400, y: 300 },
          { x: 400, y: 1100 },
          { x: 0, y: 1100 },
        ],
        HORIZON,
        W,
        H,
        CAMERA_FT,
      );
      expect(result.clipped).toBe(true);
      expect(Number.isFinite(result.sqFt)).toBe(true);
      expect(result.sqFt).toBeGreaterThan(0);
    });
  });

  it('clips polygons to a horizontal line', () => {
    const clipped = clipBelow(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ],
      4,
    );
    expect(polygonArea(clipped)).toBeCloseTo(60);
  });

  describe('buildEstimate', () => {
    const doc = (layers: DesignDoc['layers']): DesignDoc => ({ layers, horizonY: HORIZON });
    const patio = [project(-10, 15), project(10, 15), project(10, 25), project(-10, 25)];

    it('groups plants by type and color and prices them', () => {
      const estimate = buildEstimate(
        doc([stamp('a', 'boxwood'), stamp('b', 'boxwood'), stamp('c', 'hydrangea', '#e59ac0'), stamp('d', 'hydrangea')]),
        { 'asset:boxwood': 40, 'asset:hydrangea': 50 },
        settings,
        { width: W, height: H },
      );
      const labels = estimate.lines.map((l) => `${l.label} x${l.quantity} = ${l.total}`);
      expect(labels).toEqual(['Boxwood x2 = 80', 'Hydrangea – Pink x1 = 50', 'Hydrangea – Blue x1 = 50']);
      expect(estimate.total).toBe(180);
    });

    it('prices surfaces per square foot using the photo measurement', () => {
      const estimate = buildEstimate(doc([area('p', patio)]), { 'material:lawn': 2 }, settings, { width: W, height: H });
      expect(estimate.lines[0].quantity).toBe(200);
      expect(estimate.lines[0].estimated).toBe(true);
      expect(estimate.lines[0].total).toBe(400);
    });

    it('prefers a typed area over the measurement', () => {
      const estimate = buildEstimate(doc([area('p', patio, { areaOverrideSqFt: 150 })]), { 'material:lawn': 2 }, settings, {
        width: W,
        height: H,
      });
      expect(estimate.lines[0].quantity).toBe(150);
      expect(estimate.lines[0].estimated).toBe(false);
    });

    it('does not bill AI redesign patches as removals', () => {
      const estimate = buildEstimate(doc([{ ...removal, source: 'ai' }]), { removal: 100 }, settings, { width: W, height: H });
      expect(estimate.lines).toHaveLength(0);
    });

    it('does not guess wall areas', () => {
      const estimate = buildEstimate(doc([area('w', patio, { perspective: false, materialId: 'siding-white' })]), {}, settings, {
        width: W,
        height: H,
      });
      expect(estimate.lines[0].quantity).toBe(0);
    });

    it('adds bulk volume for mulch, removals, tax, and skips hidden layers', () => {
      const estimate = buildEstimate(
        doc([area('m', patio, { materialId: 'mulch-brown' }), removal, { ...stamp('h', 'boxwood'), visible: false }]),
        { 'material:mulch-brown': 1, removal: 100 },
        { taxRate: 10, cameraHeightFt: CAMERA_FT },
        { width: W, height: H },
      );
      expect(estimate.lines.find((l) => l.priceKey === 'material:mulch-brown')?.detail).toBe('≈ 1.9 cu yd at 3" depth');
      expect(estimate.lines.some((l) => l.priceKey === 'asset:boxwood')).toBe(false);
      expect(estimate.subtotal).toBe(300);
      expect(estimate.tax).toBe(30);
      expect(estimate.total).toBe(330);
    });
  });
});
