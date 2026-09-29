import type { CustomAssetRecord } from '../types/Editor.types';
import { createCanvas, get2d } from '../utils/canvas';
import { blobToCanvas, canvasToBlob } from '../utils/image';
import type { RGBAImage } from '../utils/pixels';
import { createId } from '../utils/id';
import type { AssetDef } from './art/assets.types';
import { registerCustomAsset, unregisterCustomAsset } from './art/catalog';
import { deleteCustomAsset, listCustomAssets, saveCustomAsset } from './projectStore';

/** Cutouts are stored no larger than this on the long edge. */
const MAX_CUTOUT_DIMENSION = 800;

let loaded: Promise<void> | null = null;

/** Registers every saved custom plant once per app session. */
export function loadCustomAssets(): Promise<void> {
  if (!loaded) {
    loaded = (async () => {
      const records = await listCustomAssets();
      for (const record of records) {
        try {
          registerCustomAsset(record.id, record.name, await blobToCanvas(record.image), record.defaultHeight);
        } catch (error) {
          // One unreadable image shouldn't hide the rest of the catalog.
          console.error(`Could not load custom plant "${record.name}":`, error);
        }
      }
    })().catch((error) => {
      loaded = null;
      throw error;
    });
  }
  return loaded;
}

export async function createCustomAsset(cutout: RGBAImage, name: string, defaultHeight: number): Promise<AssetDef> {
  const scale = Math.min(1, MAX_CUTOUT_DIMENSION / Math.max(cutout.width, cutout.height));
  const full = createCanvas(cutout.width, cutout.height);
  get2d(full).putImageData(new ImageData(cutout.data as Uint8ClampedArray<ArrayBuffer>, cutout.width, cutout.height), 0, 0);
  const art = createCanvas(cutout.width * scale, cutout.height * scale);
  const ctx = get2d(art);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(full, 0, 0, art.width, art.height);
  const record: CustomAssetRecord = {
    id: createId(),
    name,
    image: await canvasToBlob(art, 'image/png'),
    width: art.width,
    height: art.height,
    defaultHeight,
    createdAt: Date.now(),
  };
  await saveCustomAsset(record);
  return registerCustomAsset(record.id, record.name, art, defaultHeight);
}

export async function removeCustomAsset(assetId: string, recordId: string): Promise<void> {
  await deleteCustomAsset(recordId);
  unregisterCustomAsset(assetId);
}
