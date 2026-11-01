/// <reference lib="webworker" />
import { createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

/** Only app document navigations may receive the cached shell. */
export function isAppNavigation(
  request: Pick<Request, 'url' | 'mode' | 'method'>,
  appOrigin: string,
  backendUrl?: string,
): boolean {
  const url = new URL(request.url);
  return request.method === 'GET'
    && request.mode === 'navigate'
    && url.origin === appOrigin
    && !/\.supabase\.(co|in)$/.test(url.hostname)
    && (!backendUrl || url.origin !== new URL(backendUrl).origin)
    && url.pathname !== '/functions'
    && !url.pathname.startsWith('/functions/');
}

// Register before Workbox's asset listener so a navigation is answered exactly
// once, including / and /index.html, which are also precache matches.
self.addEventListener('fetch', (event) => {
  if (!isAppNavigation(event.request, self.location.origin, import.meta.env.VITE_SUPABASE_URL)) return;
  event.respondWith(createHandlerBoundToURL('/index.html')({
    event, request: event.request, url: new URL(event.request.url),
  }));
  event.stopImmediatePropagation();
});

precacheAndRoute(self.__WB_MANIFEST);

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') event.waitUntil(self.skipWaiting());
});
