import { FOCAL_LENGTH_FACTOR } from '../constants';
import type { AreaLayer, DesignDoc, Point } from '../types/Editor.types';
import { getAsset } from './art/catalog';
import { getMaterial } from './art/materials';

/**
 * Plant list and cost estimate built from a design.
 *
 * Surface areas are measured with the same ground-plane model the renderer
 * uses. A pixel (x, y) below the horizon h lies on the ground at
 *   X = (x - cx) * Hc / (y - h),   Z = f * Hc / (y - h)
 * where Hc is the camera height. A projective map keeps straight edges
 * straight, so the shoelace formula on the mapped vertices gives the exact
 * ground area of the outline.
 */

export type PriceList = Record<string, number>;

export interface EstimateSettings {
  /** Percent, e.g. 7.5 */
  taxRate: number;
  /** Camera height above the ground when the photo was taken. */
  cameraHeightFt: number;
}

export interface EstimateLine {
  key: string;
  /** Key into the price list, so editing a line's price updates the list. */
  priceKey: string;
  label: string;
  detail?: string;
  quantity: number;
  unit: 'each' | 'sq ft';
  unitPrice: number;
  total: number;
  /** True when a quantity came from the photo measurement rather than typed in. */
  estimated: boolean;
}

export interface Estimate {
  lines: EstimateLine[];
  subtotal: number;
  tax: number;
  total: number;
}

export interface GroundArea {
  sqFt: number;
  /** Part of the outline was at or above the horizon and was not counted. */
  clipped: boolean;
}

/** Materials sold by volume; the estimate also shows cubic yards at this depth. */
const BULK_MATERIALS = new Set(['mulch-brown', 'mulch-black', 'mulch-red', 'river-rock', 'pea-gravel']);
const BULK_DEPTH_FT = 0.25;
const CU_FT_PER_CU_YD = 27;

/** Keeps the measurement away from the horizon, where distances explode. */
const HORIZON_MARGIN_FRACTION = 0.01;

/** Clips a polygon to the half-plane y >= minY (Sutherland–Hodgman). */
export function clipBelow(points: readonly Point[], minY: number): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const aIn = a.y >= minY;
    const bIn = b.y >= minY;
    if (aIn) out.push(a);
    if (aIn !== bIn) {
      const t = (minY - a.y) / (b.y - a.y);
      out.push({ x: a.x + (b.x - a.x) * t, y: minY });
    }
  }
  return out;
}

