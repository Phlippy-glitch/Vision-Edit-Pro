import type { AreaLayer, DesignDoc, Point, RemovalLayer, StampLayer } from '../types/Editor.types';
import { getAsset, materialTexture, renderAsset } from './art/catalog';
import { getMaterial } from './art/materials';
import { createCanvas, get2d } from '../utils/canvas';
import { renderSurface, surfaceBounds, type SurfaceParams } from './surface';
import { luminance, type RGBAImage } from '../utils/pixels';

interface AreaCacheEntry {
  key: string;
  canvas: HTMLCanvasElement;
  x: number;
  y: number;
  scale: number;
}

export interface DrawOptions {
  /** false renders only the original photo (the "before" view). */
  showLayers?: boolean;
  /** Layers being actively edited render at reduced resolution for speed. */
  draftIds?: ReadonlySet<string>;
  /** Layers to skip (e.g. while previewing an edit). */
  hiddenIds?: ReadonlySet<string>;
}

const DRAFT_SCALE = 0.5;
const MAX_BRIGHTNESS_VARIANTS = 40;

/**
 * Draws a design over its photo. All coordinates are image pixels; callers
 * set the context transform to map them to their target (screen or export).
 */
export class SceneRenderer {
  readonly width: number;
  readonly height: number;
  private readonly photo: HTMLCanvasElement;
  /** Luminance of the photo with removals applied, keyed by scale + removal signature. */
  private photoLuma = new Map<string, Float32Array>();
  private areaCache = new Map<string, AreaCacheEntry>();
  private brightnessCache = new Map<string, HTMLCanvasElement>();
  private alphaCache = new WeakMap<HTMLCanvasElement, Uint8ClampedArray>();
  private removalImages = new Map<string, { src: string; image: HTMLImageElement; ready: boolean }>();

  constructor(
    photo: HTMLCanvasElement,
    private readonly onAsyncReady: () => void,
  ) {
    this.photo = photo;
    this.width = photo.width;
    this.height = photo.height;
  }

  get photoCanvas(): HTMLCanvasElement {
    return this.photo;
  }

  drawScene(ctx: CanvasRenderingContext2D, doc: DesignDoc, options: DrawOptions = {}): void {
    ctx.drawImage(this.photo, 0, 0);
    if (options.showLayers === false) return;
    const removals = doc.layers.filter((l): l is RemovalLayer => l.kind === 'removal' && l.visible);
    for (const layer of doc.layers) {
      if (!layer.visible || options.hiddenIds?.has(layer.id)) continue;
      ctx.save();
      ctx.globalAlpha = layer.opacity;
      if (layer.kind === 'removal') this.drawRemoval(ctx, layer);
      else if (layer.kind === 'area') this.drawArea(ctx, layer, doc.horizonY, removals, options.draftIds?.has(layer.id) ?? false);
      else this.drawStamp(ctx, layer);
      ctx.restore();
    }
  }

  /** Full-resolution render of the design (or the original photo). */
  composite(doc: DesignDoc, showLayers = true, maxDimension = Infinity): HTMLCanvasElement {
    const scale = Math.min(1, maxDimension / Math.max(this.width, this.height));
    const canvas = createCanvas(this.width * scale, this.height * scale);
    const ctx = get2d(canvas);
    ctx.scale(scale, scale);
    this.drawScene(ctx, doc, { showLayers });
    return canvas;
  }

  /** The photo with existing removals applied: the source for a new removal. */
  removalSource(doc: DesignDoc): RGBAImage {
    const canvas = createCanvas(this.width, this.height);
    const ctx = get2d(canvas);
    ctx.drawImage(this.photo, 0, 0);
    for (const layer of doc.layers) {
      if (layer.kind === 'removal' && layer.visible) this.drawRemoval(ctx, layer);
    }
    return ctx.getImageData(0, 0, this.width, this.height);
  }

  /** Whether all removal patches have decoded (needed before exporting). */
  async whenReady(doc: DesignDoc): Promise<void> {
    const pending = doc.layers
      .filter((l): l is RemovalLayer => l.kind === 'removal')
      .map((l) => this.removalImage(l))
      .filter((entry) => !entry.ready)
      .map((entry) => entry.image.decode().catch(() => undefined));
    await Promise.all(pending);
  }

  stampSize(layer: StampLayer): { width: number; height: number } {
    const asset = getAsset(layer.assetId);
    return { width: layer.height * (asset?.aspect ?? 1), height: layer.height };
  }

