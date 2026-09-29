import { EXPORT_JPEG_QUALITY } from '../constants';
import type { DesignDoc, ProjectMeta } from '../types/Editor.types';
import { canvasToBlob } from '../utils/image';
import { createCanvas, get2d } from '../utils/canvas';
import type { SceneRenderer } from './renderer';

export type ExportMode = 'after' | 'before-after';

export interface ExportBranding {
  companyName: string;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, unit: number) {
  ctx.font = `700 ${unit * 1.1}px system-ui, -apple-system, Segoe UI, sans-serif`;
  const w = ctx.measureText(text).width + unit * 1.6;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  roundRect(ctx, x, y, w, unit * 2, unit * 0.5);
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + unit * 0.8, y + unit);
}

/**
 * Renders the client-facing image: the proposed design alone, or a
 * before/after comparison with a caption footer.
 */
export async function renderExport(
  renderer: SceneRenderer,
  doc: DesignDoc,
  meta: Pick<ProjectMeta, 'name' | 'clientName'>,
  mode: ExportMode,
  branding: ExportBranding,
): Promise<Blob> {
  await renderer.whenReady(doc);
  const after = renderer.composite(doc, true);
  if (mode === 'after') return canvasToBlob(after, 'image/jpeg', EXPORT_JPEG_QUALITY);

  const before = renderer.composite(doc, false);
  const { width, height } = after;
  // Stack landscape photos vertically so the result stays phone-friendly.
  const stacked = width >= height;
  const gap = Math.round(Math.max(width, height) * 0.01);
  const unit = Math.round(Math.max(width, height) * 0.018);
  const footer = unit * 4;
  const canvas = createCanvas(
    stacked ? width : width * 2 + gap,
    (stacked ? height * 2 + gap : height) + footer,
  );
  const ctx = get2d(canvas);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(before, 0, 0);
  const ax = stacked ? 0 : width + gap;
  const ay = stacked ? height + gap : 0;
  ctx.drawImage(after, ax, ay);
  label(ctx, 'BEFORE', unit, unit, unit);
  label(ctx, 'AFTER', ax + unit, ay + unit, unit);

  const footerY = canvas.height - footer;
  ctx.fillStyle = '#1f3d2b';
  ctx.fillRect(0, footerY, canvas.width, footer);
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${unit * 1.2}px system-ui, -apple-system, Segoe UI, sans-serif`;
  const title = [meta.name, meta.clientName].filter(Boolean).join(' · ');
  ctx.fillText(title || 'Landscape proposal', unit, footerY + footer / 2);
  if (branding.companyName) {
    ctx.font = `500 ${unit * 1.05}px system-ui, -apple-system, Segoe UI, sans-serif`;
    ctx.textAlign = 'right';
    ctx.fillText(`Design concept by ${branding.companyName}`, canvas.width - unit, footerY + footer / 2);
  }
  return canvasToBlob(canvas, 'image/jpeg', EXPORT_JPEG_QUALITY);
}

export function exportFilename(name: string, mode: ExportMode): string {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'design';
  return `${slug}-${mode === 'after' ? 'proposal' : 'before-after'}.jpg`;
}

/** Opens the native share sheet when available (text, email, AirDrop); otherwise downloads. */
export async function shareOrDownload(blob: Blob, filename: string, title: string): Promise<'shared' | 'downloaded'> {
  const file = new File([blob], filename, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return 'shared';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'shared';
      // Share sheet failed (e.g. not allowed without a gesture); fall back to download.
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}
