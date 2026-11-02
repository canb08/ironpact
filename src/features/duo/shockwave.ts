import { readIdList, writeIdList } from './ringClose.ts';

/** 1.5s card (§3.9.4). Tier 2, so it never takes over the screen. */
export const SHOCKWAVE_MS = 1500;

export const SHOCKWAVE_KEY = 'ironpact.shockwave.played';

export interface ShockwaveEvent {
  id: string;
  name: string;
  exercise: string;
  /** Already formatted, e.g. "85 kg × 5". */
  detail: string;
}

/**
 * P4C owns `usePartnerPrShockwave()` (`pr_events.seen_by`). That export is not on main yet.
 * Floor and Crew render whatever this bridge is given; the play-once store is the next-open guard.
 */
let current: readonly ShockwaveEvent[] = [];
const listeners = new Set<() => void>();

export function publishPartnerShockwaves(events: readonly ShockwaveEvent[]): void {
  current = events;
  for (const listener of listeners) listener();
}

export function subscribePartnerShockwaves(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function partnerShockwaveSnapshot(): readonly ShockwaveEvent[] {
  return current;
}

/** The next unseen event, or null while a session is open (wait until RACK IT). */
export function pickShockwave(
  events: readonly ShockwaveEvent[],
  played: readonly string[],
  inSession: boolean,
): ShockwaveEvent | null {
  if (inSession) return null;
  const seen = new Set(played);
  return events.find((event) => !seen.has(event.id)) ?? null;
}

export function shockwavePlayed(): string[] {
  return readIdList(SHOCKWAVE_KEY);
}

export function rememberShockwave(id: string): void {
  const played = readIdList(SHOCKWAVE_KEY);
  if (!played.includes(id)) writeIdList(SHOCKWAVE_KEY, [...played, id]);
}

export function resetShockwaveForTests(): void {
  current = [];
  for (const listener of listeners) listener();
  if (typeof localStorage !== 'undefined') localStorage.removeItem(SHOCKWAVE_KEY);
}
