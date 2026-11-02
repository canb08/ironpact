import type { TierName } from '../../core/streak.ts';
import { tierRank } from './flame.ts';

const STORAGE_KEY = 'ironpact.bar-tier.seen';

/** First sight stores the tier and does not celebrate. A higher tier is one Tier-1. A drop is quiet. */
export function tierMomentDecision(stored: TierName | null, next: TierName): { store: TierName; celebrate: TierName | null } {
  if (stored === null || tierRank(next) <= tierRank(stored)) return { store: next, celebrate: null };
  return { store: next, celebrate: next };
}

export function tierMomentId(tier: TierName): string {
  return `bar-tier-up:${tier}`;
}

export function readStoredTier(): TierName | null {
  if (typeof localStorage === 'undefined') return null;
  const value = localStorage.getItem(STORAGE_KEY);
  if (value === 'Iron' || value === 'Steel' || value === 'Titanium' || value === 'Obsidian') return value;
  return null;
}

export function writeStoredTier(tier: TierName): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, tier);
}

export function resetTierMomentForTests(): void {
  if (typeof localStorage !== 'undefined') localStorage.removeItem(STORAGE_KEY);
}
