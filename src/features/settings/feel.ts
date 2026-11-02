import type { Profile } from '../../core/types.ts';
import { setSoundOn } from '../../platform/audio.ts';
import { setHapticsOn } from '../../platform/haptics.ts';

/** Both steps of account deletion. The word is exact, including capitals. */
export const DELETE_WORD = 'DELETE';

export function deleteReady(held: boolean, typed: string): boolean {
  return held && typed === DELETE_WORD;
}

type Feel = Pick<Profile, 'theme' | 'battery_saver' | 'reduce_motion' | 'sound_on' | 'haptics_on'>;

let media: MediaQueryList | null = null;
let onMedia: (() => void) | null = null;

function stopMedia(): void {
  if (media && onMedia) media.removeEventListener('change', onMedia);
  media = null;
  onMedia = null;
}

/**
 * Grain and glass already follow `html[data-battery-saver='on']` in tokens.css.
 * There is no 3D plate route in this build; that attribute is what turns it off
 * once the route exists. Flags stay on the document after Settings unmounts.
 */
export function applyDocumentFeel(profile: Feel): void {
  setSoundOn(profile.sound_on);
  setHapticsOn(profile.haptics_on);
  const root = document.documentElement;
  if (profile.battery_saver) root.dataset.batterySaver = 'on';
  else delete root.dataset.batterySaver;
  if (profile.reduce_motion) root.dataset.reducedMotion = 'on';
  else delete root.dataset.reducedMotion;
  stopMedia();
  if (profile.theme === 'system') {
    const query = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    root.dataset.theme = !query || query.matches ? 'dark' : 'light';
    if (query) {
      media = query;
      onMedia = () => {
        root.dataset.theme = query.matches ? 'dark' : 'light';
      };
      query.addEventListener('change', onMedia);
    }
    return;
  }
  root.dataset.theme = profile.theme;
}

export function clearDocumentFeel(): void {
  stopMedia();
  const root = document.documentElement;
  delete root.dataset.batterySaver;
  delete root.dataset.reducedMotion;
  delete root.dataset.theme;
  setSoundOn(false);
  setHapticsOn(true);
}
