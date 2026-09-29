import type { Point, RemovalLayer } from '../types/Editor.types';
import type { RGBAImage } from '../utils/pixels';
import { createId } from '../utils/id';
import { createCanvas, get2d } from '../utils/canvas';
import type { InpaintResult } from './inpaint';
import type { InpaintRequest } from './inpaint.worker';

export interface BrushStroke {
  points: Point[];
  /** Brush radius in image pixels. */
  radius: number;
}

type Pending = { resolve: (r: InpaintResult | null) => void; reject: (e: Error) => void };

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./inpaint.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<{ id: number; result?: InpaintResult | null; error?: string }>) => {
      const job = pending.get(event.data.id);
      if (!job) return;
      pending.delete(event.data.id);
      if (event.data.error) job.reject(new Error(event.data.error));
      else job.resolve(event.data.result ?? null);
    };
    worker.onerror = (event) => {
      for (const job of pending.values()) job.reject(new Error(event.message || 'Removal worker crashed.'));
      pending.clear();
      worker = null;
    };
  }
  return worker;
}

/** Rasterizes brush strokes into a 0/1 mask the size of the photo. */
export function strokesToMask(strokes: readonly BrushStroke[], width: number, height: number): Uint8Array {
  const canvas = createCanvas(width, height);
  const ctx = get2d(canvas);
  ctx.strokeStyle = '#fff';
  ctx.fillStyle = '#fff';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const stroke of strokes) {
    if (stroke.points.length === 1) {
      const p = stroke.points[0];
      ctx.beginPath();
      ctx.arc(p.x, p.y, stroke.radius, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    ctx.lineWidth = stroke.radius * 2;
    ctx.beginPath();
    stroke.points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
  }
  const data = ctx.getImageData(0, 0, width, height).data;
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < mask.length; i++) mask[i] = data[i * 4 + 3] > 64 ? 1 : 0;
  return mask;
}

export function runInpaint(image: RGBAImage, mask: Uint8Array, candidateIndex: number): Promise<InpaintResult | null> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    const request: InpaintRequest = { id, image, mask, candidateIndex };
    getWorker().postMessage(request);
  });
}

export function resultToLayer(result: InpaintResult, name: string): RemovalLayer {
  const { image } = result;
  const canvas = createCanvas(image.width, image.height);
  get2d(canvas).putImageData(new ImageData(image.data as Uint8ClampedArray<ArrayBuffer>, image.width, image.height), 0, 0);
  return {
    id: createId(),
    kind: 'removal',
    name,
    visible: true,
    opacity: 1,
    x: result.x,
    y: result.y,
    width: image.width,
    height: image.height,
    patch: canvas.toDataURL('image/png'),
  };
}
