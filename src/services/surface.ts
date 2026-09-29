import type { Point } from '../types/Editor.types';
import { FOCAL_LENGTH_FACTOR } from '../constants';
import { polygonBounds, type Rect } from '../utils/geometry';
import { boxBlur, createRGBAImage, sampleWrapped, type RGBAImage } from '../utils/pixels';

/**
 * Surface rendering: fills a polygon with a tiling material, projected onto a
 * ground plane so pavers, lawn and mulch shrink toward the horizon the way
 * they do in the photo.
 *
 * Ground-plane model: for a level camera with the horizon at image row h, a
 * pixel (x, y) below the horizon sees the ground point
 *   X = (x - cx) * H / (y - h),   Z = f * H / (y - h)
 * where f is the focal length in pixels and H the camera height. H is chosen
 * so that one texture tile spans `tileSize` pixels horizontally at the
 * nearest (lowest) edge of the area.
 */

export interface SurfaceParams {
  imageWidth: number;
  imageHeight: number;
  points: readonly Point[];
  horizonY: number;
  tileSize: number;
  textureAngle: number;
  perspective: boolean;
  /** 0..1 */
  shading: number;
  brightness: number;
  feather: number;
}

export interface TextureMapping {
  perspective: boolean;
  centerX: number;
  horizonY: number;
  /** Distance in rows from the horizon to the reference (nearest) row. */
  refDepth: number;
  focal: number;
  tileSize: number;
  cos: number;
  sin: number;
}

/** Keeps the mapping away from the singularity at the horizon. */
const MIN_HORIZON_GAP = 2;

export function createTextureMapping(params: SurfaceParams, bounds: Rect): TextureMapping {
  const refDepth = bounds.y + bounds.height - params.horizonY;
  return {
    perspective: params.perspective && refDepth > MIN_HORIZON_GAP,
    centerX: params.imageWidth / 2,
    horizonY: params.horizonY,
    refDepth,
    focal: FOCAL_LENGTH_FACTOR * Math.max(params.imageWidth, params.imageHeight),
    tileSize: Math.max(1, params.tileSize),
    cos: Math.cos(params.textureAngle),
    sin: Math.sin(params.textureAngle),
  };
}

/**
 * Maps an image pixel to texture space, in tiles.
 * Returns false for pixels at or above the horizon (no ground there).
 * `out` receives [u, v, footprint] where footprint is tiles per image pixel,
 * used to pick a mip level.
 */
export function mapToTexture(x: number, y: number, m: TextureMapping, out: Float64Array): boolean {
  let gx: number;
  let gz: number;
  let footprint: number;
  if (m.perspective) {
    const depth = y - m.horizonY;
    if (depth < MIN_HORIZON_GAP) return false;
    const k = m.refDepth / (m.tileSize * depth);
    gx = (x - m.centerX) * k;
    gz = m.focal * k;
    footprint = Math.max(k, (m.focal * k) / depth);
  } else {
    gx = x / m.tileSize;
    gz = y / m.tileSize;
    footprint = 1 / m.tileSize;
  }
  out[0] = gx * m.cos - gz * m.sin;
  out[1] = gx * m.sin + gz * m.cos;
  out[2] = footprint;
  return true;
}

/** Integer pixel bounds of the area, grown by the feather and clipped to the image. */
export function surfaceBounds(params: SurfaceParams): Rect {
  const b = polygonBounds(params.points);
  const pad = Math.ceil(params.feather) + 1;
  const x0 = Math.max(0, Math.floor(b.x) - pad);
  const y0 = Math.max(0, Math.floor(b.y) - pad);
  const x1 = Math.min(params.imageWidth, Math.ceil(b.x + b.width) + pad);
  const y1 = Math.min(params.imageHeight, Math.ceil(b.y + b.height) + pad);
  return { x: x0, y: y0, width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0) };
}

const SUBSAMPLES = 4;

/**
 * Scanline polygon coverage (even-odd) with vertical supersampling and
 * fractional horizontal edges. Returns coverage 0..1 per pixel of `bounds`.
 */
