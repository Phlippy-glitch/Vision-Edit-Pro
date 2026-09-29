import { hexToRgb, mixRgb, rgbCss, type RGB } from '../../utils/color';
import { range, type Rng } from '../../utils/random';

/**
 * Painterly drawing primitives shared by the procedural catalog. Light comes
 * from the upper left, matching a typical daytime exterior photo.
 */

const LIGHT_DIR = { x: -0.6, y: -0.8 };

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Circle {
  x: number;
  y: number;
  r: number;
}

/** Samples a multi-stop palette (dark → light) at t in 0..1. */
export function paletteColor(palette: readonly RGB[], t: number): RGB {
  const clamped = Math.min(1, Math.max(0, t));
  const scaled = clamped * (palette.length - 1);
  const i = Math.min(palette.length - 2, Math.floor(scaled));
  return mixRgb(palette[i], palette[i + 1], scaled - i);
}

export function parsePalette(hexes: readonly string[]): RGB[] {
  return hexes.map(hexToRgb);
}

export interface FoliageOptions {
  inside: (x: number, y: number) => boolean;
  bounds: Box;
  /** Center and radius used to shade the mass as a lit volume. */
  light: Circle;
  palette: readonly string[];
  count: number;
  size: [number, number];
  /** Minor/major axis ratio of each dab. */
  elongation?: number;
  angle?: (x: number, y: number, rng: Rng) => number;
  /** Extra per-dab brightness randomness. */
  jitter?: number;
  /** Replaces volume shading, for long shapes like hedges. Returns 0..1. */
  lightAt?: (x: number, y: number) => number;
}

/**
 * Paints a mass of leaves as overlapping dabs, darkest first, so shadowed
 * leaves sit behind lit ones the way real canopies read.
 */
