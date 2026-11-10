// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prepareProofImage } from '../../../src/data/image.ts';
import { PROOF_JPEG_QUALITY } from '../../../src/core/image.ts';

let decodeRejects = false;
let hasDecode = true;
let loadFails = false;
const images: TestImage[] = [];
const createUrl = vi.fn(() => 'blob:proof-source');
const revokeUrl = vi.fn();
const drawImage = vi.fn();
const fillRect = vi.fn();
class TestImage {
  naturalWidth = 3200;
  naturalHeight = 2400;
  onload: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  decode: (() => Promise<void>) | undefined;
  constructor() {
    images.push(this);
    this.decode = hasDecode ? vi.fn(() => decodeRejects ? Promise.reject(new Error('decode rejected')) : Promise.resolve()) : undefined;
  }
  set src(_value: string) {
    queueMicrotask(() => { if (loadFails) this.onerror?.(new Event('error')); else this.onload?.(new Event('load')); });
  }
}

beforeEach(() => {
  decodeRejects = false; hasDecode = true; loadFails = false; images.length = 0;
  vi.stubGlobal('Image', TestImage);
  const NativeURL = globalThis.URL;
  vi.stubGlobal('URL', class extends NativeURL { static createObjectURL = createUrl; static revokeObjectURL = revokeUrl; });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ fillStyle: '', fillRect, drawImage } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => callback(new Blob(['jpeg bytes'], { type: 'image/jpeg' })));
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(`data:image/jpeg;base64,${btoa('jpeg fallback')}`);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

function dataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

describe('Proof image browser fallbacks', () => {
  it('decodes, draws resized pixels, and produces a JPEG with the existing quality', async () => {
    const source = new Blob(['source with metadata'], { type: 'image/png' });
    const result = await prepareProofImage(source);
    expect(result).toMatchObject({ width: 1600, height: 1200, blob: { type: 'image/jpeg', size: 10 } });
    expect(createUrl).toHaveBeenCalledWith(source);
    expect(fillRect).toHaveBeenCalledWith(0, 0, 1600, 1200);
    expect(drawImage).toHaveBeenCalledWith(images[0], 0, 0, 1600, 1200);
    expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', PROOF_JPEG_QUALITY);
    expect(HTMLCanvasElement.prototype.toDataURL).not.toHaveBeenCalled();
    expect(images[0]?.onload).toBeNull(); expect(images[0]?.onerror).toBeNull();
    expect(revokeUrl).toHaveBeenCalledExactlyOnceWith('blob:proof-source');
  });

  it('uses the load event when decode rejects despite a successful image load', async () => {
    decodeRejects = true;
    await expect(prepareProofImage(new Blob(['source']))).resolves.toMatchObject({ width: 1600, height: 1200 });
    expect(console.error).not.toHaveBeenCalled();
    expect(images[0]?.onload).toBeNull(); expect(images[0]?.onerror).toBeNull();
  });

  it('uses the load event if decode is unavailable', async () => {
    hasDecode = false;
    await expect(prepareProofImage(new Blob(['source']))).resolves.toMatchObject({ blob: { type: 'image/jpeg' } });
  });

  it('reports a failed load and revokes its URL when both decode and the load event fail', async () => {
    decodeRejects = true; loadFails = true;
    await expect(prepareProofImage(new Blob(['source']))).rejects.toThrow('invalid_image');
    expect(console.error).toHaveBeenCalledWith('[Proof image:load]', expect.any(Error));
    expect(drawImage).not.toHaveBeenCalled();
    expect(revokeUrl).toHaveBeenCalledExactlyOnceWith('blob:proof-source');
  });

  it('turns the JPEG data URL into an equivalent Blob when toBlob returns null', async () => {
    vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementation((callback) => callback(null));
    const result = await prepareProofImage(new Blob(['source']));
    expect(HTMLCanvasElement.prototype.toDataURL).toHaveBeenCalledWith('image/jpeg', PROOF_JPEG_QUALITY);
    expect(await dataUrl(result.blob)).toBe(`data:image/jpeg;base64,${btoa('jpeg fallback')}`);
    expect(revokeUrl).toHaveBeenCalledExactlyOnceWith('blob:proof-source');
  });

  it('also uses the data URL encoder when toBlob throws', async () => {
    vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementation(() => { throw new Error('encoder unavailable'); });
    const result = await prepareProofImage(new Blob(['source']));
    expect(await dataUrl(result.blob)).toBe(`data:image/jpeg;base64,${btoa('jpeg fallback')}`);
    expect(console.error).not.toHaveBeenCalled();
  });

  it('rejects a non-JPEG fallback instead of labelling PNG bytes as a JPEG', async () => {
    vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementation((callback) => callback(null));
    vi.mocked(HTMLCanvasElement.prototype.toDataURL).mockReturnValue('data:image/png;base64,cG5n');
    await expect(prepareProofImage(new Blob(['source']))).rejects.toThrow('invalid_image');
    expect(console.error).toHaveBeenCalledWith('[Proof image:encode]', expect.any(Error));
    expect(revokeUrl).toHaveBeenCalledExactlyOnceWith('blob:proof-source');
  });
});