export function polygonArea(points: readonly Point[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

/** Estimated real-world area (sq ft) of a ground outline in the photo. */
export function groundArea(
  points: readonly Point[],
  horizonY: number,
  imageWidth: number,
  imageHeight: number,
  cameraHeightFt: number,
): GroundArea {
  const minY = horizonY + imageHeight * HORIZON_MARGIN_FRACTION;
  const clippedPoints = clipBelow(points, minY);
  const clipped = points.some((p) => p.y < minY);
  if (clippedPoints.length < 3) return { sqFt: 0, clipped };
  const focal = FOCAL_LENGTH_FACTOR * Math.max(imageWidth, imageHeight);
  const cx = imageWidth / 2;
  const ground = clippedPoints.map((p) => {
    const depth = p.y - horizonY;
    return { x: ((p.x - cx) * cameraHeightFt) / depth, y: (focal * cameraHeightFt) / depth };
  });
  return { sqFt: polygonArea(ground), clipped };
}

/** Area used for pricing: the typed override, else the photo measurement (ground only). */
export function areaQuantity(
  layer: AreaLayer,
  horizonY: number,
  imageWidth: number,
  imageHeight: number,
  settings: EstimateSettings,
): { sqFt: number; estimated: boolean } {
  if (layer.areaOverrideSqFt !== undefined) return { sqFt: layer.areaOverrideSqFt, estimated: false };
  if (!layer.perspective) return { sqFt: 0, estimated: true };
  const { sqFt } = groundArea(layer.points, horizonY, imageWidth, imageHeight, settings.cameraHeightFt);
  return { sqFt, estimated: true };
}

const roundMoney = (value: number) => Math.round(value * 100) / 100;

export function buildEstimate(
  doc: DesignDoc,
  prices: PriceList,
  settings: EstimateSettings,
  image: { width: number; height: number },
): Estimate {
  const lines = new Map<string, EstimateLine>();
  const add = (line: Omit<EstimateLine, 'total'>) => {
    const existing = lines.get(line.key);
    if (existing) {
      existing.quantity += line.quantity;
      existing.estimated ||= line.estimated;
    } else {
      lines.set(line.key, { ...line, total: 0 });
    }
  };

  for (const layer of doc.layers) {
    if (!layer.visible) continue;
    if (layer.kind === 'stamp') {
      const asset = getAsset(layer.assetId);
      const colorLabel = asset?.colors?.find((c) => c.value === (layer.color ?? asset.colors?.[0]?.value))?.label;
      const priceKey = `asset:${layer.assetId}`;
      add({
        key: `${priceKey}|${colorLabel ?? ''}`,
        priceKey,
        label: colorLabel ? `${asset?.name ?? layer.name} – ${colorLabel}` : (asset?.name ?? layer.name),
        quantity: 1,
        unit: 'each',
        unitPrice: prices[priceKey] ?? 0,
        estimated: false,
      });
    } else if (layer.kind === 'area') {
      const material = getMaterial(layer.materialId);
      const priceKey = `material:${layer.materialId}`;
      const { sqFt, estimated } = areaQuantity(layer, doc.horizonY, image.width, image.height, settings);
      add({
        key: priceKey,
        priceKey,
        label: material?.name ?? layer.name,
        quantity: sqFt,
        unit: 'sq ft',
        unitPrice: prices[priceKey] ?? 0,
        estimated,
      });
    } else {
      // AI redesign patches are a visual; what they show is priced separately.
      if (layer.source === 'ai') continue;
      add({
        key: 'removal',
        priceKey: 'removal',
        label: 'Remove existing feature',
        quantity: 1,
        unit: 'each',
        unitPrice: prices.removal ?? 0,
        estimated: false,
      });
    }
  }

  const result = [...lines.values()].map((line) => {
    const quantity = line.unit === 'sq ft' ? Math.round(line.quantity) : line.quantity;
    const materialId = line.priceKey.replace('material:', '');
    const detail = BULK_MATERIALS.has(materialId) && quantity > 0
      ? `≈ ${((quantity * BULK_DEPTH_FT) / CU_FT_PER_CU_YD).toFixed(1)} cu yd at 3" depth`
      : undefined;
    return { ...line, quantity, detail, total: roundMoney(quantity * line.unitPrice) };
  });
  const subtotal = roundMoney(result.reduce((sum, l) => sum + l.total, 0));
  const tax = roundMoney((subtotal * settings.taxRate) / 100);
  return { lines: result, subtotal, tax, total: roundMoney(subtotal + tax) };
}

/** Plain-text version for pasting into a text message or email. */
export function estimateToText(estimate: Estimate, title: string, taxRate: number): string {
  const rows = estimate.lines.map((l) => {
    const qty = l.unit === 'each' ? `${l.quantity} ×` : `${l.estimated ? '~' : ''}${l.quantity} sq ft ×`;
    return `• ${l.label}: ${qty} ${formatMoney(l.unitPrice)} = ${formatMoney(l.total)}${l.detail ? ` (${l.detail})` : ''}`;
  });
  const totals = [`Subtotal: ${formatMoney(estimate.subtotal)}`];
  if (taxRate > 0) totals.push(`Tax (${taxRate}%): ${formatMoney(estimate.tax)}`);
  totals.push(`Estimated total: ${formatMoney(estimate.total)}`);
  return [title, '', ...rows, '', ...totals].join('\n');
}

export function formatMoney(value: number): string {
  return value.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: value >= 1000 ? 0 : 2 });
}
