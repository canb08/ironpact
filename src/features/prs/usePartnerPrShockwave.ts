import { useEffect, useMemo, useState } from 'react';
import { useRepo } from '../../app/useRepo.ts';
import type { Repo } from '../../data/adapter.ts';
import { copy, fill } from '../../ui/copy.ts';

/** One unseen partner PR. Lane E (P4E) renders the shockwave; this hook only supplies rows. */
export interface PartnerPrSeen {
  id: string;
  partnerName: string;
  exerciseName: string;
  kg: number;
  reps: number | null;
}

export interface PartnerPrShockwave extends PartnerPrSeen {
  /** "{name} · Bench · 85 kg × 5" (Flow 5). */
  line: string;
}

export interface PartnerPrPort {
  /** Partner PRs whose `seen_by` does not yet include the viewer. */
  listUnseen(): Promise<readonly PartnerPrSeen[]>;
  /** Append the viewer to `pr_events.seen_by` through a Repo write. */
  markSeen(ids: readonly string[]): Promise<void>;
}

type PartnerQuery = Repo['q'] & {
  unseenPartnerPrs?: () => Promise<readonly PartnerPrSeen[]>;
};
type PartnerWrite = Repo['w'] & {
  markPrEventsSeen?: (ids: readonly string[]) => Promise<unknown>;
};

/**
 * P2A's `prEvents` returns only the caller's rows, and `RepoWrites` has no
 * `seen_by` append. Until both exist, this returns null and the hook stays idle.
 */
export function repoPartnerPrPort(repo: Repo): PartnerPrPort | null {
  const queries = repo.q as PartnerQuery;
  const writes = repo.w as PartnerWrite;
  if (typeof queries.unseenPartnerPrs !== 'function' || typeof writes.markPrEventsSeen !== 'function') {
    return null;
  }
  const listUnseen = queries.unseenPartnerPrs.bind(queries);
  const markPrEventsSeen = writes.markPrEventsSeen.bind(writes);
  return {
    listUnseen: () => listUnseen(),
    markSeen: async (ids) => {
      await markPrEventsSeen(ids);
    },
  };
}

export function formatPartnerPr(row: PartnerPrSeen): string {
  if (row.reps == null) {
    return fill(copy.partnerPrKg, { name: row.partnerName, exercise: row.exerciseName, kg: row.kg });
  }
  return fill(copy.partnerPrSet, {
    name: row.partnerName,
    exercise: row.exerciseName,
    kg: row.kg,
    reps: row.reps,
  });
}

export interface ShockwaveState {
  events: readonly PartnerPrShockwave[];
  /** `unsupported` when P2A has no partner-PR query and no seen write. */
  status: 'loading' | 'ready' | 'unsupported';
}

/**
 * Returns unseen partner PRs once, then marks them seen.
 * A later mount asks again; after a successful mark the port's list is empty.
 */
export function usePartnerPrShockwave(): ShockwaveState {
  const repo = useRepo();
  const port = useMemo(() => repoPartnerPrPort(repo), [repo]);
  const [events, setEvents] = useState<readonly PartnerPrShockwave[]>([]);
  const [status, setStatus] = useState<ShockwaveState['status']>(port ? 'loading' : 'unsupported');

  useEffect(() => {
    if (!port) return undefined;
    let live = true;
    void port.listUnseen().then(async (rows) => {
      if (!live) return;
      if (rows.length > 0) await port.markSeen(rows.map((row) => row.id));
      if (!live) return;
      setEvents(rows.map((row) => ({ ...row, line: formatPartnerPr(row) })));
      setStatus('ready');
    }).catch(() => {
      if (live) setStatus('ready');
    });
    return () => {
      live = false;
    };
  }, [port]);

  return { events, status };
}
