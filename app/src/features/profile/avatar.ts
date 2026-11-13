import { tr } from '../../services/i18n';

/** What the server accepts is 120,000 characters of data URL; stay well under it so a retry is never needed. */
const MAX_CHARS = 90_000;
const MAX_FILE_BYTES = 12 * 1024 * 1024;
/** Tried in order until the result fits: pixel edge and encoder quality. */
const ATTEMPTS: [number, number][] = [[320, 0.86], [256, 0.82], [256, 0.7], [192, 0.7], [160, 0.6], [128, 0.6]];

async function decode(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; release: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bmp, width: bmp.width, height: bmp.height, release: () => bmp.close() };
    } catch {
      /* fall through to <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, release: () => undefined };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Turns a chosen picture into a small square data URL for the profile: centre-cropped, scaled down and
 * re-encoded (WebP, JPEG as a fallback), so a 12 MB phone photo becomes about 20 KB and nothing the
 * browser could not decode as an image is ever stored. Throws an Error with a message fit for a toast.
 */
export async function imageFileToAvatar(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error(tr('Pilih berkas gambar (JPG, PNG, atau WebP).'));
  if (file.size > MAX_FILE_BYTES) throw new Error(tr('Gambar terlalu besar. Pilih yang di bawah 12 MB.'));

  let decoded;
  try {
    decoded = await decode(file);
  } catch {
    throw new Error(tr('Gambar ini tidak bisa dibuka. Coba berkas lain.'));
  }

  try {
    const { source, width, height } = decoded;
    if (!width || !height) throw new Error('empty');
    const side = Math.min(width, height);
    const sx = (width - side) / 2;
    const sy = (height - side) / 2;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');

    for (const [edge, quality] of ATTEMPTS) {
      const size = Math.min(edge, side);
      canvas.width = size;
      canvas.height = size;
      ctx.clearRect(0, 0, size, size);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(source, sx, sy, side, side, 0, 0, size, size);
      for (const type of ['image/webp', 'image/jpeg']) {
        const url = canvas.toDataURL(type, quality);
        if (url.startsWith(`data:${type};base64,`) && url.length <= MAX_CHARS) return url;
      }
    }
    throw new Error(tr('Gambar ini terlalu rumit untuk dikecilkan. Coba gambar lain.'));
  } catch (err) {
    if (err instanceof Error && err.message !== 'empty' && err.message !== 'no 2d context') throw err;
    throw new Error(tr('Gambar ini tidak bisa diproses. Coba berkas lain.'));
  } finally {
    decoded.release();
  }
}
