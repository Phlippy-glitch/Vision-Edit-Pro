import { beforeEach, describe, expect, it, vi } from 'vitest';

const writeFile = vi.fn(async () => ({ uri: 'file:///cache/design.jpg' }));
const share = vi.fn(async () => ({}));
vi.mock('@capacitor/filesystem', () => ({ Filesystem: { writeFile }, Directory: { Cache: 'CACHE' } }));
vi.mock('@capacitor/share', () => ({ Share: { share } }));

const { blobToBase64, shareFileNatively } = await import('../../src/services/platform');

describe('platform', () => {
  beforeEach(() => {
    writeFile.mockClear();
    share.mockClear();
  });

  it('encodes blobs as base64, including large ones', async () => {
    expect(await blobToBase64(new Blob(['hello']))).toBe('aGVsbG8=');
    const big = new Uint8Array(200_000).map((_, i) => i % 256);
    const decoded = Uint8Array.from(atob(await blobToBase64(new Blob([big]))), (c) => c.charCodeAt(0));
    expect(decoded).toEqual(big);
  });

  it('writes the image to the app cache and opens the share sheet with it', async () => {
    await shareFileNatively(new Blob(['img']), 'smith-before-after.jpg', 'Smith residence');
    expect(writeFile).toHaveBeenCalledWith({ path: 'smith-before-after.jpg', data: 'aW1n', directory: 'CACHE' });
    expect(share).toHaveBeenCalledWith({ title: 'Smith residence', files: ['file:///cache/design.jpg'] });
  });

  it('treats dismissing the share sheet as success', async () => {
    share.mockRejectedValueOnce(new Error('Share canceled'));
    await expect(shareFileNatively(new Blob(['x']), 'a.jpg', 'A')).resolves.toBeUndefined();
  });

  it('surfaces real share failures', async () => {
    share.mockRejectedValueOnce(new Error('No app can handle this'));
    await expect(shareFileNatively(new Blob(['x']), 'a.jpg', 'A')).rejects.toThrow('No app can handle this');
  });
});
