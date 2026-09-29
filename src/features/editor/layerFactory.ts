import type { AreaLayer, Point, StampLayer } from '../../types/Editor.types';
import type { AssetDef } from '../../services/art/assets.types';
import type { MaterialDef } from '../../services/art/materials';
import { defaultAssetColor } from '../../services/art/catalog';
import { clamp } from '../../utils/geometry';
import { createId } from '../../utils/id';
import { randomSeed } from '../../utils/random';

/**
 * Relative size of an object at image row `y` versus the bottom of the
 * photo, based on distance below the horizon. Objects nearer the horizon
 * are farther away and therefore smaller.
 */
export function depthFactor(y: number, horizonY: number, imageHeight: number): number {
  const reference = imageHeight * 0.9 - horizonY;
  if (reference <= 1) return 1;
  return clamp((y - horizonY) / reference, 0.25, 1.3);
}

/** Whether moving this object should rescale it with distance. */
export function scalesWithDepth(asset: AssetDef): boolean {
  return asset.category !== 'house';
}

export function createStampLayer(
  asset: AssetDef,
  anchor: Point,
  imageHeight: number,
  horizonY: number,
): StampLayer {
  const depth = scalesWithDepth(asset) ? depthFactor(anchor.y, horizonY, imageHeight) : 1;
  return {
    id: createId(),
    kind: 'stamp',
    name: asset.name,
    visible: true,
    opacity: 1,
    assetId: asset.id,
    seed: randomSeed(),
    color: defaultAssetColor(asset) || undefined,
    x: anchor.x,
    y: anchor.y,
    height: asset.defaultHeight * imageHeight * depth,
    rotation: 0,
    flipX: false,
    brightness: 1,
    shadow: asset.groundShadow,
  };
}

export function createAreaLayer(material: MaterialDef, points: Point[], imageWidth: number): AreaLayer {
  return {
    id: createId(),
    kind: 'area',
    name: material.name,
    visible: true,
    opacity: 1,
    materialId: material.id,
    points,
    tileSize: material.defaultTile * imageWidth,
    textureAngle: 0,
    perspective: material.perspective,
    shading: material.shading,
    brightness: 1,
    feather: Math.max(1.5, imageWidth * 0.0015),
  };
}
