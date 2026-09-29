import type { RemovalLayer } from '../types/Editor.types';
import { createCanvas, get2d } from '../utils/canvas';
import { canvasToBlob } from '../utils/image';
import { createId } from '../utils/id';
import { boxBlur, type RGBAImage } from '../utils/pixels';
import { maskBounds } from './inpaint';

/**
 * AI fill client. Sends a crop around the painted area (not the whole
 * photo) to the proxy, then blends the generated result back in only where
 * the user painted, as an undoable patch layer.
 */

export type AiSize = '1024x1024' | '1536x1024' | '1024x1536';

export interface AiCrop {
  x: number;
  y: number;
  width: number;
  height: number;
  size: AiSize;
  outWidth: number;
  outHeight: number;
}

/** Context around the painted area, as a fraction of its size on each side. */
const CONTEXT_FRACTION = 0.6;
/** The model needs enough surroundings to match lighting and scale. */
const MIN_CROP = 400;
const EDGE_FEATHER = 4;
const REQUEST_TIMEOUT_MS = 130_000;
const ACCESS_CODE_KEY = 'vep.aiAccessCode';

export const AI_ENDPOINT: string = import.meta.env.VITE_AI_ENDPOINT || './api/ai-edit';

export class AiFillError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

/** Picks the model output size closest to an aspect ratio. */
export function chooseSize(aspect: number): AiSize {
  if (aspect > 1.25) return '1536x1024';
  if (aspect < 0.8) return '1024x1536';
  return '1024x1024';
}

/**
 * The region to send: the painted area plus context, with the exact aspect
 * ratio of a supported output size, kept inside the photo.
 */
export function aiCropBox(bounds: { x0: number; y0: number; x1: number; y1: number }, imageWidth: number, imageHeight: number): AiCrop {
  const bw = bounds.x1 - bounds.x0;
  const bh = bounds.y1 - bounds.y0;
  let width = Math.max(MIN_CROP, bw * (1 + 2 * CONTEXT_FRACTION));
  let height = Math.max(MIN_CROP, bh * (1 + 2 * CONTEXT_FRACTION));
  const size = chooseSize(width / height);
  const [outWidth, outHeight] = size.split('x').map(Number);
  const target = outWidth / outHeight;
  // Grow the short side to the target aspect, then fit inside the photo.
  if (width / height < target) width = height * target;
  else height = width / target;
  const scale = Math.min(1, imageWidth / width, imageHeight / height);
  width = Math.round(width * scale);
  height = Math.round(height * scale);
  const cx = (bounds.x0 + bounds.x1) / 2;
  const cy = (bounds.y0 + bounds.y1) / 2;
  const x = Math.round(Math.min(Math.max(0, cx - width / 2), imageWidth - width));
  const y = Math.round(Math.min(Math.max(0, cy - height / 2), imageHeight - height));
  return { x, y, width, height, size, outWidth, outHeight };
}

/** Soft alpha (0..1) for blending the result: the painted area, grown and feathered. */
export function blendAlpha(mask: Uint8Array, width: number, height: number, crop: Pick<AiCrop, 'x' | 'y' | 'width' | 'height'>): Float32Array {
  const alpha = new Float32Array(crop.width * crop.height);
  for (let y = 0; y < crop.height; y++) {
    for (let x = 0; x < crop.width; x++) {
      const sx = x + crop.x;
      const sy = y + crop.y;
      if (sx < width && sy < height) alpha[y * crop.width + x] = mask[sy * width + sx];
    }
  }
  boxBlur(alpha, crop.width, crop.height, EDGE_FEATHER / 2);
  for (let i = 0; i < alpha.length; i++) alpha[i] = alpha[i] > 0.01 ? 1 : 0;
  boxBlur(alpha, crop.width, crop.height, EDGE_FEATHER / 2);
  boxBlur(alpha, crop.width, crop.height, EDGE_FEATHER / 2);
  return alpha;
}