  /** Converts an image point into the stamp's unrotated local frame (anchor at 0,0). */
  toStampLocal(layer: StampLayer, p: Point): Point {
    const dx = p.x - layer.x;
    const dy = p.y - layer.y;
    const cos = Math.cos(-layer.rotation);
    const sin = Math.sin(-layer.rotation);
    const x = dx * cos - dy * sin;
    return { x: layer.flipX ? -x : x, y: dx * sin + dy * cos };
  }

  /** Hit test against the stamp's opaque pixels, with `slop` image-pixel tolerance. */
  hitTestStamp(layer: StampLayer, p: Point, slop: number): boolean {
    const asset = getAsset(layer.assetId);
    if (!asset) return false;
    const { width, height } = this.stampSize(layer);
    const local = this.toStampLocal(layer, p);
    if (local.x < -width / 2 - slop || local.x > width / 2 + slop || local.y < -height - slop || local.y > slop) {
      return false;
    }
    const art = renderAsset(asset, layer.seed, layer.color);
    const alpha = this.alphaFor(art);
    const step = Math.max(1, slop / 2);
    for (let oy = -slop; oy <= slop; oy += step) {
      for (let ox = -slop; ox <= slop; ox += step) {
        const ix = Math.floor(((local.x + ox + width / 2) / width) * art.width);
        const iy = Math.floor(((local.y + oy + height) / height) * art.height);
        if (ix < 0 || iy < 0 || ix >= art.width || iy >= art.height) continue;
        if (alpha[(iy * art.width + ix) * 4 + 3] > 24) return true;
      }
    }
    return false;
  }

  /** Drops cached renders for layers that no longer exist. */
  prune(doc: DesignDoc): void {
    const ids = new Set(doc.layers.map((l) => l.id));
    for (const id of this.areaCache.keys()) if (!ids.has(id)) this.areaCache.delete(id);
    for (const id of this.removalImages.keys()) if (!ids.has(id)) this.removalImages.delete(id);
  }

  private alphaFor(canvas: HTMLCanvasElement): Uint8ClampedArray {
    let alpha = this.alphaCache.get(canvas);
    if (!alpha) {
      alpha = get2d(canvas).getImageData(0, 0, canvas.width, canvas.height).data;
      this.alphaCache.set(canvas, alpha);
    }
    return alpha;
  }

  private removalImage(layer: RemovalLayer) {
    let entry = this.removalImages.get(layer.id);
    if (!entry || entry.src !== layer.patch) {
      const image = new Image();
      const created = { src: layer.patch, image, ready: false };
      image.onload = () => {
        created.ready = true;
        this.onAsyncReady();
      };
      image.src = layer.patch;
      entry = created;
      this.removalImages.set(layer.id, entry);
    }
    return entry;
  }

  private drawRemoval(ctx: CanvasRenderingContext2D, layer: RemovalLayer) {
    const entry = this.removalImage(layer);
    if (entry.ready) ctx.drawImage(entry.image, layer.x, layer.y, layer.width, layer.height);
  }

  private drawArea(
    ctx: CanvasRenderingContext2D,
    layer: AreaLayer,
    horizonY: number,
    removals: readonly RemovalLayer[],
    draft: boolean,
  ) {
    if (layer.points.length < 3) return;
    const scale = draft ? DRAFT_SCALE : 1;
    const removalSignature = layer.shading > 0 ? this.removalSignature(removals) : '';
    const key = JSON.stringify([
      layer.materialId,
      layer.points,
      layer.tileSize,
      layer.textureAngle,
      layer.perspective,
      layer.shading,
      layer.brightness,
      layer.feather,
      layer.perspective ? horizonY : 0,
      removalSignature,
    ]);
    let entry = this.areaCache.get(layer.id);
    // A full-resolution render also satisfies a draft request.
    if (!entry || entry.key !== key || entry.scale < scale) {
      const rendered = this.renderArea(layer, horizonY, scale, key, removals, removalSignature);
      if (!rendered) return;
      entry = rendered;
      this.areaCache.set(layer.id, entry);
    }
    ctx.drawImage(
      entry.canvas,
      entry.x / entry.scale,
      entry.y / entry.scale,
      entry.canvas.width / entry.scale,
      entry.canvas.height / entry.scale,
    );
  }

