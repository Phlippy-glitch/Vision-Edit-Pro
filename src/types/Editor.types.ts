/** A point in image pixel coordinates. */
export interface Point {
  x: number;
  y: number;
}

interface LayerBase {
  id: string;
  name: string;
  visible: boolean;
  /** 0..1 */
  opacity: number;
}

/** A placed object (tree, shrub, door...) from the catalog. */
export interface StampLayer extends LayerBase {
  kind: 'stamp';
  assetId: string;
  /** Seed for the procedural generator, so each plant can look unique. */
  seed: number;
  /** Optional color choice for assets that offer color options. */
  color?: string;
  /** Anchor point (bottom-center, where the object meets the ground). */
  x: number;
  y: number;
  /** Rendered height in image pixels. */
  height: number;
  /** Radians, rotation around the anchor. */
  rotation: number;
  flipX: boolean;
  /** Multiplier, 1 = unchanged. */
  brightness: number;
  shadow: boolean;
}

/** A polygon filled with a surface material (lawn, pavers, mulch, siding...). */
export interface AreaLayer extends LayerBase {
  kind: 'area';
  materialId: string;
  points: Point[];
  /** Size of one texture tile, in image pixels, at the nearest edge of the area. */
  tileSize: number;
  /** Radians, rotates the material pattern. */
  textureAngle: number;
  /** Ground surfaces recede toward the horizon; walls do not. */
  perspective: boolean;
  /** 0..1, how much of the photo's light and shadow to keep. */
  shading: number;
  brightness: number;
  /** Edge softness in image pixels. */
  feather: number;
  /** Measured area typed in by the user; replaces the photo estimate when set. */
  areaOverrideSqFt?: number;
}

/** A patch that erases an existing feature using surrounding texture. */
export interface RemovalLayer extends LayerBase {
  kind: 'removal';
  x: number;
  y: number;
  width: number;
  height: number;
  /** PNG data URL of the patch, including a feathered alpha edge. */
  patch: string;
}

export type Layer = StampLayer | AreaLayer | RemovalLayer;
export type LayerKind = Layer['kind'];

/** Everything about a design that is undoable. */
export interface DesignDoc {
  layers: Layer[];
  /** Horizon line in image pixels; used for ground-plane perspective. */
  horizonY: number;
}

export interface ProjectMeta {
  id: string;
  name: string;
  clientName: string;
  createdAt: number;
  updatedAt: number;
  width: number;
  height: number;
}

export interface Project extends ProjectMeta {
  photo: Blob;
  thumbnail: Blob | null;
  doc: DesignDoc;
}

export type Tool = 'select' | 'area' | 'remove' | 'horizon';

/** A plant photographed by the user and cut out for use as a catalog item. */
export interface CustomAssetRecord {
  id: string;
  name: string;
  /** Trimmed PNG with a transparent background. */
  image: Blob;
  width: number;
  height: number;
  /** Default placed height as a fraction of the photo height. */
  defaultHeight: number;
  createdAt: number;
}
