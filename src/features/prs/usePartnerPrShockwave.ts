import { useEffect, useSyncExternalStore } from 'react';
import { formatDuration, formatKg, formatKm } from '@shared/export-format.ts';
import { useRepo } from '../../app/useRepo.ts';
import type { Repo } from '../../data/adapter.ts';
import { recomputePrs } from '../../core/prs.ts';
import { copy, fill } from '../../ui/copy.ts';
import { publishPartnerShockwaves, shockwavePlayed, type ShockwaveEvent } from '../duo/shockwave.ts';

/** E4.8: recompute against synced history before showing a partner's claim. */
export async function loadPartnerShockwaves(repo: Repo): Promise<ShockwaveEvent[]> {
  const rows = await repo.q.unseenPartnerPrs();
  if (!rows.length) return [];
  const user = repo.auth.userId();
  const exercises = await repo.q.exercises();
  const profiles = await repo.q.profiles([...new Set(rows.map((row) => row.user_id))]);
  const result: ShockwaveEvent[] = [];
  for (const profile of profiles) {
    const entries = await repo.q.entriesBetween(profile.id, '0000-01-01', '9999-12-31');
    const drafts = recomputePrs({ ...entries, bodyweights: entries.bodyweight, exercises });
    for (const row of rows.filter((item) => item.user_id === profile.id)) {
      if (!drafts.some((draft) => draft.source_id === row.source_id && draft.pr_type === row.pr_type
        && draft.exercise_id === row.exercise_id && draft.reps === row.reps
        && Math.abs(draft.value - row.value) <= 0.005)) continue;
      const set = entries.sets.find((entry) => entry.id === row.source_id && !entry.deleted_at);
      const run = entries.cardio.find((entry) => entry.id === row.source_id && !entry.deleted_at);
      const exercise = exercises.find((entry) => entry.id === row.exercise_id);
      const line = set && exercise
        ? fill(copy.partnerPrSet, { name: profile.display_name, exercise: exercise.name, kg: formatKg(set.weight_kg), reps: set.reps })
        : run ? fill(copy.shockwaveLine, { name: profile.display_name, exercise: copy.run,
          detail: `${formatKm(run.distance_m)} ${copy.km} · ${formatDuration(run.duration_s)}` }) : null;
      if (!line) continue;
      result.push({ id: row.id, name: profile.display_name, exercise: exercise?.name ?? copy.run,
        detail: '', line, playKey: `${user}:${row.id}`,
        onPlayed: () => {
          if (repo.auth.userId() === user) void repo.w.markPrEventsSeen([row.id]).catch(() => {});
        },
      });
    }
  }
  return result;
}

/** Floor/Crew open: pull, verify, publish. Only playback acknowledges a PR. */
export function usePartnerPrShockwave(): void {
  const repo = useRepo();
  const user = useSyncExternalStore(repo.auth.onChange, repo.auth.userId);
  useEffect(() => {
    let live = true;
    publishPartnerShockwaves([]);
    if (user) void (async () => {
      // Include the first launch's server rows; the Repo returns immediately offline.
      await repo.sync.pullNow();
      const events = await loadPartnerShockwaves(repo);
      if (!live || repo.auth.userId() !== user) return;
      const played = new Set(shockwavePlayed());
      const retry = events.filter((event) => played.has(event.playKey!)).map((event) => event.id);
      // A previous offline play is not replayed, but its receipt is retried.
      if (retry.length) void repo.w.markPrEventsSeen(retry).catch(() => {});
      publishPartnerShockwaves(events);
    })().catch(() => {});
    return () => { live = false; publishPartnerShockwaves([]); };
  }, [repo, user]);
}
