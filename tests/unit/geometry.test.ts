import { describe, expect, it } from 'vitest';
import {
  distanceToSegment,
  fitView,
  imageToScreen,
  pointInPolygon,
  polygonBounds,
  rotatePoint,
  screenToImage,
  zoomAt,
} from '../../src/utils/geometry';

const square = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
];

describe('geometry', () => {
  it('detects points inside and outside a polygon', () => {
    expect(pointInPolygon({ x: 5, y: 5 }, square)).toBe(true);
    expect(pointInPolygon({ x: 15, y: 5 }, square)).toBe(false);
    expect(pointInPolygon({ x: -1, y: -1 }, square)).toBe(false);
  });

  it('computes polygon bounds', () => {
    expect(polygonBounds(square)).toEqual({ x: 0, y: 0, width: 10, height: 10 });
    expect(polygonBounds([])).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });

  it('rotates points around an origin', () => {
    const p = rotatePoint({ x: 1, y: 0 }, { x: 0, y: 0 }, Math.PI / 2);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(1);
  });

  it('round-trips between image and screen coordinates', () => {
    const view = { scale: 2.5, offsetX: 30, offsetY: -12 };
    const p = { x: 123, y: 45 };
    const back = screenToImage(imageToScreen(p, view), view);
    expect(back.x).toBeCloseTo(p.x);
    expect(back.y).toBeCloseTo(p.y);
  });

  it('fits an image inside the viewport and centers it', () => {
    const view = fitView(2000, 1000, 400, 800, 0);
    expect(view.scale).toBeCloseTo(0.2);
    expect(view.offsetX).toBeCloseTo(0);
    expect(view.offsetY).toBeCloseTo(300);
  });

  it('keeps the focus point fixed when zooming', () => {
    const view = { scale: 1, offsetX: 10, offsetY: 20 };
    const focus = { x: 200, y: 150 };
    const before = screenToImage(focus, view);
    const after = screenToImage(focus, zoomAt(view, focus, 3));
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('measures distance to a segment', () => {
    expect(distanceToSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(3);
    expect(distanceToSegment({ x: 13, y: 4 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(5);
  });
});
