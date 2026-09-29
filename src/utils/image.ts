import { MAX_PHOTO_DIMENSION, PHOTO_JPEG_QUALITY } from '../constants';
import { createCanvas, get2d } from './canvas';

const MAX_UPLOAD_BYTES = 40 * 1024 * 1024;

export function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/jpeg', quality = PHOTO_JPEG_QUALITY): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not encode image.'))), type, quality);
  });
}

async function decode(blob: Blob): Promise<CanvasImageSource & { width: number; height: number }> {
  if ('createImageBitmap' in window) {
    try {
      // Honors EXIF orientation so portrait phone photos stay upright.
      return await createImageBitmap(blob, { imageOrientation: 'from-image' });
    } catch {
      // Fall through to <img>, which some browsers decode more formats with.
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return Object.assign(img, { width: img.naturalWidth, height: img.naturalHeight });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function blobToCanvas(blob: Blob): Promise<HTMLCanvasElement> {
  const source = await decode(blob);
  const canvas = createCanvas(source.width, source.height);
  get2d(canvas).drawImage(source, 0, 0);
  return canvas;
}

/**
 * Validates and normalizes a photo from the camera or library: upright,
 * at most MAX_PHOTO_DIMENSION on the long edge, JPEG encoded.
 */
export async function importPhoto(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  if (!file.type.startsWith('image/') && file.type !== '') {
    throw new Error('That file is not an image. Please choose a JPG or PNG photo.');
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error('That photo is larger than 40MB. Please choose a smaller image.');
  }
  let source: CanvasImageSource & { width: number; height: number };
  try {
    source = await decode(file);
  } catch {
    throw new Error('This photo format is not supported by your browser. Try a JPG or PNG (set your camera to "Most Compatible").');
  }
  const scale = Math.min(1, MAX_PHOTO_DIMENSION / Math.max(source.width, source.height));
  const width = Math.round(source.width * scale);
  const height = Math.round(source.height * scale);
  const canvas = createCanvas(width, height);
  const ctx = get2d(canvas);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, width, height);
  return { blob: await canvasToBlob(canvas), width, height };
}
