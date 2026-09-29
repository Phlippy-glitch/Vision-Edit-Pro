/**
 * Canvas-free pixel helpers. They operate on plain typed arrays so they can
 * run in workers and unit tests.
 */

/** Structural twin of ImageData that is also constructible outside the DOM. */
export interface RGBAImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export function createRGBAImage(width: number, height: number): RGBAImage {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

/**
 * In-place separable box blur of a single-channel float image.
 * Running sums keep this O(pixels) regardless of radius.
 */
export function boxBlur(values: Float32Array, width: number, height: number, radius: number): void {
  const r = Math.floor(radius);
  if (r < 1) return;
  const tmp = new Float32Array(Math.max(width, height));
  const blurLine = (start: number, stride: number, length: number) => {
    let sum = 0;
    for (let i = -r; i <= r; i++) {
      sum += values[start + Math.min(length - 1, Math.max(0, i)) * stride];
    }
    const norm = 1 / (2 * r + 1);
    for (let i = 0; i < length; i++) {
      tmp[i] = sum * norm;
      const add = Math.min(length - 1, i + r + 1);
      const sub = Math.max(0, i - r);
      sum += values[start + add * stride] - values[start + sub * stride];
    }
    for (let i = 0; i < length; i++) values[start + i * stride] = tmp[i];
  };
  for (let y = 0; y < height; y++) blurLine(y * width, 1, width);
  for (let x = 0; x < width; x++) blurLine(x, width, height);
}

/** Rec. 601 luma in 0..1 for every pixel. */
export function luminance(image: RGBAImage): Float32Array {
  const { data } = image;
  const out = new Float32Array(image.width * image.height);
  for (let i = 0, p = 0; i < out.length; i++, p += 4) {
    out[i] = (0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]) / 255;
  }
  return out;
}

/** Copies a rectangle out of an image; pixels outside the source are transparent. */
export function cropImage(image: RGBAImage, x: number, y: number, width: number, height: number): RGBAImage {
  const out = createRGBAImage(width, height);
  for (let row = 0; row < height; row++) {
    const sy = y + row;
    if (sy < 0 || sy >= image.height) continue;
    for (let col = 0; col < width; col++) {
      const sx = x + col;
      if (sx < 0 || sx >= image.width) continue;
      const s = (sy * image.width + sx) * 4;
      const d = (row * width + col) * 4;
      out.data[d] = image.data[s];
      out.data[d + 1] = image.data[s + 1];
      out.data[d + 2] = image.data[s + 2];
      out.data[d + 3] = image.data[s + 3];
    }
  }
  return out;
}

/** Halves an image with a 2x2 box filter (used to build texture mipmaps). */
export function downsampleHalf(image: RGBAImage): RGBAImage {
  const width = Math.max(1, image.width >> 1);
  const height = Math.max(1, image.height >> 1);
  const out = createRGBAImage(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const x0 = Math.min(image.width - 1, x * 2);
      const y0 = Math.min(image.height - 1, y * 2);
      const x1 = Math.min(image.width - 1, x0 + 1);
      const y1 = Math.min(image.height - 1, y0 + 1);
      const a = (y0 * image.width + x0) * 4;
      const b = (y0 * image.width + x1) * 4;
      const c = (y1 * image.width + x0) * 4;
      const d = (y1 * image.width + x1) * 4;
      const o = (y * width + x) * 4;
      for (let k = 0; k < 4; k++) {
        out.data[o + k] = (image.data[a + k] + image.data[b + k] + image.data[c + k] + image.data[d + k]) / 4;
      }
    }
  }
  return out;
}

export function buildMipChain(image: RGBAImage, minSize = 8): RGBAImage[] {
  const chain = [image];
  let current = image;
  while (current.width > minSize && current.height > minSize) {
    current = downsampleHalf(current);
    chain.push(current);
  }
  return chain;
}

/**
 * Bilinear sample with wrap-around addressing (for tiling textures).
 * Writes RGB into `out` (0..255).
 */
export function sampleWrapped(image: RGBAImage, u: number, v: number, out: Float32Array): void {
  const { width, height, data } = image;
  // Normalize into [0, size) first; negative remainders would otherwise
  // produce index -1 just left of a tile seam.
  let fx = (((u % width) + width) % width) - 0.5;
  let fy = (((v % height) + height) % height) - 0.5;
  if (fx < 0) fx += width;
  if (fy < 0) fy += height;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const xa = x0 % width;
  const ya = y0 % height;
  const xb = (x0 + 1) % width;
  const yb = (y0 + 1) % height;
  const a = (ya * width + xa) * 4;
  const b = (ya * width + xb) * 4;
  const c = (yb * width + xa) * 4;
  const d = (yb * width + xb) * 4;
  for (let k = 0; k < 3; k++) {
    const top = data[a + k] + (data[b + k] - data[a + k]) * tx;
    const bottom = data[c + k] + (data[d + k] - data[c + k]) * tx;
    out[k] = top + (bottom - top) * ty;
  }
}
