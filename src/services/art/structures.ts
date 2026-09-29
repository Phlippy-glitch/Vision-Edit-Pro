import { shade, shadeHex } from '../../utils/color';
import { pick, range } from '../../utils/random';
import type { AssetDef } from './assets.types';
import { cylinderGradient, paintFoliage, speckle } from './paint';

function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, 'rgba(255,226,150,0.75)');
  g.addColorStop(0.35, 'rgba(255,210,120,0.3)');
  g.addColorStop(1, 'rgba(255,200,110,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/** A raised panel: dark bevel top-left, light bevel bottom-right. */
function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  const bevel = Math.max(2, Math.min(w, h) * 0.08);
  ctx.fillStyle = shade(color, -0.3);
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = shade(color, 0.18);
  ctx.fillRect(x + bevel, y + bevel, w - bevel, h - bevel);
  ctx.fillStyle = color;
  ctx.fillRect(x + bevel, y + bevel, w - bevel * 2, h - bevel * 2);
}

export const STRUCTURE_ASSETS: AssetDef[] = [
  {
    id: 'boulder',
    name: 'Boulder',
    category: 'hardscape',
    aspect: 1.5,
    defaultHeight: 0.06,
    groundShadow: true,
    colors: [
      { label: 'Granite', value: '#8a857c' },
      { label: 'Sandstone', value: '#a8927a' },
      { label: 'Basalt', value: '#5f5b55' },
    ],
    draw(ctx, w, h, rng, color) {
      const cx = w / 2;
      const cy = h * 0.6;
      const rx = w * 0.46;
      const ry = h * 0.56;
      const points = Array.from({ length: 14 }, (_, i) => {
        const a = (i / 14) * Math.PI * 2;
        const r = range(rng, 0.84, 1.03);
        return { x: cx + Math.cos(a) * rx * r, y: Math.min(h * 0.985, cy + Math.sin(a) * ry * r) };
      });
      const outline = new Path2D();
      points.forEach((p, i) => (i ? outline.lineTo(p.x, p.y) : outline.moveTo(p.x, p.y)));
      outline.closePath();
      const g = ctx.createRadialGradient(cx - rx * 0.4, cy - ry * 0.55, rx * 0.05, cx, cy, rx * 1.15);
      g.addColorStop(0, shade(color, 0.35));
      g.addColorStop(0.5, color);
      g.addColorStop(1, shade(color, -0.55));
      ctx.fillStyle = g;
      ctx.fill(outline);
      ctx.save();
      ctx.clip(outline);
      // Facets give the rock planes that catch light differently.
      for (let i = 0; i < 4; i++) {
        const p = points[Math.floor(rng() * points.length)];
        ctx.fillStyle = rng() > 0.5 ? shade(color, -0.2, 0.35) : shade(color, 0.2, 0.25);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(cx + (rng() - 0.5) * rx, cy + (rng() - 0.5) * ry);
        ctx.lineTo(cx + (rng() - 0.5) * rx * 1.6, cy + (rng() - 0.3) * ry);
        ctx.fill();
      }
      speckle(ctx, rng, { x: 0, y: 0, w, h }, 4000, w * 0.004, [shade(color, 0.3, 0.6), shade(color, -0.4, 0.6)]);
      const bottom = ctx.createLinearGradient(0, h * 0.7, 0, h);
      bottom.addColorStop(0, 'rgba(0,0,0,0)');
      bottom.addColorStop(1, 'rgba(0,0,0,0.45)');
      ctx.fillStyle = bottom;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    },
  },
  {
    id: 'planter',
    name: 'Planter Pot',
    category: 'hardscape',
    aspect: 0.8,
    defaultHeight: 0.1,
    groundShadow: true,
    colors: [
      { label: 'Terracotta', value: '#b8643e' },
      { label: 'Charcoal', value: '#3b3b3d' },
      { label: 'White', value: '#e8e4dc' },
      { label: 'Blue glaze', value: '#2f5b86' },
    ],
    draw(ctx, w, h, rng, color) {
      const cx = w / 2;
      const top = h * 0.5;
      paintFoliage(ctx, rng, {
        inside: (x, y) => ((x - cx) / (w * 0.4)) ** 2 + ((y - h * 0.3) / (h * 0.26)) ** 2 < 1,
        bounds: { x: 0, y: 0, w, h: h * 0.6 },
        light: { x: cx, y: h * 0.3, r: w * 0.4 },
        palette: ['#18331a', '#2a5224', '#40722f', '#5f9240', '#95b85f'],
        count: 1300,
        size: [w * 0.012, w * 0.022],
      });
      ctx.fillStyle = cylinderGradient(ctx, cx - w * 0.4, cx + w * 0.4, color);
      ctx.beginPath();
      ctx.moveTo(cx - w * 0.4, top + h * 0.06);
      ctx.lineTo(cx + w * 0.4, top + h * 0.06);
      ctx.lineTo(cx + w * 0.28, h);
      ctx.lineTo(cx - w * 0.28, h);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = cylinderGradient(ctx, cx - w * 0.44, cx + w * 0.44, shadeHex(color, 0.05));
      ctx.fillRect(cx - w * 0.44, top, w * 0.88, h * 0.07);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(cx - w * 0.4, top + h * 0.07, w * 0.8, h * 0.015);
    },
  },
  {
    id: 'path-light',
    name: 'Path Light',
    category: 'hardscape',
    aspect: 0.32,
    defaultHeight: 0.05,
    groundShadow: false,
    draw(ctx, w, h) {
      const cx = w / 2;
      glow(ctx, cx, h * 0.27, w * 0.5);
      ctx.fillStyle = cylinderGradient(ctx, cx - w * 0.07, cx + w * 0.07, '#2c2c2c');
      ctx.fillRect(cx - w * 0.07, h * 0.28, w * 0.14, h * 0.72);
      ctx.fillStyle = '#ffe7a8';
      ctx.fillRect(cx - w * 0.18, h * 0.2, w * 0.36, h * 0.09);
      ctx.fillStyle = '#1f1f1f';
      ctx.beginPath();
      ctx.moveTo(cx, h * 0.06);
      ctx.lineTo(cx + w * 0.46, h * 0.21);
      ctx.lineTo(cx - w * 0.46, h * 0.21);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath();
      ctx.moveTo(cx, h * 0.06);
      ctx.lineTo(cx - w * 0.46, h * 0.21);
      ctx.lineTo(cx - w * 0.1, h * 0.21);
      ctx.closePath();
      ctx.fill();
    },
  },
  {
    id: 'fire-pit',
    name: 'Fire Pit',
    category: 'hardscape',
    aspect: 2.2,
    defaultHeight: 0.09,
    groundShadow: true,
    draw(ctx, w, h, rng) {
      const cx = w / 2;
      const rx = w * 0.46;
      const ry = h * 0.2;
      const topY = h * 0.55;
      const wall = h * 0.4;
      const stone = '#9a9186';
      // Wall: front half of the ring extruded downward.
      ctx.fillStyle = cylinderGradient(ctx, cx - rx, cx + rx, stone);
      ctx.beginPath();
      ctx.ellipse(cx, topY, rx, ry, 0, 0, Math.PI);
      ctx.lineTo(cx - rx, topY + wall);
      ctx.ellipse(cx, topY + wall, rx, ry, 0, Math.PI, 0, true);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(40,35,30,0.6)';
      ctx.lineWidth = Math.max(1.5, h * 0.006);
      for (let row = 0; row < 3; row++) {
        const y = topY + (wall / 3) * row;
        ctx.beginPath();
        ctx.ellipse(cx, y, rx, ry, 0, 0, Math.PI);
        ctx.stroke();
        for (let a = (row % 2) * 0.12 + 0.06; a < Math.PI; a += 0.24) {
          const x = cx + Math.cos(a) * rx;
          const yy = y + Math.sin(a) * ry;
          ctx.beginPath();
          ctx.moveTo(x, yy);
          ctx.lineTo(x, yy + wall / 3);
          ctx.stroke();
        }
      }
      ctx.fillStyle = shade(stone, 0.2);
      ctx.beginPath();
      ctx.ellipse(cx, topY, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1b1612';
      ctx.beginPath();
      ctx.ellipse(cx, topY, rx * 0.8, ry * 0.72, 0, 0, Math.PI * 2);
      ctx.fill();
      glow(ctx, cx, topY - h * 0.05, rx * 0.8);
      for (let i = 0; i < 7; i++) {
        const fx = cx + (rng() - 0.5) * rx * 0.9;
        const fh = h * range(rng, 0.25, 0.5);
        const fw = w * range(rng, 0.03, 0.06);
        const g = ctx.createLinearGradient(0, topY - fh, 0, topY);
        g.addColorStop(0, 'rgba(255,220,90,0)');
        g.addColorStop(0.35, pick(rng, ['#ffb52e', '#ffc947']));
        g.addColorStop(1, '#e8531c');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(fx - fw, topY);
        ctx.quadraticCurveTo(fx - fw * 0.8, topY - fh * 0.6, fx + (rng() - 0.5) * fw, topY - fh);
        ctx.quadraticCurveTo(fx + fw * 0.8, topY - fh * 0.6, fx + fw, topY);
        ctx.fill();
      }
    },
  },
  {
    id: 'front-door',
    name: 'Front Door',
    category: 'house',
    aspect: 0.5,
    defaultHeight: 0.22,
    groundShadow: false,
    colors: [
      { label: 'Red', value: '#8e1f24' },
      { label: 'Black', value: '#1e1f22' },
      { label: 'Navy', value: '#1f2f4f' },
      { label: 'Sage', value: '#6f8466' },
      { label: 'Wood', value: '#7a4a28' },
      { label: 'Yellow', value: '#d9a82e' },
    ],
    draw(ctx, w, h, _rng, color) {
      ctx.fillStyle = '#f2f0ea';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(w * 0.08, h * 0.05, w * 0.84, h * 0.012);
      const dx = w * 0.1;
      const dy = h * 0.06;
      const dw = w * 0.8;
      const dh = h - dy;
      const g = ctx.createLinearGradient(dx, 0, dx + dw, 0);
      g.addColorStop(0, shade(color, 0.08));
      g.addColorStop(1, shade(color, -0.15));
      ctx.fillStyle = g;
      ctx.fillRect(dx, dy, dw, dh);
      const pw = dw * 0.34;
      const rows = [
        [0.06, 0.2],
        [0.32, 0.3],
        [0.68, 0.27],
      ];
      for (const [top, height] of rows) {
        for (const col of [0.1, 0.56]) {
          panel(ctx, dx + dw * col, dy + dh * top, pw, dh * height, color);
        }
      }
      ctx.fillStyle = '#c9a44a';
      ctx.beginPath();
      ctx.arc(dx + dw * 0.9, dy + dh * 0.53, dw * 0.035, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#8a6a22';
      ctx.fillRect(dx + dw * 0.885, dy + dh * 0.46, dw * 0.03, dh * 0.05);
    },
  },
  {
    id: 'shutter',
    name: 'Shutter',
    category: 'house',
    aspect: 0.36,
    defaultHeight: 0.18,
    groundShadow: false,
    colors: [
      { label: 'Black', value: '#1f2023' },
      { label: 'Navy', value: '#223453' },
      { label: 'Forest', value: '#2e4a36' },
      { label: 'Gray', value: '#6b6f72' },
      { label: 'White', value: '#ecebe6' },
    ],
    draw(ctx, w, h, _rng, color) {
      ctx.fillStyle = shade(color, -0.1);
      ctx.fillRect(0, 0, w, h);
      const frame = w * 0.12;
      for (const [top, bottom] of [
        [0.04, 0.47],
        [0.53, 0.96],
      ]) {
        const y0 = h * top;
        const y1 = h * bottom;
        ctx.fillStyle = shade(color, -0.35);
        ctx.fillRect(frame, y0, w - frame * 2, y1 - y0);
        for (let y = y0; y < y1; y += h * 0.022) {
          ctx.fillStyle = shade(color, 0.12);
          ctx.fillRect(frame, y, w - frame * 2, h * 0.014);
          ctx.fillStyle = shade(color, -0.25);
          ctx.fillRect(frame, y + h * 0.014, w - frame * 2, h * 0.004);
        }
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, w - 2, h - 2);
    },
  },
  {
    id: 'window-box',
    name: 'Window Box',
    category: 'house',
    aspect: 2.6,
    defaultHeight: 0.06,
    groundShadow: false,
    colors: [
      { label: 'White', value: '#ecebe6' },
      { label: 'Black', value: '#26272a' },
      { label: 'Cedar', value: '#9a6a42' },
    ],
    draw(ctx, w, h, rng, color) {
      const boxTop = h * 0.55;
      paintFoliage(ctx, rng, {
        inside: (x, y) => y < boxTop + 4 && ((x - w / 2) / (w * 0.48)) ** 2 + ((y - boxTop) / (h * 0.5)) ** 2 < 1,
        bounds: { x: 0, y: 0, w, h: boxTop + 4 },
        light: { x: w / 2, y: boxTop, r: w * 0.4 },
        palette: ['#173017', '#28481f', '#3b662c', '#5a8a40'],
        count: 2400,
        size: [h * 0.03, h * 0.055],
      });
      for (let i = 0; i < 260; i++) {
        const x = w * 0.04 + rng() * w * 0.92;
        const y = boxTop - rng() * h * 0.4;
        ctx.fillStyle = pick(rng, ['#e8364a', '#ffffff', '#f06fa0', '#8b5cc7']);
        ctx.beginPath();
        ctx.arc(x, y, h * range(rng, 0.025, 0.04), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = color;
      ctx.fillRect(w * 0.02, boxTop, w * 0.96, h - boxTop);
      ctx.fillStyle = shade(color, -0.2);
      ctx.fillRect(w * 0.02, boxTop + (h - boxTop) * 0.45, w * 0.96, 3);
      ctx.fillStyle = shade(color, 0.15);
      ctx.fillRect(w * 0.01, boxTop, w * 0.98, (h - boxTop) * 0.12);
      ctx.strokeStyle = '#3f6a2c';
      ctx.lineWidth = h * 0.012;
      for (let i = 0; i < 14; i++) {
        const x = w * 0.05 + rng() * w * 0.9;
        const len = h * range(rng, 0.2, 0.42);
        ctx.beginPath();
        ctx.moveTo(x, boxTop);
        ctx.quadraticCurveTo(x + (rng() - 0.5) * w * 0.05, boxTop + len * 0.6, x + (rng() - 0.5) * w * 0.04, boxTop + len);
        ctx.stroke();
        for (let k = 0.2; k < 1; k += 0.2) {
          ctx.fillStyle = pick(rng, ['#3b662c', '#5a8a40']);
          ctx.beginPath();
          ctx.ellipse(x + (rng() - 0.5) * 8, boxTop + len * k, h * 0.03, h * 0.02, rng() * 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    },
  },
  {
    id: 'wall-lantern',
    name: 'Wall Lantern',
    category: 'house',
    aspect: 0.5,
    defaultHeight: 0.06,
    groundShadow: false,
    colors: [
      { label: 'Black', value: '#1d1d1f' },
      { label: 'Bronze', value: '#5a4632' },
    ],
    draw(ctx, w, h, _rng, color) {
      const cx = w / 2;
      glow(ctx, cx, h * 0.5, w * 0.5);
      ctx.fillStyle = color;
      ctx.fillRect(cx - w * 0.08, h * 0.1, w * 0.16, h * 0.8);
      ctx.beginPath();
      ctx.moveTo(cx - w * 0.36, h * 0.24);
      ctx.lineTo(cx + w * 0.36, h * 0.24);
      ctx.lineTo(cx + w * 0.2, h * 0.12);
      ctx.lineTo(cx - w * 0.2, h * 0.12);
      ctx.closePath();
      ctx.fill();
      const glass = ctx.createLinearGradient(0, h * 0.26, 0, h * 0.72);
      glass.addColorStop(0, '#fff3c9');
      glass.addColorStop(1, '#f5bf5c');
      ctx.fillStyle = glass;
      ctx.fillRect(cx - w * 0.28, h * 0.25, w * 0.56, h * 0.47);
      ctx.fillStyle = color;
      for (const x of [-0.3, -0.02, 0.26]) ctx.fillRect(cx + w * x, h * 0.25, w * 0.04, h * 0.47);
      ctx.fillRect(cx - w * 0.32, h * 0.71, w * 0.64, h * 0.05);
      ctx.fillRect(cx - w * 0.12, h * 0.76, w * 0.24, h * 0.06);
    },
  },
];

