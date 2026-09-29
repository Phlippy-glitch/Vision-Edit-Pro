import type { Rng } from '../../utils/random';

export type AssetCategory = 'trees' | 'shrubs' | 'flowers' | 'hardscape' | 'house';

export interface ColorOption {
  label: string;
  value: string;
}

export interface AssetDef {
  id: string;
  name: string;
  category: AssetCategory;
  /** width / height of the rendered artwork. */
  aspect: number;
  /** Default placed height as a fraction of the photo height. */
  defaultHeight: number;
  /** Whether the object casts a soft contact shadow on the ground. */
  groundShadow: boolean;
  colors?: readonly ColorOption[];
  draw(ctx: CanvasRenderingContext2D, w: number, h: number, rng: Rng, color: string): void;
}

export const ASSET_CATEGORIES: readonly { id: AssetCategory; label: string }[] = [
  { id: 'trees', label: 'Trees' },
  { id: 'shrubs', label: 'Shrubs' },
  { id: 'flowers', label: 'Perennials' },
  { id: 'hardscape', label: 'Hardscape' },
  { id: 'house', label: 'House' },
];
