// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const installed = vi.hoisted(() => vi.fn(() => false));
vi.mock('../../../src/platform/install', () => ({ isStandalone: installed }));
let registered: Array<[string, EventListenerOrEventListenerObject]>;

beforeEach(() => {
  vi.resetModules();
  installed.mockReturnValue(false);
  localStorage.clear();
  registered = [];
  const add = window.addEventListener.bind(window);
  vi.spyOn(window, 'addEventListener').mockImplementation((type, listener, options) => {
    registered.push([type, listener]);
    add(type, listener, options);
  });
});
afterEach(() => {
  for (const [type, listener] of registered) window.removeEventListener(type, listener);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('storage persistence after installation', () => {
  it.each([true, false])('calls persist once, stores %s, and remembers across launches', async (granted) => {
    const persist = vi.fn().mockResolvedValue(granted);
    vi.stubGlobal('navigator', { storage: { persist } });
    let storage = await import('../../../src/platform/storage');
    expect(await storage.persistStorageAfterInstall()).toBeUndefined();
    expect(persist).not.toHaveBeenCalled();
    installed.mockReturnValue(true);
    const results = await Promise.all(Array.from({ length: 5 }, () => storage.persistStorageAfterInstall()));
    expect(results).toEqual(Array(5).fill(granted));
    expect(persist).toHaveBeenCalledTimes(1);
    vi.resetModules();
    storage = await import('../../../src/platform/storage');
    expect(await storage.persistStorageAfterInstall()).toBe(granted);
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('waits for standalone rather than asking in the installing browser tab', async () => {
    const persist = vi.fn().mockResolvedValue(true);
    vi.stubGlobal('navigator', { storage: { persist } });
    const storage = await import('../../../src/platform/storage');
    window.dispatchEvent(new Event('appinstalled'));
    expect(persist).not.toHaveBeenCalled();
    installed.mockReturnValue(true);
    window.dispatchEvent(new Event('appinstalled'));
    window.dispatchEvent(new Event('appinstalled'));
    expect(await storage.persistStorageAfterInstall()).toBe(true);
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it.each([{}, { storage: {} }])('is a no-op with missing APIs: %j', async (nav) => {
    vi.stubGlobal('navigator', nav);
    const { persistStorageAfterInstall } = await import('../../../src/platform/storage');
    expect(await persistStorageAfterInstall(true)).toBeUndefined();
  });

  it('is a no-op without a navigator', async () => {
    vi.stubGlobal('navigator', undefined);
    const { persistStorageAfterInstall } = await import('../../../src/platform/storage');
    expect(await persistStorageAfterInstall(true)).toBeUndefined();
  });

  it('handles blocked localStorage and a denied persistence request without crashing', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    const persist = vi.fn().mockResolvedValue(false);
    vi.stubGlobal('navigator', { storage: { persist } });
    const { persistStorageAfterInstall } = await import('../../../src/platform/storage');
    expect(await persistStorageAfterInstall(true)).toBe(false);
    expect(await persistStorageAfterInstall(true)).toBe(false);
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('catches API rejections and synchronous errors', async () => {
    const persist = vi.fn().mockRejectedValue(new Error('denied'));
    vi.stubGlobal('navigator', { storage: { persist } });
    let storage = await import('../../../src/platform/storage');
    expect(await storage.persistStorageAfterInstall(true)).toBeUndefined();
    vi.resetModules();
    persist.mockImplementation(() => { throw new Error('insecure context'); });
    storage = await import('../../../src/platform/storage');
    expect(await storage.persistStorageAfterInstall(true)).toBeUndefined();
  });
});
