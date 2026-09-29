export type RGB = [number, number, number];

export function hexToRgb(hex: string): RGB {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? value.replace(/./g, (c) => c + c) : value;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function mixRgb(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function scaleRgb(c: RGB, factor: number): RGB {
  return [c[0] * factor, c[1] * factor, c[2] * factor];
}

export function rgbCss(c: RGB, alpha = 1): string {
  const r = Math.round(Math.min(255, Math.max(0, c[0])));
  const g = Math.round(Math.min(255, Math.max(0, c[1])));
  const b = Math.round(Math.min(255, Math.max(0, c[2])));
  return alpha >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alpha})`;
}

/** Mixes two hex colors and returns a CSS color string. */
export function mixCss(a: string, b: string, t: number, alpha = 1): string {
  return rgbCss(mixRgb(hexToRgb(a), hexToRgb(b), t), alpha);
}

export function rgbHex(c: RGB): string {
  return `#${c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;
}

/** Like `shade`, but returns a hex color usable as input to other helpers. */
export function shadeHex(hex: string, amount: number): string {
  const target: RGB = amount >= 0 ? [255, 255, 255] : [0, 0, 0];
  return rgbHex(mixRgb(hexToRgb(hex), target, Math.abs(amount)));
}

/** Shifts a hex color lighter (amount > 0) or darker (amount < 0). */
export function shade(hex: string, amount: number, alpha = 1): string {
  const target = amount >= 0 ? '#ffffff' : '#000000';
  return mixCss(hex, target, Math.abs(amount), alpha);
}
