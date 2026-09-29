import { hexToRgb, shade } from '../../utils/color';
import { pick, range, type Rng } from '../../utils/random';

/**
 * Seamless procedural surface textures. Each draws one square tile; anything
 * crossing an edge is repeated on the opposite side so the tile wraps
 * without seams.
 */

export type MaterialCategory = 'ground' | 'wall';

export interface MaterialDef {
  id: string;
  name: string;
  category: MaterialCategory;
  /** Default tile size as a fraction of the photo width. */
  defaultTile: number;
  perspective: boolean;
  /** Default share of the photo's lighting to keep (0..1). */
  shading: number;
  /** Swatch color for quick identification in lists. */
  swatch: string;
  draw(ctx: CanvasRenderingContext2D, size: number, rng: Rng): void;
}

/** Calls `fn` with each offset needed for a shape near the tile edge to wrap. */
function wrapped(size: number, x: number, y: number, reach: number, fn: (x: number, y: number) => void) {
  for (const ox of [-size, 0, size]) {
    for (const oy of [-size, 0, size]) {
      const px = x + ox;
      const py = y + oy;
      if (px + reach < 0 || py + reach < 0 || px - reach > size || py - reach > size) continue;
      fn(px, py);
    }
  }
}

function softBlotches(ctx: CanvasRenderingContext2D, size: number, rng: Rng, colors: readonly string[], count: number) {
  for (let i = 0; i < count; i++) {
    const r = range(rng, size * 0.08, size * 0.25);
    const color = pick(rng, colors);
    wrapped(size, rng() * size, rng() * size, r, (x, y) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    });
  }
}

function grain(ctx: CanvasRenderingContext2D, size: number, rng: Rng, amount: number) {
  const img = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rng() - 0.5) * amount;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

function lawn(base: string, blades: readonly string[]) {
  return (ctx: CanvasRenderingContext2D, size: number, rng: Rng) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    softBlotches(ctx, size, rng, [shade(base, 0.15, 0.35), shade(base, -0.25, 0.35)], 30);
    ctx.lineCap = 'round';
    for (let i = 0; i < 16000; i++) {
      const len = range(rng, 5, 13);
      const a = -Math.PI / 2 + (rng() - 0.5) * 0.7;
      const color = pick(rng, blades);
      const width = range(rng, 0.9, 1.6);
      wrapped(size, rng() * size, rng() * size, len, (x, y) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
        ctx.stroke();
      });
    }
  };
}

function mulch(base: string, chips: readonly string[]) {
  return (ctx: CanvasRenderingContext2D, size: number, rng: Rng) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 11000; i++) {
      const w = range(rng, 3, 11);
      const h = range(rng, 1.2, 3.2);
      const a = rng() * Math.PI;
      const color = pick(rng, chips);
      wrapped(size, rng() * size, rng() * size, w, (x, y) => {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(a);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(-w / 2 + 0.8, -h / 2 + 0.8, w, h);
        ctx.fillStyle = color;
        ctx.fillRect(-w / 2, -h / 2, w, h);
        ctx.restore();
      });
    }
  };
}