export function rasterizePolygon(points: readonly Point[], bounds: Rect): Float32Array {
  const { width, height } = bounds;
  const coverage = new Float32Array(width * height);
  if (points.length < 3 || width === 0 || height === 0) return coverage;
  const xs: number[] = [];
  const weight = 1 / SUBSAMPLES;
  for (let row = 0; row < height; row++) {
    for (let s = 0; s < SUBSAMPLES; s++) {
      const y = bounds.y + row + (s + 0.5) / SUBSAMPLES;
      xs.length = 0;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const a = points[i];
        const b = points[j];
        if (a.y > y !== b.y > y) {
          xs.push(a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y) - bounds.x);
        }
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        addSpan(coverage, row * width, width, xs[k], xs[k + 1], weight);
      }
    }
  }
  return coverage;
}

function addSpan(cov: Float32Array, rowStart: number, width: number, start: number, end: number, weight: number) {
  const left = Math.max(0, start);
  const right = Math.min(width, end);
  if (right <= left) return;
  const first = Math.floor(left);
  const last = Math.min(width - 1, Math.floor(right));
  if (first === last) {
    cov[rowStart + first] += (right - left) * weight;
    return;
  }
  cov[rowStart + first] += (first + 1 - left) * weight;
  for (let x = first + 1; x < last; x++) cov[rowStart + x] += weight;
  if (last < width) cov[rowStart + last] += (right - last) * weight;
}

/** Chooses the mip level whose texel size best matches the pixel footprint. */
function mipLevel(footprintTexels: number, levels: number): number {
  if (footprintTexels <= 1) return 0;
  return Math.min(levels - 1, Math.round(Math.log2(footprintTexels)));
}

/**
 * Renders a surface into an RGBA image covering `bounds`.
 * @param mips - Texture mip chain; level 0 is one full tile.
 * @param photoLuma - Photo luminance for `bounds` (row-major), or null to skip shading.
 */
export function renderSurface(
  params: SurfaceParams,
  bounds: Rect,
  mips: readonly RGBAImage[],
  photoLuma: Float32Array | null,
): RGBAImage {
  const { width, height } = bounds;
  const out = createRGBAImage(width, height);
  if (width === 0 || height === 0) return out;

  const mask = rasterizePolygon(params.points, bounds);
  if (params.feather >= 1) {
    // Two box passes approximate a gaussian falloff.
    const r = Math.max(1, params.feather / 2);
    boxBlur(mask, width, height, r);
    boxBlur(mask, width, height, r);
  }

  const shadeMap = photoLuma && params.shading > 0 ? buildShadeMap(photoLuma, mask, width, height) : null;
  const mapping = createTextureMapping(params, bounds);
  const texSize = mips[0].width;
  const uvf = new Float64Array(3);
  const rgb = new Float32Array(3);

  for (let row = 0; row < height; row++) {
    const y = bounds.y + row + 0.5;
    for (let col = 0; col < width; col++) {
      const i = row * width + col;
      const alpha = mask[i];
      if (alpha <= 0.002) continue;
      if (!mapToTexture(bounds.x + col + 0.5, y, mapping, uvf)) continue;
      const level = mipLevel(uvf[2] * texSize, mips.length);
      const tex = mips[level];
      sampleWrapped(tex, uvf[0] * tex.width, uvf[1] * tex.height, rgb);
      let factor = params.brightness;
      if (shadeMap) factor *= 1 + (shadeMap[i] - 1) * params.shading;
      const o = i * 4;
      out.data[o] = rgb[0] * factor;
      out.data[o + 1] = rgb[1] * factor;
      out.data[o + 2] = rgb[2] * factor;
      out.data[o + 3] = Math.min(1, alpha) * 255;
    }
  }
  return out;
}

/**
 * Low-frequency lighting of the photo relative to its average inside the
 * area. Multiplying the new material by this keeps cast shadows (from the
 * house, trees...) that fall across the surface.
 */
export function buildShadeMap(luma: Float32Array, mask: Float32Array, width: number, height: number): Float32Array {
  const shadeMap = Float32Array.from(luma);
  boxBlur(shadeMap, width, height, Math.max(2, Math.min(width, height) / 80));
  let sum = 0;
  let weight = 0;
  for (let i = 0; i < mask.length; i++) {
    sum += shadeMap[i] * mask[i];
    weight += mask[i];
  }
  const mean = weight > 0 ? sum / weight : 0.5;
  const inv = mean > 0.01 ? 1 / mean : 1;
  for (let i = 0; i < shadeMap.length; i++) {
    shadeMap[i] = Math.min(1.5, Math.max(0.3, shadeMap[i] * inv));
  }
  return shadeMap;
}
