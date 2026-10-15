export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export function photoSignature(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if ([137,80,78,71,13,10,26,10].every((byte,index) => bytes[index] === byte)) return 'image/png';
  if (String.fromCharCode(...bytes.slice(0,4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8,12)) === 'WEBP') return 'image/webp';
  return null;
}
export async function prepareClinicalPhoto(file: File): Promise<File> {
  if (!file.size || file.size > MAX_PHOTO_BYTES) throw new Error('Each photo must be between 1 byte and 10 MB.');
  const detected = photoSignature(new Uint8Array(await file.slice(0,12).arrayBuffer()));
  if (!detected || detected !== file.type) throw new Error('Choose a valid JPEG, PNG or WebP photo.');
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    if (bitmap.width * bitmap.height > 40_000_000) throw new Error('Photo resolution exceeds 40 megapixels.');
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Photo preview is unavailable in this browser.');
    context.drawImage(bitmap, 0, 0);
    // Lossless pixel re-encoding removes EXIF/GPS metadata and embedded payloads.
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Unable to prepare this photo.')), 'image/png'));
    if (blob.size > MAX_PHOTO_BYTES) throw new Error('Prepared photo exceeds 10 MB. Please choose a smaller photo.');
    return new File([blob], 'clinical-photo.png', { type: 'image/png' });
  } finally { bitmap.close(); }
}
