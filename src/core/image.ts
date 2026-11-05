/** Pure image preparation limits; browser decoding/encoding lives in data/image.ts. */
export const PROOF_MAX_BYTES = 5_000_000;
export const PROOF_MAX_SIDE = 1600;
export const PROOF_JPEG_QUALITY = 0.8;
export function imageDimensions(width: number, height: number): { width: number; height: number } {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new Error('invalid_image');
  const scale = Math.min(1, PROOF_MAX_SIDE / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
export function validImageBytes(bytes: number): boolean {
  return Number.isSafeInteger(bytes) && bytes > 0 && bytes <= PROOF_MAX_BYTES;
}
