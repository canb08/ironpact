type InstallChoice = { outcome: 'accepted' | 'dismissed'; platform: string };

interface InstallPromptEvent extends Event {
  prompt(): Promise<InstallChoice>;
  userChoice: Promise<InstallChoice>;
}

export type InstallBrowser = 'ios-safari' | 'ios-other' | 'android' | 'other';

export function isStandalone(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  return (typeof window.matchMedia === 'function'
    && window.matchMedia('(display-mode: standalone)').matches)
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function getInstallBrowser(): InstallBrowser {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent;
  // iPadOS can report a desktop Mac user agent.
  const ios = /iPad|iPhone|iPod/.test(ua)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (ios) {
    return /Safari\//.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|GSA|Instagram|FBAN|FBAV/.test(ua)
      ? 'ios-safari' : 'ios-other';
  }
  return /Android/.test(ua) ? 'android' : 'other';
}

let deferredPrompt: InstallPromptEvent | undefined;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

export function subscribeInstall(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function canPromptInstall(): boolean {
  return deferredPrompt !== undefined;
}

/** Call from a tap handler. Browsers without a captured prompt are a no-op. */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const prompt = deferredPrompt;
  if (!prompt) return 'unavailable';
  deferredPrompt = undefined; // A prompt event can only be used once.
  notify();
  try {
    await prompt.prompt();
    return (await prompt.userChoice).outcome;
  } catch {
    return 'unavailable';
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    if (!('prompt' in event) || typeof event.prompt !== 'function' || !('userChoice' in event)) return;
    event.preventDefault();
    deferredPrompt = event as InstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = undefined;
    notify();
  });
  if (typeof window.matchMedia === 'function') {
    const mode = window.matchMedia('(display-mode: standalone)');
    mode.addEventListener?.('change', notify);
  }
}
