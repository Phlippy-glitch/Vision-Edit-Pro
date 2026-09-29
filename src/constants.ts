/** Photos are downscaled on import so editing stays fast on phones. */
export const MAX_PHOTO_DIMENSION = 2048;
export const PHOTO_JPEG_QUALITY = 0.92;
export const EXPORT_JPEG_QUALITY = 0.92;
export const THUMBNAIL_SIZE = 320;

/** Approximate phone camera focal length as a fraction of the long edge. */
export const FOCAL_LENGTH_FACTOR = 0.85;
/** Default horizon, as a fraction of image height from the top. */
export const DEFAULT_HORIZON_FRACTION = 0.38;

/** Procedural assets are rendered at this height before scaling. */
export const ASSET_RENDER_HEIGHT = 640;
export const TEXTURE_SIZE = 512;

export const HISTORY_LIMIT = 80;
export const AUTOSAVE_DELAY_MS = 800;

/** Touch-friendly hit radius for handles, in screen pixels. */
export const HANDLE_RADIUS = 22;
/** Pointer travel (screen px) below which a press counts as a tap. */
export const TAP_SLOP = 8;

export const MIN_ZOOM_FACTOR = 0.5;
export const MAX_ZOOM = 12;

export const DEFAULT_REMOVE_BRUSH = 36;
