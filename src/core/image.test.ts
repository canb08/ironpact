import { describe, expect, it } from 'vitest';
import { imageDimensions, validImageBytes } from './image.ts';
describe('Proof image maths', () => {
  it.each([[4000,3000,1600,1200],[3000,4000,1200,1600],[1000,1000,1000,1000],[1,10000,1,1600],[1600,900,1600,900]])('sizes %s × %s without upscaling', (w,h,x,y) => {
    expect(imageDimensions(w,h)).toEqual({ width:x, height:y });
  });
  it.each([[0,1],[-1,2],[Infinity,2],[NaN,2],[2,NaN]])('rejects invalid dimensions', (w,h) => expect(() => imageDimensions(w,h)).toThrow('invalid_image'));
  it('enforces the encoded byte boundary', () => {
    expect(validImageBytes(1)).toBe(true); expect(validImageBytes(5_000_000)).toBe(true);
    for (const value of [0,-1,NaN,Infinity,1.5,5_000_001]) expect(validImageBytes(value)).toBe(false);
  });
});
