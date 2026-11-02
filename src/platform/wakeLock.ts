/**
 * Screen Wake Lock with a silent looping-video fallback.
 *
 * Call `keepAwake()` on session start (inside the START tap), on every rest
 * start, and it re-requests itself on `visibilitychange → visible`.
 * `releaseKeepAwake()` on session finish drops the sentinel and the video.
 *
 * `screenMaySleep()` is true when the screen should stay awake but the Wake
 * Lock is missing, rejected, or released by the OS. The chip copy is
 * `copy.screenMaySleep` ("Screen may sleep.").
 *
 * Feature-detect only. The installed-iOS bug (WebKit 254545) is fixed in
 * iOS 18.4, but low-power rejection and older installs still need the video.
 * The fallback file is `src/assets/keepawake.mp4` (silent, 1 s, looped, muted).
 */

type WakeLockHandle = {
  request(type: 'screen'): Promise<WakeLockSentinel>;
};

export type WakeResult = 'native' | 'video' | 'none';

let wanted = false;
let asleep = false;
let attempt = 0;
let sentinel: WakeLockSentinel | null = null;
let video: HTMLVideoElement | null = null;
let listening = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function setAsleep(next: boolean): void {
  if (asleep === next) return;
  asleep = next;
  emit();
}

export function screenMaySleep(): boolean {
  return asleep;
}

export function subscribeScreenMaySleep(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function keepAwakeUrl(): string {
  return new URL('../assets/keepawake.mp4', import.meta.url).href;
}

function wakeLockApi(): WakeLockHandle | null {
  if (typeof navigator === 'undefined') return null;
  const candidate = (navigator as Navigator & { wakeLock?: WakeLockHandle }).wakeLock;
  if (!candidate || typeof candidate.request !== 'function') return null;
  return candidate;
}

function startVideoFallback(): 'video' | 'none' {
  if (typeof document === 'undefined' || !document.body) {
    setAsleep(true);
    return 'none';
  }
  try {
    if (!video) {
      const element = document.createElement('video');
      element.src = keepAwakeUrl();
      element.muted = true;
      element.defaultMuted = true;
      element.loop = true;
      element.playsInline = true;
      element.setAttribute('playsinline', '');
      element.setAttribute('aria-hidden', 'true');
      element.tabIndex = -1;
      element.preload = 'auto';
      element.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:0;bottom:0';
      document.body.appendChild(element);
      video = element;
    }
    const pending = video.play?.();
    if (pending && typeof pending.catch === 'function') void pending.catch(() => {});
    setAsleep(true);
    return 'video';
  } catch {
    setAsleep(true);
    return 'none';
  }
}

function stopVideo(): void {
  if (!video) return;
  try { video.pause(); } catch { /* detached */ }
  video.remove();
  video = null;
}

function onSentinelReleased(current: WakeLockSentinel): void {
  if (sentinel !== current) return;
  sentinel = null;
  if (!wanted) {
    setAsleep(false);
    return;
  }
  startVideoFallback();
}

function ensureVisibility(): void {
  if (listening || typeof document === 'undefined') return;
  listening = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && wanted) void keepAwake();
  });
}

export async function keepAwake(): Promise<WakeResult> {
  ensureVisibility();
  wanted = true;
  const token = ++attempt;
  const api = wakeLockApi();
  if (api) {
    try {
      const next = await api.request('screen');
      if (!wanted || token !== attempt) {
        try { await next.release(); } catch { /* already gone */ }
        return video ? 'video' : 'none';
      }
      const previous = sentinel;
      sentinel = null;
      if (previous && previous !== next) {
        try { void previous.release(); } catch { /* ignore */ }
      }
      stopVideo();
      sentinel = next;
      setAsleep(false);
      next.addEventListener('release', () => { onSentinelReleased(next); });
      return 'native';
    } catch {
      /* NotAllowedError: hidden document, low power, policy. */
    }
  }
  if (!wanted || token !== attempt) return 'none';
  return startVideoFallback();
}

export function releaseKeepAwake(): void {
  wanted = false;
  attempt += 1;
  const current = sentinel;
  sentinel = null;
  if (current) {
    try { void current.release(); } catch { /* ignore */ }
  }
  stopVideo();
  setAsleep(false);
}
