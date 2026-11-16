/**
 * Turn a picked photo into a small square avatar: centre-crop to 1:1, scale to 256×256,
 * encode as WebP (JPEG where WebP encoding isn't supported) at quality 0.82.
 * The result is a ~10–25 KB data URL, small enough for localStorage, sync and backups.
 */

export const AVATAR_SIZE = 256;
const QUALITY = 0.82;
const MAX_INPUT_BYTES = 40 * 1024 * 1024;

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('decode failed'));
    };
    img.src = url;
  });
}

export async function compressAvatar(file) {
  if (!file || (file.type && !file.type.startsWith('image/')) || file.size > MAX_INPUT_BYTES) {
    throw new Error('not an image');
  }
  const img = await loadImage(file);
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) throw new Error('empty image');

  const side = Math.min(w, h);
  const sx = (w - side) / 2;
  const sy = (h - side) / 2;

  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no canvas');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  // Transparent PNGs would turn black as JPEG; give them the app background instead.
  ctx.fillStyle = '#080a0f';
  ctx.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
  ctx.drawImage(img, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);

  let url = canvas.toDataURL('image/webp', QUALITY);
  // Browsers that can't encode WebP silently return PNG.
  if (!url.startsWith('data:image/webp')) url = canvas.toDataURL('image/jpeg', QUALITY);
  if (!url.startsWith('data:image/')) throw new Error('encode failed');
  return url;
}
