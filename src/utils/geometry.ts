import type { Point } from '../types/Editor.types';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Maps image coordinates to screen coordinates: screen = image * scale + offset. */
export interface ViewTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Even-odd ray casting test. */
export function pointInPolygon(p: Point, polygon: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    const crosses = a.y > p.y !== b.y > p.y;
    if (crosses && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

export function polygonBounds(points: readonly Point[]): Rect {
  if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Rotates `p` around `origin` by `angle` radians. */
export function rotatePoint(p: Point, origin: Point, angle: number): Point {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = p.x - origin.x;
  const dy = p.y - origin.y;
  return {
    x: origin.x + dx * cos - dy * sin,
    y: origin.y + dx * sin + dy * cos,
  };
}

export function imageToScreen(p: Point, view: ViewTransform): Point {
  return { x: p.x * view.scale + view.offsetX, y: p.y * view.scale + view.offsetY };
}

export function screenToImage(p: Point, view: ViewTransform): Point {
  return { x: (p.x - view.offsetX) / view.scale, y: (p.y - view.offsetY) / view.scale };
}

/** Centers an image inside a viewport, leaving `padding` screen pixels around it. */
export function fitView(
  imageWidth: number,
  imageHeight: number,
  viewWidth: number,
  viewHeight: number,
  padding = 8,
): ViewTransform {
  const scale = Math.min(
    (viewWidth - padding * 2) / imageWidth,
    (viewHeight - padding * 2) / imageHeight,
  );
  return {
    scale,
    offsetX: (viewWidth - imageWidth * scale) / 2,
    offsetY: (viewHeight - imageHeight * scale) / 2,
  };
}

/** Zooms the view by `factor` while keeping the screen point `focus` fixed. */
export function zoomAt(view: ViewTransform, focus: Point, factor: number): ViewTransform {
  const scale = view.scale * factor;
  return {
    scale,
    offsetX: focus.x - (focus.x - view.offsetX) * factor,
    offsetY: focus.y - (focus.y - view.offsetY) * factor,
  };
}

/** Distance from `p` to the segment a-b. */
export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return distance(p, a);
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq, 0, 1);
  return distance(p, { x: a.x + t * dx, y: a.y + t * dy });
}
