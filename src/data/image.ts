import { imageDimensions, PROOF_JPEG_QUALITY, validImageBytes } from '../core/image.ts';
export interface PreparedImage { blob: Blob; width: number; height: number }
/** Drawing pixels into a new JPEG drops EXIF/GPS; the original is never queued. */
export async function prepareProofImage(source: Blob): Promise<PreparedImage> {
  const url = URL.createObjectURL(source);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const size = imageDimensions(image.naturalWidth, image.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = size.width; canvas.height = size.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('invalid_image');
    context.fillStyle = '#fff'; context.fillRect(0, 0, size.width, size.height);
    context.drawImage(image, 0, 0, size.width, size.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', PROOF_JPEG_QUALITY));
    if (!blob || blob.type !== 'image/jpeg' || !validImageBytes(blob.size)) throw new Error('invalid_image');
    return { blob, ...size };
  } finally { URL.revokeObjectURL(url); }
}
