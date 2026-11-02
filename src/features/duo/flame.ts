import type { TierName } from '../../core/streak.ts';

/** D7 / D10. Outer flame colour, in tier order. Obsidian's body is the near-black core. */
export const FLAME_TIER_COLOR: Record<TierName, string> = {
  Iron: '#B87333',
  Steel: '#9AA0A6',
  Titanium: '#7FA7C9',
  Obsidian: '#1A1420',
};

export const FLAME_MID = '#FF4D00';
export const FLAME_CORE = '#F2F0EB';

const RANK: readonly TierName[] = ['Iron', 'Steel', 'Titanium', 'Obsidian'];

export function tierRank(tier: TierName): number {
  return RANK.indexOf(tier);
}

/** Breath runs only on screen, and never under reduced motion or battery saver (§3.9.2). */
export function flameBreath(input: { reduced: boolean; batterySaver: boolean; onScreen: boolean }): 'running' | 'paused' {
  if (input.reduced || input.batterySaver || !input.onScreen) return 'paused';
  return 'running';
}
