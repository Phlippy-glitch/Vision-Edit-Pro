import { Capacitor } from '@capacitor/core';

/** True inside the iOS/Android app shell; false in a browser or installed PWA. */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  // Chunked so large images don't exceed the argument limit of fromCharCode.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/**
 * Opens the native share sheet with a file. Android's WebView has no Web
 * Share API or blob downloads, so the file is written to the app cache and
 * shared by URI.
 */
export async function shareFileNatively(blob: Blob, filename: string, title: string): Promise<void> {
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
  const { uri } = await Filesystem.writeFile({ path: filename, data: await blobToBase64(blob), directory: Directory.Cache });
  try {
    await Share.share({ title, files: [uri] });
  } catch (error) {
    // Dismissing the share sheet rejects; that's not a failure.
    if (error instanceof Error && /cancel/i.test(error.message)) return;
    throw error;
  }
}
