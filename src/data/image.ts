import { imageDimensions, PROOF_JPEG_QUALITY, validImageBytes } from '../core/image.ts';
export interface PreparedImage { blob: Blob; width: number; height: number }

async function loadImage(image: HTMLImageElement, url: string): Promise<void> {
  // Register before src: cached/blob loads can finish before decode() rejects.
  const loaded = new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('invalid_image'));
  });
  // The event may reject while decode() is still pending. Retain it for the
  // fallback without generating an unhandled rejection in that interval.
  void loaded.catch(() => undefined);
  image.src = url;
  try {
    if (typeof image.decode === 'function') {
      try { await image.decode(); }
      catch { await loaded; }
    } else await loaded;
  } finally { image.onload = null; image.onerror = null; }
}

async function encodeJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  let blob: Blob | null = null;
  try {
    blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', PROOF_JPEG_QUALITY));
  } catch { /* Use the same canvas pixels if this encoder entry point fails. */ }
  if (!blob || blob.type !== 'image/jpeg' || blob.size === 0) {
    const encoded = canvas.toDataURL('image/jpeg', PROOF_JPEG_QUALITY);
    const prefix = 'data:image/jpeg;base64,';
    if (!encoded.startsWith(prefix)) throw new Error('invalid_image');
    const bytes = Uint8Array.from(atob(encoded.slice(prefix.length)), (character) => character.charCodeAt(0));
    blob = new Blob([bytes], { type: 'image/jpeg' });
  }
  if (!validImageBytes(blob.size)) throw new Error('invalid_image');
  return blob;
}

/** Drawing pixels into a new JPEG drops EXIF/GPS; the original is never queued. */
export async function prepareProofImage(source: Blob): Promise<PreparedImage> {
  let url: string | undefined;
  let stage = 'create_url';
  try {
    url = URL.createObjectURL(source);
    stage = 'load';
    const image = new Image();
    await loadImage(image, url);
    stage = 'dimensions';
    const size = imageDimensions(image.naturalWidth, image.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = size.width; canvas.height = size.height;
    stage = 'canvas';
    const context = canvas.getContext('2d');
    if (!context) throw new Error('invalid_image');
    context.fillStyle = '#fff'; context.fillRect(0, 0, size.width, size.height);
    context.drawImage(image, 0, 0, size.width, size.height);
    stage = 'encode';
    const blob = await encodeJpeg(canvas);
    return { blob, ...size };
  } catch (error) {
    console.error(`[Proof image:${stage}]`, error);
    throw error;
  } finally { if (url) URL.revokeObjectURL(url); }
}
