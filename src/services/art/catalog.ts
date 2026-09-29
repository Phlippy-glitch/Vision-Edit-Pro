import { ASSET_RENDER_HEIGHT, TEXTURE_SIZE } from '../../constants';
import { buildMipChain, type RGBAImage } from '../../utils/pixels';
import { createRng } from '../../utils/random';
import type { AssetDef } from './assets.types';
import { MATERIALS, type MaterialDef } from './materials';
import { createCanvas, get2d } from '../../utils/canvas';
import { PLANT_ASSETS } from './plants';
import { STRUCTURE_ASSETS } from './structures';

export const ASSETS: readonly AssetDef[] = [...PLANT_ASSETS, ...STRUCTURE_ASSETS];

/** Plants the user added from their own photos, registered at startup. */
const customAssets = new Map<string, AssetDef>();
export const CUSTOM_ASSET_PREFIX = 'custom:';

export function getAsset(id: string): AssetDef | undefined {
  return ASSETS.find((a) => a.id === id) ?? customAssets.get(id);
}

export function listCustomAssetDefs(): AssetDef[] {
  return [...customAssets.values()];
}

export function registerCustomAsset(
  recordId: string,
  name: string,
  art: HTMLCanvasElement,
  defaultHeight: number,
): AssetDef {
  const def: AssetDef = {
    id: CUSTOM_ASSET_PREFIX + recordId,
    name,
    category: 'mine',
    aspect: art.width / art.height,
    defaultHeight,
    groundShadow: true,
    isPhoto: true,
    draw(ctx, w, h) {
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(art, 0, 0, w, h);
    },
  };
  forgetRenders(def.id);
  customAssets.set(def.id, def);
  return def;
}

export function unregisterCustomAsset(assetId: string): void {
  customAssets.delete(assetId);
  forgetRenders(assetId);
}

function forgetRenders(assetId: string) {
  for (const key of [...assetCache.keys()]) if (key.startsWith(`${assetId}|`)) assetCache.delete(key);
  for (const key of [...thumbnailCache.keys()]) if (key.startsWith(`${assetId}|`)) thumbnailCache.delete(key);
}

export function defaultAssetColor(asset: AssetDef): string {
  return asset.colors?.[0]?.value ?? '';
}

const MAX_CACHED_ASSETS = 60;
const assetCache = new Map<string, HTMLCanvasElement>();

/** Renders (or returns cached) artwork for an asset variation. */
export function renderAsset(asset: AssetDef, seed: number, color?: string): HTMLCanvasElement {
  const resolvedColor = color || defaultAssetColor(asset);
  const key = `${asset.id}|${seed}|${resolvedColor}`;
  const cached = assetCache.get(key);
  if (cached) return cached;
  const h = ASSET_RENDER_HEIGHT;
  const w = Math.round(h * asset.aspect);
  const canvas = createCanvas(w, h);
  asset.draw(get2d(canvas), w, h, createRng(seed), resolvedColor);
  if (assetCache.size >= MAX_CACHED_ASSETS) {
    assetCache.delete(assetCache.keys().next().value!);
  }
  assetCache.set(key, canvas);
  return canvas;
}

const thumbnailCache = new Map<string, string>();

function toThumbnail(source: HTMLCanvasElement, size: number): string {
  const scale = Math.min(size / source.width, size / source.height);
  const canvas = createCanvas(size, size);
  const ctx = get2d(canvas);
  const w = source.width * scale;
  const h = source.height * scale;
  ctx.drawImage(source, (size - w) / 2, (size - h) / 2, w, h);
  return canvas.toDataURL('image/png');
}

export function assetThumbnail(asset: AssetDef, size = 112): string {
  const key = `${asset.id}|${size}`;
  let url = thumbnailCache.get(key);
  if (!url) {
    url = toThumbnail(renderAsset(asset, 1), size);
    thumbnailCache.set(key, url);
  }
  return url;
}

const textureCache = new Map<string, { canvas: HTMLCanvasElement; mips: RGBAImage[] }>();

export function materialTexture(material: MaterialDef) {
  let entry = textureCache.get(material.id);
  if (!entry) {
    const canvas = createCanvas(TEXTURE_SIZE, TEXTURE_SIZE);
    const ctx = get2d(canvas);
    material.draw(ctx, TEXTURE_SIZE, createRng(hashString(material.id)));
    const data = ctx.getImageData(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
    entry = { canvas, mips: buildMipChain(data) };
    textureCache.set(material.id, entry);
  }
  return entry;
}

export function materialThumbnail(material: MaterialDef, size = 112): string {
  const key = `mat|${material.id}|${size}`;
  let url = thumbnailCache.get(key);
  if (!url) {
    const source = materialTexture(material).canvas;
    const canvas = createCanvas(size, size);
    // Show a half tile so the pattern reads at thumbnail size.
    get2d(canvas).drawImage(source, 0, 0, source.width / 2, source.height / 2, 0, 0, size, size);
    url = canvas.toDataURL('image/png');
    thumbnailCache.set(key, url);
  }
  return url;
}

export { MATERIALS };

function hashString(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
