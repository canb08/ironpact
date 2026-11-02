// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { keepAwake, releaseKeepAwake, screenMaySleep } from '../../../src/platform/wakeLock';

type Sentinel = {
  release: ReturnType<typeof vi.fn>;
  addEventListener: (type: string, listener: () => void) => void;
};

beforeEach(() => {
  document.body.innerHTML = '';
  HTMLMediaElement.prototype.play = () => Promise.resolve();
  HTMLMediaElement.prototype.pause = () => {};
});

afterEach(() => {
  releaseKeepAwake();
  document.querySelectorAll('video').forEach((node) => node.remove());
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function video(): HTMLVideoElement | null {
  return document.querySelector('video');
}

describe('wake lock', () => {
  it('API missing leads to the looping muted video and screenMaySleep', async () => {
    vi.stubGlobal('navigator', {});
    expect(await keepAwake()).toBe('video');
    expect(screenMaySleep()).toBe(true);
    const element = video();
    expect(element).not.toBeNull();
    expect(element?.muted).toBe(true);
    expect(element?.loop).toBe(true);
    expect(element?.getAttribute('playsinline')).toBe('');
    expect(element?.src).toContain('keepawake');
    expect(element?.style.width).toBe('1px');
    expect(element?.style.height).toBe('1px');
  });

  it('a rejected request leads to the fallback and screenMaySleep', async () => {
    const request = vi.fn().mockRejectedValue(new DOMException('low power', 'NotAllowedError'));
    vi.stubGlobal('navigator', { wakeLock: { request } });
    expect(await keepAwake()).toBe('video');
    expect(request).toHaveBeenCalledWith('screen');
    expect(screenMaySleep()).toBe(true);
    expect(video()).not.toBeNull();
  });

  it('a released sentinel leads to the fallback and screenMaySleep', async () => {
    let onRelease: (() => void) | undefined;
    const sentinel: Sentinel = {
      release: vi.fn(async () => { onRelease?.(); }),
      addEventListener: (type, listener) => { if (type === 'release') onRelease = listener; },
    };
    const request = vi.fn().mockResolvedValue(sentinel);
    vi.stubGlobal('navigator', { wakeLock: { request } });
    expect(await keepAwake()).toBe('native');
    expect(screenMaySleep()).toBe(false);
    expect(video()).toBeNull();

    onRelease?.();
    expect(screenMaySleep()).toBe(true);
    expect(video()).not.toBeNull();
    expect(video()?.muted).toBe(true);
  });

  it('re-requests on visibility and an intentional release clears the chip', async () => {
    const request = vi.fn()
      .mockRejectedValueOnce(new DOMException('hidden', 'NotAllowedError'))
      .mockResolvedValue({
        release: vi.fn(async () => {}),
        addEventListener: vi.fn(),
      });
    vi.stubGlobal('navigator', { wakeLock: { request } });
    expect(await keepAwake()).toBe('video');
    expect(screenMaySleep()).toBe(true);

    document.dispatchEvent(new Event('visibilitychange'));
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    expect(screenMaySleep()).toBe(false);
    expect(video()).toBeNull();

    releaseKeepAwake();
    expect(screenMaySleep()).toBe(false);
    expect(video()).toBeNull();
  });
});