function stones(base: string, colors: readonly string[], count: number, minR: number, maxR: number) {
  return (ctx: CanvasRenderingContext2D, size: number, rng: Rng) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < count; i++) {
      const r = range(rng, minR, maxR);
      const e = range(rng, 0.65, 1);
      const a = rng() * Math.PI;
      const color = pick(rng, colors);
      wrapped(size, rng() * size, rng() * size, r * 1.4, (x, y) => {
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.beginPath();
        ctx.ellipse(x + r * 0.2, y + r * 0.25, r, r * e, a, 0, Math.PI * 2);
        ctx.fill();
        const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r * 1.1);
        g.addColorStop(0, shade(color, 0.3));
        g.addColorStop(0.6, color);
        g.addColorStop(1, shade(color, -0.35));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(x, y, r, r * e, a, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  };
}

/** Rectangular units in a running bond, e.g. brick pavers or a brick wall. */
function bond(unitW: number, rows: number, joint: string, colors: readonly string[], jointWidth: number, bevel: number) {
  return (ctx: CanvasRenderingContext2D, size: number, rng: Rng) => {
    ctx.fillStyle = joint;
    ctx.fillRect(0, 0, size, size);
    const unitH = size / rows;
    const perRow = size / unitW;
    for (let row = 0; row < rows; row++) {
      const offset = row % 2 ? unitW / 2 : 0;
      for (let i = -1; i < perRow; i++) {
        const x = i * unitW + offset + jointWidth / 2;
        const y = row * unitH + jointWidth / 2;
        const w = unitW - jointWidth;
        const h = unitH - jointWidth;
        const color = pick(rng, colors);
        wrapped(size, x + w / 2, y + h / 2, unitW, (cx, cy) => {
          const x0 = cx - w / 2;
          const y0 = cy - h / 2;
          ctx.fillStyle = color;
          ctx.fillRect(x0, y0, w, h);
          ctx.fillStyle = 'rgba(255,255,255,0.14)';
          ctx.fillRect(x0, y0, w, bevel);
          ctx.fillStyle = 'rgba(0,0,0,0.22)';
          ctx.fillRect(x0, y0 + h - bevel, w, bevel);
        });
      }
    }
    grain(ctx, size, rng, 26);
  };
}

/** Irregular stones separated by mortar, via a wrapped Voronoi diagram. */
function voronoiStone(cells: number, colors: readonly string[], mortar: string, stretchY: number, jointWidth: number) {
  return (ctx: CanvasRenderingContext2D, size: number, rng: Rng) => {
    const seeds = Array.from({ length: cells }, () => ({
      x: rng() * size,
      y: rng() * size,
      color: hexToRgb(pick(rng, colors)),
      tone: range(rng, -12, 12),
    }));
    const img = ctx.createImageData(size, size);
    const mortarRgb = hexToRgb(mortar);
    const half = size / 2;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let d1 = Infinity;
        let d2 = Infinity;
        let nearest = 0;
        for (let i = 0; i < seeds.length; i++) {
          let dx = Math.abs(x - seeds[i].x);
          let dy = Math.abs(y - seeds[i].y);
          if (dx > half) dx = size - dx;
          if (dy > half) dy = size - dy;
          const d = Math.sqrt(dx * dx + dy * dy * stretchY * stretchY);
          if (d < d1) {
            d2 = d1;
            d1 = d;
            nearest = i;
          } else if (d < d2) {
            d2 = d;
          }
        }
        const o = (y * size + x) * 4;
        const edge = (d2 - d1) / 2;
        if (edge < jointWidth) {
          img.data.set([mortarRgb[0], mortarRgb[1], mortarRgb[2], 255], o);
          continue;
        }
        const s = seeds[nearest];
        // Darken toward each stone's edge for a slight pillowed look.
        const rim = Math.min(1, (edge - jointWidth) / 6);
        const light = s.tone - (1 - rim) * 28;
        img.data[o] = s.color[0] + light;
        img.data[o + 1] = s.color[1] + light;
        img.data[o + 2] = s.color[2] + light;
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    grain(ctx, size, rng, 30);
  };
}

function concrete(ctx: CanvasRenderingContext2D, size: number, rng: Rng) {
  ctx.fillStyle = '#b9b6ae';
  ctx.fillRect(0, 0, size, size);
  softBlotches(ctx, size, rng, ['rgba(120,115,105,0.25)', 'rgba(230,228,220,0.25)'], 24);
  grain(ctx, size, rng, 34);
  // Control joint around the tile so large pours read as slabs.
  ctx.fillStyle = 'rgba(70,66,60,0.55)';
  ctx.fillRect(0, 0, size, 3);
  ctx.fillRect(0, 0, 3, size);
}

function deck(colors: readonly string[]) {
  return (ctx: CanvasRenderingContext2D, size: number, rng: Rng) => {
    const boards = 8;
    const bh = size / boards;
    ctx.fillStyle = '#1e1712';
    ctx.fillRect(0, 0, size, size);
    for (let b = 0; b < boards; b++) {
      const y = b * bh;
      const split = rng() * size;
      for (const [x0, x1] of [
        [split - size, split],
        [split, split + size],
      ]) {
        const color = pick(rng, colors);
        const grainLines = Array.from({ length: 7 }, () => ({ offset: 4 + rng() * (bh - 8), phase: rng() * 10 }));
        wrapped(size, (x0 + x1) / 2, y + bh / 2, size, (cx, cy) => {
          const left = cx - size / 2 + 2;
          const top = cy - bh / 2;
          ctx.fillStyle = color;
          ctx.fillRect(left, top + 2, size - 4, bh - 4);
          ctx.strokeStyle = shade(color, -0.25, 0.5);
          ctx.lineWidth = 1;
          for (const { offset, phase } of grainLines) {
            const gy = top + offset;
            ctx.beginPath();
            for (let x = left; x <= left + size - 4; x += 8) {
              const yy = gy + Math.sin(x / 40 + phase) * 1.5;
              if (x === left) ctx.moveTo(x, yy);
              else ctx.lineTo(x, yy);
            }
            ctx.stroke();
          }
        });
      }
    }
    grain(ctx, size, rng, 16);
  };
}

function siding(color: string) {
  return (ctx: CanvasRenderingContext2D, size: number, rng: Rng) => {
    const boards = 8;
    const bh = size / boards;
    for (let b = 0; b < boards; b++) {
      const y = b * bh;
      const g = ctx.createLinearGradient(0, y, 0, y + bh);
      g.addColorStop(0, shade(color, -0.12));
      g.addColorStop(0.15, shade(color, 0.06));
      g.addColorStop(1, shade(color, -0.04));
      ctx.fillStyle = g;
      ctx.fillRect(0, y, size, bh);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(0, y + bh - 3, size, 3);
    }
    grain(ctx, size, rng, 8);
  };
}

export const MATERIALS: MaterialDef[] = [
  {
    id: 'lawn',
    name: 'Lawn',
    category: 'ground',
    defaultTile: 0.12,
    perspective: true,
    shading: 0.7,
    swatch: '#4c7a2e',
    draw: lawn('#44702a', ['#3b6624', '#4f8030', '#5f9138', '#6fa043', '#2f5520', '#86b154']),
  },
  {
    id: 'mulch-brown',
    name: 'Brown Mulch',
    category: 'ground',
    defaultTile: 0.1,
    perspective: true,
    shading: 0.6,
    swatch: '#5a3a24',
    draw: mulch('#2d1d12', ['#6b452a', '#5a3a24', '#7d5436', '#4a2f1d', '#8a6040']),
  },
  {
    id: 'mulch-black',
    name: 'Black Mulch',
    category: 'ground',
    defaultTile: 0.1,
    perspective: true,
    shading: 0.6,
    swatch: '#2a2521',
    draw: mulch('#110e0c', ['#2a2521', '#3a332d', '#221d19', '#4a423a']),
  },
  {
    id: 'mulch-red',
    name: 'Red Mulch',
    category: 'ground',
    defaultTile: 0.1,
    perspective: true,
    shading: 0.6,
    swatch: '#7a2f22',
    draw: mulch('#2e100b', ['#7a2f22', '#8f3a2a', '#65261b', '#a04a36']),
  },
  {
    id: 'river-rock',
    name: 'River Rock',
    category: 'ground',
    defaultTile: 0.14,
    perspective: true,
    shading: 0.6,
    swatch: '#8a8276',
    draw: stones('#4a453e', ['#8a8276', '#a39b8e', '#6f685e', '#b8ad9b', '#7d6f60', '#9a8f84'], 1300, 6, 15),
  },
  {
    id: 'pea-gravel',
    name: 'Pea Gravel',
    category: 'ground',
    defaultTile: 0.1,
    perspective: true,
    shading: 0.6,
    swatch: '#b3a58c',
    draw: stones('#6e6556', ['#b3a58c', '#c9bda6', '#9a8b73', '#d8cfbd', '#8f8272'], 7000, 2, 5),
  },
  {
    id: 'brick-pavers',
    name: 'Brick Pavers',
    category: 'ground',
    defaultTile: 0.12,
    perspective: true,
    shading: 0.55,
    swatch: '#9c5a3c',
    draw: bond(128, 8, '#b8ab94', ['#9c5a3c', '#a8664a', '#8a4e36', '#b37656', '#94533a'], 5, 3),
  },
  {
    id: 'patio-pavers',
    name: 'Patio Pavers',
    category: 'ground',
    defaultTile: 0.2,
    perspective: true,
    shading: 0.55,
    swatch: '#a9a59d',
    draw: bond(256, 4, '#7d776c', ['#a9a59d', '#b8b2a6', '#9d978c', '#c2bcb0', '#a39a8c'], 5, 3),
  },
  {
    id: 'flagstone',
    name: 'Flagstone',
    category: 'ground',
    defaultTile: 0.22,
    perspective: true,
    shading: 0.55,
    swatch: '#9e8f79',
    draw: voronoiStone(34, ['#8d8272', '#9e8f79', '#7c7466', '#a39a8a', '#86796a', '#b0a08a'], '#6b6457', 1, 3.5),
  },
  {
    id: 'concrete',
    name: 'Concrete',
    category: 'ground',
    defaultTile: 0.25,
    perspective: true,
    shading: 0.6,
    swatch: '#b9b6ae',
    draw: concrete,
  },
  {
    id: 'deck',
    name: 'Wood Deck',
    category: 'ground',
    defaultTile: 0.14,
    perspective: true,
    shading: 0.5,
    swatch: '#8a5a3a',
    draw: deck(['#8a5a3a', '#96653f', '#7d5033', '#a06e48']),
  },
  {
    id: 'siding-white',
    name: 'Siding – White',
    category: 'wall',
    defaultTile: 0.08,
    perspective: false,
    shading: 0.8,
    swatch: '#e9e7e1',
    draw: siding('#e9e7e1'),
  },
  {
    id: 'siding-gray',
    name: 'Siding – Gray',
    category: 'wall',
    defaultTile: 0.08,
    perspective: false,
    shading: 0.8,
    swatch: '#8c9095',
    draw: siding('#8c9095'),
  },
  {
    id: 'siding-navy',
    name: 'Siding – Navy',
    category: 'wall',
    defaultTile: 0.08,
    perspective: false,
    shading: 0.8,
    swatch: '#2f3e5a',
    draw: siding('#2f3e5a'),
  },
  {
    id: 'siding-sage',
    name: 'Siding – Sage',
    category: 'wall',
    defaultTile: 0.08,
    perspective: false,
    shading: 0.8,
    swatch: '#8a9a7e',
    draw: siding('#8a9a7e'),
  },
  {
    id: 'brick-wall',
    name: 'Brick',
    category: 'wall',
    defaultTile: 0.07,
    perspective: false,
    shading: 0.75,
    swatch: '#8e4332',
    draw: bond(128, 12, '#c9c2b4', ['#8e4332', '#9c4c38', '#7d3a2c', '#a55a44', '#86402f'], 6, 2),
  },
  {
    id: 'stone-veneer',
    name: 'Stone Veneer',
    category: 'wall',
    defaultTile: 0.12,
    perspective: false,
    shading: 0.75,
    swatch: '#9a8d7c',
    draw: voronoiStone(46, ['#9a8d7c', '#857a6c', '#b0a491', '#6f675d', '#a89682'], '#4a453e', 2.2, 2.5),
  },
];

export function getMaterial(id: string): MaterialDef | undefined {
  return MATERIALS.find((m) => m.id === id);
}
