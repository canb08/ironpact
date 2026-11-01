import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const workbox = vi.hoisted(() => ({
  precacheAndRoute: vi.fn(),
  handler: vi.fn().mockResolvedValue(new Response('shell')),
  createHandlerBoundToURL: vi.fn(),
}));
vi.mock('workbox-precaching', () => workbox);

const appOrigin = 'https://spotter.example.test';
let fetchListener: (event: FetchEvent) => void;
let messageListener: (event: ExtendableMessageEvent) => void;
const skipWaiting = vi.fn().mockResolvedValue(undefined);
const manifest = [{ url: 'index.html', revision: 'v1' }];

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  workbox.createHandlerBoundToURL.mockReturnValue(workbox.handler);
  vi.stubGlobal('self', {
    location: { origin: appOrigin }, __WB_MANIFEST: manifest, skipWaiting,
    addEventListener(type: string, listener: unknown) {
      if (type === 'fetch') fetchListener = listener as typeof fetchListener;
      if (type === 'message') messageListener = listener as typeof messageListener;
    },
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('service worker shell boundary', () => {
  it.each(['/', '/index.html', '/session', '/join/ABCD123456', '/install', '/?min=1'])('serves the shell for %s', async (path) => {
    const { isAppNavigation } = await import('../../src/sw');
    expect(isAppNavigation({ url: appOrigin + path, mode: 'navigate', method: 'GET' }, appOrigin)).toBe(true);
  });

  it.each([
    [appOrigin + '/functions', 'navigate', 'GET'],
    [appOrigin + '/functions/v1/export', 'navigate', 'GET'],
    [appOrigin + '/functions/health?test=1', 'navigate', 'GET'],
    ['https://abc.supabase.co/functions/v1/export', 'navigate', 'GET'],
    ['https://other.example.test/join/ABC', 'navigate', 'GET'],
    [appOrigin + '/session', 'cors', 'GET'],
    [appOrigin + '/session', 'navigate', 'POST'],
    [appOrigin + '/assets/chunk.js', 'no-cors', 'GET'],
  ] as const)('leaves %s (%s, %s) to the network', async (url, mode, method) => {
    const { isAppNavigation } = await import('../../src/sw');
    expect(isAppNavigation({ url, mode, method }, appOrigin)).toBe(false);
    const respondWith = vi.fn();
    fetchListener({ request: { url, mode, method }, respondWith } as unknown as FetchEvent);
    expect(respondWith).not.toHaveBeenCalled();
  });

  it('excludes Supabase hosts and configured custom API origins even if used as app origin', async () => {
    const { isAppNavigation } = await import('../../src/sw');
    for (const origin of ['https://abc.supabase.co', 'https://abc.supabase.in']) {
      expect(isAppNavigation({ url: origin + '/', mode: 'navigate', method: 'GET' }, origin)).toBe(false);
    }
    expect(isAppNavigation({ url: appOrigin + '/', mode: 'navigate', method: 'GET' }, appOrigin, appOrigin + '/rest/v1')).toBe(false);
  });

  it('precaches the manifest and answers document requests exactly once with cached index.html', async () => {
    await import('../../src/sw');
    expect(workbox.precacheAndRoute).toHaveBeenCalledExactlyOnceWith(manifest);
    const respondWith = vi.fn();
    const stopImmediatePropagation = vi.fn();
    const request = { url: appOrigin + '/join/ABCD123456', mode: 'navigate', method: 'GET' };
    const event = { request, respondWith, stopImmediatePropagation } as unknown as FetchEvent;
    fetchListener(event);
    expect(workbox.createHandlerBoundToURL).toHaveBeenCalledWith('/index.html');
    expect(workbox.handler).toHaveBeenCalledWith({ event, request, url: new URL(request.url) });
    expect(respondWith).toHaveBeenCalledTimes(1);
    expect(await respondWith.mock.calls[0]?.[0]).toBeInstanceOf(Response);
    expect(stopImmediatePropagation).toHaveBeenCalledTimes(1);
  });

  it('activates a waiting update only on an explicit SKIP_WAITING message', async () => {
    await import('../../src/sw');
    expect(skipWaiting).not.toHaveBeenCalled();
    const waitUntil = vi.fn();
    for (const data of [undefined, null, {}, 'SKIP_WAITING', { type: 'OTHER' }]) {
      messageListener({ data, waitUntil } as unknown as ExtendableMessageEvent);
    }
    expect(skipWaiting).not.toHaveBeenCalled();
    messageListener({ data: { type: 'SKIP_WAITING' }, waitUntil } as unknown as ExtendableMessageEvent);
    expect(skipWaiting).toHaveBeenCalledTimes(1);
    expect(waitUntil).toHaveBeenCalledTimes(1);
  });
});
