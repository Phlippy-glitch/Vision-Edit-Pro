import { inpaint } from './inpaint';
import type { RGBAImage } from '../utils/pixels';

export interface InpaintRequest {
  id: number;
  image: RGBAImage;
  mask: Uint8Array;
  candidateIndex: number;
}

self.onmessage = (event: MessageEvent<InpaintRequest>) => {
  const { id, image, mask, candidateIndex } = event.data;
  try {
    const result = inpaint(image, mask, candidateIndex);
    const transfer = result ? [result.image.data.buffer as ArrayBuffer] : [];
    self.postMessage({ id, result }, { transfer });
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
