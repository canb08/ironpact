import { useCallback, useRef, useSyncExternalStore } from 'react';
import type { CrewPresence } from '../../data/duo.contract.ts';
import type { Repo } from '../../data/adapter.ts';

interface PresenceClock {
  rows: readonly CrewPresence[];
  nowMs: number;
}

const EMPTY: PresenceClock = { rows: [], nowMs: 0 };

function samePresence(left: readonly CrewPresence[], right: readonly CrewPresence[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((row, index) => {
    const other = right[index];
    return other !== undefined
      && row.user_id === other.user_id
      && row.session_id === other.session_id
      && row.kind === other.kind
      && row.exercise_label === other.exercise_label
      && row.set_no === other.set_no
      && row.planned_sets === other.planned_sets
      && row.started_at === other.started_at
      && row.last_active_at === other.last_active_at;
  });
}

/** Partner presence plus the clock at the last presence change. */
export function usePresence(repo: Repo): PresenceClock {
  const snapshot = useRef<PresenceClock>(EMPTY);
  const subscribe = useCallback((onChange: () => void) => repo.duo.presence.onChange((rows) => {
    if (samePresence(snapshot.current.rows, rows)) return;
    snapshot.current = { rows, nowMs: Date.now() };
    onChange();
  }), [repo]);
  return useSyncExternalStore(subscribe, () => snapshot.current, () => snapshot.current);
}
