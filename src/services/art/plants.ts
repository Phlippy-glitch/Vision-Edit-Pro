import { shade, shadeHex } from '../../utils/color';
import { pick, range, type Rng } from '../../utils/random';
import type { AssetDef } from './assets.types';
import {
  blobBounds,
  crownBlobs,
  insideBlobs,
  paintBloom,
  paintBranch,
  paintFoliage,
  paintTrunk,
} from './paint';

const LEAF_GREEN = ['#16301a', '#27501f', '#3e722c', '#5f933f', '#9dbd62'];
const SHRUB_GREEN = ['#18331a', '#2a5224', '#40722f', '#5f9240', '#95b85f'];

/** Dark → light palette derived from a single hex color. */
function paletteFrom(hex: string): string[] {
  return [shadeHex(hex, -0.55), shadeHex(hex, -0.28), hex, shadeHex(hex, 0.3), shadeHex(hex, 0.6)];
}

function ellipseInside(cx: number, cy: number, rx: number, ry: number, maxY = Infinity) {
  return (x: number, y: number) => y < maxY && ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < 1;
}

/** Five-petal flower head. */
function paintFlower(ctx: CanvasRenderingContext2D, rng: Rng, x: number, y: number, r: number, color: string) {
  const turn = rng() * Math.PI;
  for (let i = 0; i < 5; i++) {
    const a = turn + (i / 5) * Math.PI * 2;
    ctx.fillStyle = shade(color, (Math.sin(a) - 0.2) * -0.25);
    ctx.beginPath();
    ctx.ellipse(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.5, r * 0.36, a, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#f2c230';
  ctx.beginPath();
  ctx.arc(x, y, r * 0.22, 0, Math.PI * 2);
  ctx.fill();
}

const MIXED_FLOWERS = ['#e8364a', '#f6c12a', '#8b5cc7', '#ffffff', '#f28c2a', '#e85da8'];

function flowerColor(rng: Rng, option: string): string {
  return option === 'mixed' ? pick(rng, MIXED_FLOWERS) : option;
}

export const PLANT_ASSETS: AssetDef[] = [
  {
    id: 'shade-tree',
    name: 'Shade Tree',
    category: 'trees',
    aspect: 0.9,
    defaultHeight: 0.55,
    groundShadow: true,
    draw(ctx, w, h, rng) {
      const cx = w / 2;
      const cy = h * 0.37;
      const blobs = crownBlobs(rng, cx, cy, w * 0.42, h * 0.27, 10);
      paintTrunk(ctx, rng, cx, h, cx + (rng() - 0.5) * w * 0.04, cy, w * 0.09, w * 0.045);
      for (const b of blobs.slice(1, 7)) {
        paintBranch(ctx, cx, h * 0.58 - rng() * h * 0.08, b.x, b.y, w * 0.022);
      }
      paintFoliage(ctx, rng, {
        inside: insideBlobs(blobs),
        bounds: blobBounds(blobs),
        light: { x: cx, y: cy, r: w * 0.42 },
        palette: LEAF_GREEN,
        count: 1700,
        size: [w * 0.012, w * 0.024],
      });
    },
  },
  {
    id: 'spruce',
    name: 'Evergreen Spruce',
    category: 'trees',
    aspect: 0.55,
    defaultHeight: 0.5,
    groundShadow: true,
    draw(ctx, w, h, rng) {
      const cx = w / 2;
      const top = h * 0.02;
      const bottom = h * 0.9;
      paintTrunk(ctx, rng, cx, h, cx, h * 0.8, w * 0.08, w * 0.05, '#4a3528');
      const tiers = 7 + Math.floor(rng() * 3);
      paintFoliage(ctx, rng, {
        inside: (x, y) => {
          if (y < top || y > bottom) return false;
          const rel = (y - top) / (bottom - top);
          const phase = (rel * tiers) % 1;
          return Math.abs(x - cx) < w * 0.47 * rel ** 0.95 * (0.76 + 0.24 * phase);
        },
        bounds: { x: 0, y: top, w, h: bottom - top },
        light: { x: cx, y: h * 0.45, r: h * 0.45 },
        palette: ['#10261a', '#1c4029', '#2b5d3a', '#4d8052', '#7aa77a'],
        count: 2600,
        size: [w * 0.018, w * 0.035],
        elongation: 0.25,
        angle: (x, _y, r) => (x > cx ? 0.4 : -0.4) + (r() - 0.5) * 0.6,
      });
    },
  },
  {
    id: 'arborvitae',
    name: 'Arborvitae',
    category: 'trees',
    aspect: 0.34,
    defaultHeight: 0.42,
    groundShadow: true,
    draw(ctx, w, h, rng) {
      const cx = w / 2;
      const top = h * 0.02;
      const bottom = h * 0.98;
      const half = w * 0.46;
      paintFoliage(ctx, rng, {
        inside: (x, y) => {
          if (y < top || y > bottom) return false;
          const rel = (y - top) / (bottom - top);
          const width = rel < 0.5 ? Math.sqrt(1 - ((rel - 0.5) / 0.5) ** 2) : 1 - (rel - 0.5) * 0.3;
          return Math.abs(x - cx) < half * width;
        },
        bounds: { x: 0, y: top, w, h: bottom - top },
        light: { x: cx, y: h * 0.5, r: w * 0.6 },
        palette: ['#15301a', '#244d25', '#3a6b33', '#5f8f4a', '#8bb36a'],
        count: 2200,
        size: [w * 0.022, w * 0.04],
        elongation: 0.5,
        angle: (_x, _y, r) => -Math.PI / 2 + (r() - 0.5) * 0.8,
      });
    },
  },
  {
    id: 'japanese-maple',
    name: 'Japanese Maple',
    category: 'trees',
    aspect: 1.25,
    defaultHeight: 0.28,
    groundShadow: true,
    draw(ctx, w, h, rng) {
      const cx = w / 2;
      for (const lean of [-0.14, 0.02, 0.15]) {
        paintTrunk(ctx, rng, cx + lean * w * 0.15, h, cx + lean * w, h * 0.42, w * 0.035, w * 0.014, '#4d3a33');
      }
      const tiers = [
        { y: 0.24, rx: 0.36 },
        { y: 0.38, rx: 0.44 },
        { y: 0.52, rx: 0.36 },
      ];
      const blobs = tiers.flatMap((t) =>
        crownBlobs(rng, cx + (rng() - 0.5) * w * 0.06, h * t.y, w * t.rx, h * 0.1, 7),
      );
      paintFoliage(ctx, rng, {
        inside: insideBlobs(blobs),
        bounds: blobBounds(blobs),
        light: { x: cx, y: h * 0.38, r: w * 0.45 },
        palette: ['#3d0c10', '#6e171b', '#9e2b25', '#cc4b31', '#ef7f4f'],
        count: 2600,
        size: [w * 0.007, w * 0.014],
        elongation: 0.7,
      });
    },
  },
  {
    id: 'flowering-cherry',
    name: 'Flowering Tree',
    category: 'trees',
    aspect: 1,
    defaultHeight: 0.38,
    groundShadow: true,
    colors: [
      { label: 'Pink', value: '#e39ab5' },
      { label: 'White', value: '#f3eeee' },
      { label: 'Purple', value: '#a97cc4' },
    ],
    draw(ctx, w, h, rng, color) {
      const cx = w / 2;
      const cy = h * 0.38;
      const blobs = crownBlobs(rng, cx, cy, w * 0.42, h * 0.27, 10);
      paintTrunk(ctx, rng, cx, h, cx, cy + h * 0.05, w * 0.07, w * 0.035, '#3e2f2a');
      for (const b of blobs.slice(1, 8)) paintBranch(ctx, cx, h * 0.62, b.x, b.y, w * 0.016, '#3e2f2a');
      paintFoliage(ctx, rng, {
        inside: insideBlobs(blobs),
        bounds: blobBounds(blobs),
        light: { x: cx, y: cy, r: w * 0.42 },
        palette: paletteFrom(color),
        count: 2600,
        size: [w * 0.008, w * 0.017],
        elongation: 0.85,
      });
    },
  },
  {
    id: 'palm',
    name: 'Palm Tree',
    category: 'trees',
    aspect: 0.8,
    defaultHeight: 0.55,
    groundShadow: true,
    draw(ctx, w, h, rng) {
      const cx = w / 2;
      const topX = cx + w * 0.06;
      const topY = h * 0.22;
      const segments = 26;
      for (let i = 0; i < segments; i++) {
        const t = i / segments;
        const x = cx + (topX - cx) * t + Math.sin(t * Math.PI) * w * 0.05;
        const y = h - (h - topY) * t;
        const segH = (h - topY) / segments + 1;
        const width = w * (0.085 - 0.03 * t);
        const grad = ctx.createLinearGradient(x - width / 2, 0, x + width / 2, 0);
        grad.addColorStop(0, '#a58c6c');
        grad.addColorStop(0.5, '#8a7258');
        grad.addColorStop(1, '#4e3f30');
        ctx.fillStyle = grad;
        ctx.fillRect(x - width / 2, y - segH, width, segH);
        ctx.fillStyle = 'rgba(40,30,20,0.45)';
        ctx.fillRect(x - width / 2, y - 2, width, 2);
      }
      const fronds = 12;
      const order = Array.from({ length: fronds }, (_, i) => (i / fronds) * Math.PI * 2 + rng() * 0.3);
      // Fronds pointing up are further back; draw them first.
      order.sort((a, b) => Math.sin(a) - Math.sin(b));
      for (const a of order) {
        const length = w * range(rng, 0.34, 0.42);
        const dirX = Math.cos(a);
        const dirY = Math.sin(a) * 0.55;
        const end = { x: topX + dirX * length, y: topY + dirY * length + length * 0.45 };
        const ctrl = { x: topX + dirX * length * 0.6, y: topY + dirY * length * 0.6 - length * 0.22 };
        const lit = 0.5 - Math.sin(a) * 0.3 - dirX * 0.2;
        const green = pick(rng, ['#2e5a24', '#3d6f2c', '#4f8236']);
        ctx.strokeStyle = shade(green, (lit - 0.5) * 0.6);
        ctx.lineWidth = Math.max(1, w * 0.005);
        for (let t = 0.08; t <= 1; t += 0.028) {
          const px = (1 - t) ** 2 * topX + 2 * (1 - t) * t * ctrl.x + t * t * end.x;
          const py = (1 - t) ** 2 * topY + 2 * (1 - t) * t * ctrl.y + t * t * end.y;
          const tx = 2 * (1 - t) * (ctrl.x - topX) + 2 * t * (end.x - ctrl.x);
          const ty = 2 * (1 - t) * (ctrl.y - topY) + 2 * t * (end.y - ctrl.y);
          const len = Math.hypot(tx, ty) || 1;
          const leaf = length * 0.2 * (1 - t * 0.55);
          for (const side of [-1, 1]) {
            const nx = (-ty / len) * side;
            const ny = (tx / len) * side;
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(px + nx * leaf + (tx / len) * leaf * 0.5, py + ny * leaf + (ty / len) * leaf * 0.5 + leaf * 0.35);
            ctx.stroke();
          }
        }
        ctx.strokeStyle = '#6a7a3a';
        ctx.lineWidth = w * 0.008;
        ctx.beginPath();
        ctx.moveTo(topX, topY);
        ctx.quadraticCurveTo(ctrl.x, ctrl.y, end.x, end.y);
        ctx.stroke();
      }
    },
  },
  {
    id: 'boxwood',
    name: 'Boxwood',
    category: 'shrubs',
    aspect: 1.3,
    defaultHeight: 0.09,
    groundShadow: true,
    draw(ctx, w, h, rng) {
      const cx = w / 2;
      paintFoliage(ctx, rng, {
        inside: ellipseInside(cx, h * 0.53, w * 0.47, h * 0.46, h * 0.99),
        bounds: { x: 0, y: 0, w, h },
        light: { x: cx, y: h * 0.53, r: w * 0.47 },
        palette: SHRUB_GREEN,
        count: 3000,
        size: [w * 0.008, w * 0.016],
        elongation: 0.65,
      });
    },
  },
  {
    id: 'hedge',
    name: 'Hedge',
    category: 'shrubs',
    aspect: 3,
    defaultHeight: 0.11,
    groundShadow: true,
    draw(ctx, w, h, rng) {
      const top = h * 0.08;
      const radius = h * 0.3;
      const x0 = w * 0.015;
      const x1 = w * 0.985;
      const inside = (x: number, y: number) => {
        if (y < top || y > h * 0.99 || x < x0 || x > x1) return false;
        const cx = Math.min(Math.max(x, x0 + radius), x1 - radius);
        const cy = Math.max(y, top + radius);
        return (x - cx) ** 2 + (y - cy) ** 2 < radius * radius;
      };
      paintFoliage(ctx, rng, {
        inside,
        bounds: { x: 0, y: top, w, h: h - top },
        light: { x: w / 2, y: h / 2, r: h },
        palette: SHRUB_GREEN,
        count: 8000,
        size: [h * 0.012, h * 0.025],
        lightAt: (x, y) => 0.85 - ((y - top) / (h - top)) * 0.6 + (x < x0 + radius ? 0.1 : 0) - (x > x1 - radius ? 0.15 : 0),
      });
    },
  },
  {
    id: 'hydrangea',
    name: 'Hydrangea',
    category: 'shrubs',
    aspect: 1.3,
    defaultHeight: 0.12,
    groundShadow: true,
    colors: [
      { label: 'Blue', value: '#6f8fd8' },
      { label: 'Pink', value: '#e59ac0' },
      { label: 'White', value: '#eeeee4' },
      { label: 'Lime', value: '#cfe08a' },
    ],
    draw(ctx, w, h, rng, color) {
      const cx = w / 2;
      const cy = h * 0.55;
      const rx = w * 0.46;
      const ry = h * 0.44;
      paintFoliage(ctx, rng, {
        inside: ellipseInside(cx, cy, rx, ry, h * 0.99),
        bounds: { x: 0, y: 0, w, h },
        light: { x: cx, y: cy, r: rx },
        palette: ['#1d3a1c', '#2f5a2a', '#46793a', '#6a9a50', '#9cc27a'],
        count: 1400,
        size: [w * 0.016, w * 0.03],
      });
      const heads: { x: number; y: number; r: number }[] = [];
      for (let i = 0; i < 16; i++) {
        const a = rng() * Math.PI * 2;
        const d = Math.sqrt(rng()) * 0.78;
        const y = cy + Math.sin(a) * ry * d * 0.9 - ry * 0.12;
        heads.push({ x: cx + Math.cos(a) * rx * d, y, r: w * range(rng, 0.065, 0.095) });
      }
      heads.sort((a, b) => a.y - b.y);
      for (const head of heads) paintBloom(ctx, rng, head.x, head.y, head.r, paletteFrom(color), 110, head.r * 0.17);
    },
  },
  {
    id: 'flowering-shrub',
    name: 'Azalea / Rose',
    category: 'shrubs',
    aspect: 1.3,
    defaultHeight: 0.1,
    groundShadow: true,
    colors: [
      { label: 'Red', value: '#d42f4a' },
      { label: 'Pink', value: '#ee74a6' },
      { label: 'White', value: '#f5f0f2' },
      { label: 'Coral', value: '#f2784b' },
    ],
    draw(ctx, w, h, rng, color) {
      const cx = w / 2;
      const cy = h * 0.54;
      const rx = w * 0.47;
      const ry = h * 0.45;
      const inside = ellipseInside(cx, cy, rx, ry, h * 0.99);
      paintFoliage(ctx, rng, {
        inside,
        bounds: { x: 0, y: 0, w, h },
        light: { x: cx, y: cy, r: rx },
        palette: ['#142a14', '#224222', '#335e2c', '#4d7a3c', '#7da05a'],
        count: 2400,
        size: [w * 0.008, w * 0.015],
      });
      for (let i = 0; i < 320; i++) {
        const x = rng() * w;
        const y = rng() * h * 0.85;
        if (!inside(x, y)) continue;
        const lit = 0.3 - ((x - cx) / rx) * 0.2 - ((y - cy) / ry) * 0.25;
        paintFlower(ctx, rng, x, y, w * range(rng, 0.012, 0.018), shadeHex(color, lit * 0.4));
      }
    },
  },
  {
    id: 'ornamental-grass',
    name: 'Ornamental Grass',
    category: 'flowers',
    aspect: 1.2,
    defaultHeight: 0.12,
    groundShadow: true,
    colors: [
      { label: 'Wheat', value: '#b8a86a' },
      { label: 'Green', value: '#7f9a4a' },
      { label: 'Burgundy', value: '#8a4a4e' },
    ],
    draw(ctx, w, h, rng, color) {
      const cx = w / 2;
      const blades = Array.from({ length: 280 }, () => ({ a: (rng() - 0.5) * 1.9, r: rng() }));
      blades.sort((p, q) => Math.abs(q.a) - Math.abs(p.a));
      ctx.lineCap = 'round';
      for (const blade of blades) {
        const bx = cx + (rng() - 0.5) * w * 0.16;
        const length = h * range(rng, 0.6, 0.97) * (1 - Math.abs(blade.a) * 0.22);
        const tipX = bx + Math.sin(blade.a) * length * 0.95;
        const tipY = h - Math.cos(blade.a) * length * 0.85;
        ctx.strokeStyle = shade(color, (blade.r - 0.55) * 0.7);
        ctx.lineWidth = w * range(rng, 0.004, 0.008);
        ctx.beginPath();
        ctx.moveTo(bx, h);
        ctx.quadraticCurveTo(bx + Math.sin(blade.a) * length * 0.3, h - length * 0.8, tipX, tipY);
        ctx.stroke();
        if (blade.r > 0.78) {
          ctx.fillStyle = shade('#efe3bf', (blade.r - 0.9) * 0.6, 0.85);
          ctx.beginPath();
          ctx.ellipse(tipX, tipY + h * 0.03, w * 0.012, h * 0.05, blade.a, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    },
  },
  {
    id: 'lavender',
    name: 'Lavender',
    category: 'flowers',
    aspect: 1.5,
    defaultHeight: 0.07,
    groundShadow: true,
    draw(ctx, w, h, rng) {
      const cx = w / 2;
      ctx.lineCap = 'round';
      for (let i = 0; i < 140; i++) {
        const bx = cx + (rng() - 0.5) * w * 0.5;
        const by = h * 0.86;
        const a = ((bx - cx) / w) * 1.5 + (rng() - 0.5) * 0.3;
        const length = h * range(rng, 0.45, 0.78);
        const tx = bx + Math.sin(a) * length;
        const ty = by - Math.cos(a) * length;
        ctx.strokeStyle = '#6f8a5a';
        ctx.lineWidth = w * 0.003;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        for (let k = 0; k < 11; k++) {
          const t = 0.7 + k * 0.028;
          const lit = rng();
          ctx.fillStyle = pick(rng, ['#4b3a7a', '#6c56a8', '#8f7ac9', '#b7a6e3'].slice(lit > 0.5 ? 1 : 0));
          ctx.beginPath();
          ctx.ellipse(bx + Math.sin(a) * length * t, by - Math.cos(a) * length * t, w * 0.007, h * 0.016, a, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      paintFoliage(ctx, rng, {
        inside: ellipseInside(cx, h * 0.88, w * 0.42, h * 0.2, h * 0.99),
        bounds: { x: 0, y: h * 0.66, w, h: h * 0.34 },
        light: { x: cx, y: h * 0.88, r: w * 0.42 },
        palette: ['#3e4f3e', '#5b715a', '#7f9680', '#a9bba7'],
        count: 900,
        size: [w * 0.012, w * 0.022],
        elongation: 0.3,
        angle: (_x, _y, r) => -Math.PI / 2 + (r() - 0.5) * 1.2,
      });
    },
  },
  {
    id: 'hosta',
    name: 'Hosta',
    category: 'flowers',
    aspect: 1.6,
    defaultHeight: 0.07,
    groundShadow: true,
    colors: [
      { label: 'Green', value: '#4f7a3a' },
      { label: 'Blue-green', value: '#557f7a' },
      { label: 'Lime', value: '#9ab04a' },
    ],
    draw(ctx, w, h, rng, color) {
      const cx = w / 2;
      const baseY = h * 0.95;
      const leaves = Array.from({ length: 26 }, () => ({ a: (rng() - 0.5) * 2.7, s: range(rng, 0.5, 0.75) }));
      leaves.sort((p, q) => Math.abs(q.a) - Math.abs(p.a));
      for (const leaf of leaves) {
        const length = h * leaf.s;
        const width = length * 0.55;
        ctx.save();
        ctx.translate(cx + Math.sin(leaf.a) * w * 0.05, baseY);
        ctx.rotate(leaf.a * 0.85);
        ctx.scale(1, 0.9);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.bezierCurveTo(-width, -length * 0.3, -width * 0.7, -length * 0.85, 0, -length);
        ctx.bezierCurveTo(width * 0.7, -length * 0.85, width, -length * 0.3, 0, 0);
        const grad = ctx.createLinearGradient(-width, 0, width, 0);
        const lit = -Math.sin(leaf.a) * 0.15;
        grad.addColorStop(0, shade(color, 0.12 + lit));
        grad.addColorStop(1, shade(color, -0.3 + lit));
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.strokeStyle = shade(color, 0.35, 0.7);
        ctx.lineWidth = w * 0.003;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, -length * 0.95);
        for (let v = 0.25; v < 0.9; v += 0.15) {
          for (const side of [-1, 1]) {
            ctx.moveTo(0, -length * v);
            ctx.quadraticCurveTo(side * width * 0.35, -length * (v + 0.08), side * width * 0.45, -length * (v + 0.2));
          }
        }
        ctx.stroke();
        ctx.restore();
      }
    },
  },
  {
    id: 'annual-flowers',
    name: 'Flower Bed',
    category: 'flowers',
    aspect: 2.4,
    defaultHeight: 0.05,
    groundShadow: false,
    colors: [
      { label: 'Mixed', value: 'mixed' },
      { label: 'Red', value: '#e8364a' },
      { label: 'Yellow', value: '#f6c12a' },
      { label: 'Purple', value: '#8b5cc7' },
      { label: 'White', value: '#ffffff' },
    ],
    draw(ctx, w, h, rng, color) {
      const cx = w / 2;
      const inside = ellipseInside(cx, h, w * 0.49, h * 0.92);
      paintFoliage(ctx, rng, {
        inside,
        bounds: { x: 0, y: 0, w, h },
        light: { x: cx, y: h * 0.8, r: w * 0.4 },
        palette: ['#173017', '#28481f', '#3b662c', '#5a8a40'],
        count: 3400,
        size: [h * 0.025, h * 0.05],
      });
      for (let i = 0; i < 700; i++) {
        const x = rng() * w;
        const y = rng() * h * 0.95;
        if (!inside(x, y)) continue;
        paintFlower(ctx, rng, x, y, h * range(rng, 0.035, 0.055), flowerColor(rng, color));
      }
    },
  },
];
