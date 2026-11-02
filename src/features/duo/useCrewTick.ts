import { useEffect, useState } from 'react';
import type { Repo } from '../../data/adapter.ts';

/** Bumps after a crew delta pull so a live feed row can insert with no animation. */
export function useCrewTick(repo: Repo): number {
  const [tick, setTick] = useState(0);
  useEffect(() => repo.duo.onCrewChange(() => setTick((value) => value + 1)), [repo]);
  return tick;
}