  private renderArea(
    layer: AreaLayer,
    horizonY: number,
    scale: number,
    key: string,
    removals: readonly RemovalLayer[],
    removalSignature: string,
  ): AreaCacheEntry | null {
    const material = getMaterial(layer.materialId);
    if (!material) return null;
    const params: SurfaceParams = {
      imageWidth: Math.round(this.width * scale),
      imageHeight: Math.round(this.height * scale),
      points: layer.points.map((p) => ({ x: p.x * scale, y: p.y * scale })),
      horizonY: horizonY * scale,
      tileSize: layer.tileSize * scale,
      textureAngle: layer.textureAngle,
      perspective: layer.perspective,
      shading: layer.shading,
      brightness: layer.brightness,
      feather: layer.feather * scale,
    };
    const bounds = surfaceBounds(params);
    if (bounds.width === 0 || bounds.height === 0) return null;
    const luma =
      layer.shading > 0
        ? this.cropLuma(scale, bounds, params.imageWidth, params.imageHeight, removals, removalSignature)
        : null;
    const rgba = renderSurface(params, bounds, materialTexture(material).mips, luma);
    const canvas = createCanvas(bounds.width, bounds.height);
    get2d(canvas).putImageData(new ImageData(rgba.data as Uint8ClampedArray<ArrayBuffer>, rgba.width, rgba.height), 0, 0);
    return { key, canvas, x: bounds.x, y: bounds.y, scale };
  }

  /**
   * Identifies which removal patches are applied, so surfaces re-shade when
   * one changes. Otherwise a removed shrub would linger as a "shadow".
   */
  private removalSignature(removals: readonly RemovalLayer[]): string {
    return removals.map((l) => `${l.id}:${l.patch.length}:${this.removalImage(l).ready ? 1 : 0}`).join('|');
  }

  private cropLuma(
    scale: number,
    bounds: { x: number; y: number; width: number; height: number },
    w: number,
    h: number,
    removals: readonly RemovalLayer[],
    removalSignature: string,
  ) {
    const cacheKey = `${scale}|${removalSignature}`;
    let full = this.photoLuma.get(cacheKey);
    if (!full) {
      const canvas = createCanvas(w, h);
      const ctx = get2d(canvas);
      ctx.drawImage(this.photo, 0, 0, w, h);
      ctx.scale(w / this.width, h / this.height);
      for (const layer of removals) this.drawRemoval(ctx, layer);
      full = luminance(ctx.getImageData(0, 0, w, h));
      // Keep only the current removal state for each scale.
      for (const k of this.photoLuma.keys()) if (k.startsWith(`${scale}|`)) this.photoLuma.delete(k);
      this.photoLuma.set(cacheKey, full);
    }
    const out = new Float32Array(bounds.width * bounds.height);
    for (let row = 0; row < bounds.height; row++) {
      const start = (bounds.y + row) * w + bounds.x;
      out.set(full.subarray(start, start + bounds.width), row * bounds.width);
    }
    return out;
  }

  private stampArt(layer: StampLayer): HTMLCanvasElement | null {
    const asset = getAsset(layer.assetId);
    if (!asset) return null;
    const art = renderAsset(asset, layer.seed, layer.color);
    const brightness = Math.round(layer.brightness * 20) / 20;
    if (brightness === 1) return art;
    const key = `${layer.assetId}|${layer.seed}|${layer.color}|${brightness}`;
    let adjusted = this.brightnessCache.get(key);
    if (!adjusted) {
      adjusted = createCanvas(art.width, art.height);
      const ctx = get2d(adjusted);
      const data = get2d(art).getImageData(0, 0, art.width, art.height);
      for (let i = 0; i < data.data.length; i += 4) {
        data.data[i] *= brightness;
        data.data[i + 1] *= brightness;
        data.data[i + 2] *= brightness;
      }
      ctx.putImageData(data, 0, 0);
      if (this.brightnessCache.size >= MAX_BRIGHTNESS_VARIANTS) {
        this.brightnessCache.delete(this.brightnessCache.keys().next().value!);
      }
      this.brightnessCache.set(key, adjusted);
    }
    return adjusted;
  }

  private drawStamp(ctx: CanvasRenderingContext2D, layer: StampLayer) {
    const asset = getAsset(layer.assetId);
    const art = this.stampArt(layer);
    if (!asset || !art) return;
    const { width, height } = this.stampSize(layer);
    if (layer.shadow && asset.groundShadow) {
      // Soft contact shadow, nudged away from the upper-left light.
      const rx = width * 0.5;
      const ry = Math.max(2, width * 0.1);
      ctx.save();
      ctx.translate(layer.x + width * 0.06, layer.y - ry * 0.2);
      ctx.scale(1, ry / rx);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
      g.addColorStop(0, 'rgba(0,0,0,0.42)');
      g.addColorStop(0.6, 'rgba(0,0,0,0.18)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, rx, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.save();
    ctx.translate(layer.x, layer.y);
    ctx.rotate(layer.rotation);
    ctx.scale(layer.flipX ? -1 : 1, 1);
    ctx.drawImage(art, -width / 2, -height, width, height);
    ctx.restore();
  }
}