export function paintFoliage(ctx: CanvasRenderingContext2D, rng: Rng, o: FoliageOptions): void {
  const palette = parsePalette(o.palette);
  const elongation = o.elongation ?? 0.6;
  const jitter = o.jitter ?? 0.35;
  type Dab = { x: number; y: number; l: number; s: number; a: number };
  const dabs: Dab[] = [];

  const place = (count: number, sizeScale: number, lightFn: (x: number, y: number) => number) => {
    let attempts = 0;
    let placed = 0;
    while (placed < count && attempts < count * 30) {
      attempts++;
      const x = o.bounds.x + rng() * o.bounds.w;
      const y = o.bounds.y + rng() * o.bounds.h;
      if (!o.inside(x, y)) continue;
      placed++;
      dabs.push({
        x,
        y,
        l: lightFn(x, y),
        s: range(rng, o.size[0], o.size[1]) * sizeScale,
        a: o.angle ? o.angle(x, y, rng) : rng() * Math.PI,
      });
    }
  };

  // Underpainting in shadow tones fills gaps between leaves.
  place(Math.round(o.count * 0.35), 1.6, () => rng() * 0.18);
  place(o.count, 1, (x, y) => {
    if (o.lightAt) return o.lightAt(x, y) + (rng() - 0.5) * jitter;
    const dx = (x - o.light.x) / o.light.r;
    const dy = (y - o.light.y) / o.light.r;
    const facing = -(dx * LIGHT_DIR.x + dy * LIGHT_DIR.y);
    const rim = Math.min(1, Math.hypot(dx, dy));
    return 0.42 + facing * 0.42 + rim * 0.08 + (rng() - 0.5) * jitter;
  });

  dabs.sort((a, b) => a.l - b.l);
  for (const d of dabs) {
    ctx.fillStyle = rgbCss(paletteColor(palette, d.l));
    ctx.beginPath();
    ctx.ellipse(d.x, d.y, d.s, d.s * elongation, d.a, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Random overlapping circles forming an organic crown outline. */
export function crownBlobs(rng: Rng, cx: number, cy: number, rx: number, ry: number, count: number): Circle[] {
  const blobs: Circle[] = [{ x: cx, y: cy, r: Math.min(rx, ry) * 0.75 }];
  for (let i = 1; i < count; i++) {
    const a = rng() * Math.PI * 2;
    const d = Math.sqrt(rng()) * 0.62;
    blobs.push({
      x: cx + Math.cos(a) * rx * d,
      y: cy + Math.sin(a) * ry * d,
      r: Math.min(rx, ry) * range(rng, 0.35, 0.55),
    });
  }
  return blobs;
}

export function insideBlobs(blobs: readonly Circle[]): (x: number, y: number) => boolean {
  return (x, y) => blobs.some((b) => (x - b.x) ** 2 + (y - b.y) ** 2 < b.r * b.r);
}

export function blobBounds(blobs: readonly Circle[]): Box {
  const x0 = Math.min(...blobs.map((b) => b.x - b.r));
  const y0 = Math.min(...blobs.map((b) => b.y - b.r));
  const x1 = Math.max(...blobs.map((b) => b.x + b.r));
  const y1 = Math.max(...blobs.map((b) => b.y + b.r));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** A tapered, slightly curved trunk with cylindrical shading and bark lines. */
export function paintTrunk(
  ctx: CanvasRenderingContext2D,
  rng: Rng,
  baseX: number,
  baseY: number,
  topX: number,
  topY: number,
  baseWidth: number,
  topWidth: number,
  color = '#5b4330',
): void {
  const bend = (rng() - 0.5) * baseWidth;
  const midX = (baseX + topX) / 2 + bend;
  const midY = (baseY + topY) / 2;
  ctx.beginPath();
  ctx.moveTo(baseX - baseWidth / 2 - baseWidth * 0.25, baseY);
  ctx.quadraticCurveTo(midX - (baseWidth + topWidth) / 4, midY, topX - topWidth / 2, topY);
  ctx.lineTo(topX + topWidth / 2, topY);
  ctx.quadraticCurveTo(midX + (baseWidth + topWidth) / 4, midY, baseX + baseWidth / 2 + baseWidth * 0.25, baseY);
  ctx.closePath();
  const grad = ctx.createLinearGradient(baseX - baseWidth, 0, baseX + baseWidth, 0);
  const base = hexToRgb(color);
  grad.addColorStop(0, rgbCss(mixRgb(base, [255, 255, 255], 0.18)));
  grad.addColorStop(0.45, rgbCss(base));
  grad.addColorStop(1, rgbCss(mixRgb(base, [0, 0, 0], 0.55)));
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.save();
  ctx.clip();
  ctx.strokeStyle = rgbCss(mixRgb(base, [0, 0, 0], 0.45), 0.6);
  ctx.lineWidth = Math.max(1, baseWidth * 0.05);
  for (let i = 0; i < 10; i++) {
    const t = rng();
    const x = baseX - baseWidth / 2 + t * baseWidth;
    ctx.beginPath();
    ctx.moveTo(x, baseY);
    ctx.quadraticCurveTo(x + (rng() - 0.5) * 6, midY, topX + (t - 0.5) * topWidth, topY);
    ctx.stroke();
  }
  ctx.restore();
}

export function paintBranch(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  width: number,
  color = '#4a3526',
): void {
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.quadraticCurveTo((x0 + x1) / 2 + (x1 - x0) * 0.1, (y0 + y1) / 2 - Math.abs(x1 - x0) * 0.15, x1, y1);
  ctx.stroke();
}

/** Cluster of small round florets, shaded as a dome (hydrangea heads, blooms). */
export function paintBloom(
  ctx: CanvasRenderingContext2D,
  rng: Rng,
  cx: number,
  cy: number,
  r: number,
  palette: readonly string[],
  florets: number,
  floretSize: number,
): void {
  paintFoliage(ctx, rng, {
    inside: (x, y) => (x - cx) ** 2 + (y - cy) ** 2 < r * r,
    bounds: { x: cx - r, y: cy - r, w: r * 2, h: r * 2 },
    light: { x: cx, y: cy, r },
    palette,
    count: florets,
    size: [floretSize * 0.7, floretSize * 1.2],
    elongation: 0.85,
    jitter: 0.25,
  });
}

/** Linear gradient helper for cylindrical objects lit from the left. */
export function cylinderGradient(
  ctx: CanvasRenderingContext2D,
  x0: number,
  x1: number,
  color: string,
): CanvasGradient {
  const base = hexToRgb(color);
  const grad = ctx.createLinearGradient(x0, 0, x1, 0);
  grad.addColorStop(0, rgbCss(mixRgb(base, [0, 0, 0], 0.25)));
  grad.addColorStop(0.25, rgbCss(mixRgb(base, [255, 255, 255], 0.2)));
  grad.addColorStop(0.55, rgbCss(base));
  grad.addColorStop(1, rgbCss(mixRgb(base, [0, 0, 0], 0.5)));
  return grad;
}

export function speckle(
  ctx: CanvasRenderingContext2D,
  rng: Rng,
  box: Box,
  count: number,
  size: number,
  colors: readonly string[],
  inside?: (x: number, y: number) => boolean,
): void {
  for (let i = 0; i < count; i++) {
    const x = box.x + rng() * box.w;
    const y = box.y + rng() * box.h;
    if (inside && !inside(x, y)) continue;
    ctx.fillStyle = colors[Math.floor(rng() * colors.length)];
    ctx.fillRect(x, y, size * range(rng, 0.5, 1.5), size * range(rng, 0.5, 1.5));
  }
}