export function readAccessCode(): string {
  try {
    return localStorage.getItem(ACCESS_CODE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function writeAccessCode(code: string): void {
  try {
    localStorage.setItem(ACCESS_CODE_KEY, code);
  } catch (error) {
    console.error('Could not save the access code:', error);
  }
}

function toCanvas(image: RGBAImage): HTMLCanvasElement {
  const canvas = createCanvas(image.width, image.height);
  get2d(canvas).putImageData(new ImageData(image.data as Uint8ClampedArray<ArrayBuffer>, image.width, image.height), 0, 0);
  return canvas;
}

/** Builds the upload: the crop scaled to the model size, and a mask whose transparent pixels mark the edit area. */
async function buildInputs(source: RGBAImage, mask: Uint8Array, crop: AiCrop) {
  const full = toCanvas(source);
  const image = createCanvas(crop.outWidth, crop.outHeight);
  const ictx = get2d(image);
  ictx.imageSmoothingQuality = 'high';
  ictx.drawImage(full, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.outWidth, crop.outHeight);

  const maskCrop = createCanvas(crop.width, crop.height);
  const mctx = get2d(maskCrop);
  const maskData = mctx.createImageData(crop.width, crop.height);
  for (let y = 0; y < crop.height; y++) {
    for (let x = 0; x < crop.width; x++) {
      const painted = mask[(y + crop.y) * source.width + x + crop.x];
      const o = (y * crop.width + x) * 4;
      maskData.data[o] = maskData.data[o + 1] = maskData.data[o + 2] = 0;
      maskData.data[o + 3] = painted ? 0 : 255;
    }
  }
  mctx.putImageData(maskData, 0, 0);
  const maskOut = createCanvas(crop.outWidth, crop.outHeight);
  get2d(maskOut).drawImage(maskCrop, 0, 0, crop.outWidth, crop.outHeight);
  return { image: await canvasToBlob(image, 'image/png'), mask: await canvasToBlob(maskOut, 'image/png') };
}

async function decodeBase64Png(b64: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = `data:image/png;base64,${b64}`;
  await img.decode();
  return img;
}

/**
 * Generates a design for the painted area and returns it as a patch layer.
 * @param source - Photo with existing patches applied (what the model sees).
 * @param mask - 1 where the user painted.
 */
export async function generateAiFill(source: RGBAImage, mask: Uint8Array, prompt: string, signal?: AbortSignal): Promise<RemovalLayer> {
  const bounds = maskBounds(mask, source.width, source.height);
  if (!bounds) throw new AiFillError('Paint over the area you want to redesign first.');
  const crop = aiCropBox(bounds, source.width, source.height);
  const inputs = await buildInputs(source, mask, crop);

  const body = new FormData();
  body.set('image', inputs.image, 'image.png');
  body.set('mask', inputs.mask, 'mask.png');
  body.set('prompt', prompt);
  body.set('size', crop.size);

  let response: Response;
  try {
    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    response = await fetch(AI_ENDPOINT, {
      method: 'POST',
      body,
      headers: { 'x-access-code': readAccessCode() },
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new AiFillError('Could not reach the AI service. Check your internet connection.');
  }
  const result = (await response.json().catch(() => null)) as { image?: string; error?: string; code?: string } | null;
  if (response.status === 404) throw new AiFillError('AI fill is not deployed with this app yet (see README).', 'not_configured');
  if (!response.ok || !result?.image) {
    throw new AiFillError(result?.error ?? `AI fill failed (HTTP ${response.status}).`, result?.code);
  }

  // Scale the result back to the crop and keep it only where the user painted.
  const generated = await decodeBase64Png(result.image);
  const patch = createCanvas(crop.width, crop.height);
  const pctx = get2d(patch);
  pctx.imageSmoothingQuality = 'high';
  pctx.drawImage(generated, 0, 0, crop.width, crop.height);
  const pixels = pctx.getImageData(0, 0, crop.width, crop.height);
  const alpha = blendAlpha(mask, source.width, source.height, crop);
  for (let i = 0; i < alpha.length; i++) pixels.data[i * 4 + 3] = Math.round(alpha[i] * 255);
  pctx.putImageData(pixels, 0, 0);

  return {
    id: createId(),
    kind: 'removal',
    source: 'ai',
    prompt,
    name: `AI: ${prompt.length > 32 ? `${prompt.slice(0, 30)}…` : prompt}`,
    visible: true,
    opacity: 1,
    x: crop.x,
    y: crop.y,
    width: crop.width,
    height: crop.height,
    patch: patch.toDataURL('image/png'),
  };
}
