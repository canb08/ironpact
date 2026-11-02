import { expect, it, vi } from 'vitest';
import type { Remote } from '../../../src/data/adapter.ts';
import { createClock } from '../../../src/data/clock.ts';
import { IronpactDB } from '../../../src/data/db.ts';
import { createDataRepo } from '../../../src/data/repo.ts';
import { ManualEnvironment, unwrap } from './harness.ts';

/** Identical L16 assertions against the real Repo and either Remote implementation. */
export function runPartnerPrContract(makePair: () => Promise<{ owner: Remote; asPartner(): Promise<Remote> }>) {
  it('L16: partner query, offline retry, receipt-only RPC, idempotency and crew departure', async () => {
    const pair = await makePair();
    const environment = new ManualEnvironment();
    environment.setOnline(true);
    const db = new IronpactDB(`ironpact-partner-${crypto.randomUUID()}`);
    let time = Date.parse('2026-11-02T10:00:00Z');
    const clock = createClock({ now: () => time, timezone: () => 'Europe/Amsterdam' });
    let repo = createDataRepo(pair.owner, { db, environment, clock, autoStart: false });
    try {
      await repo.ready;
      await repo.sync.pullNow();
      const exercise = unwrap(await repo.w.createExercise({ name: 'Contract lift', export_label: 'Contract lift', kind: 'lift', category: 'compound', lower_body: false }));
      for (const kg of [60, 80, 100]) {
        time += 60_000;
        const session = unwrap(await repo.w.startSession({ kind: 'gym' }));
        unwrap(await repo.w.logSet({ session_id: session.id, exercise_id: exercise.id, weight_kg: kg, reps: 5 }));
        unwrap(await repo.w.finishSession(session.id));
      }
      unwrap(await repo.w.recomputePrs(exercise.id));
      await repo.sync.flushNow();
      const claims = await repo.q.prEvents({});
      expect(claims.length).toBeGreaterThan(0);
      expect(await repo.q.unseenPartnerPrs()).toEqual([]);
      const ids = claims.map((row) => row.id);
      const before = unwrap(await pair.owner.fetchByIds('pr_events', ids));
      repo.close();
      const viewer = await pair.asPartner();
      repo = createDataRepo(viewer, { db, environment, clock, autoStart: false });
      await repo.ready;
      await repo.sync.pullNow();
      expect((await repo.q.unseenPartnerPrs()).map((row) => row.id).sort()).toEqual([...ids].sort());
      const mark = vi.spyOn(viewer, 'markPrEventsSeen');
      environment.setOnline(false);
      expect(await repo.w.markPrEventsSeen(ids)).toEqual({ ok: false, error: 'network' });
      expect(mark).not.toHaveBeenCalled();
      expect(await db.outbox.count()).toBe(0);
      expect(await repo.q.unseenPartnerPrs()).toHaveLength(ids.length);
      environment.setOnline(true);
      mark.mockResolvedValueOnce({ ok: false, error: 'network' });
      expect(await repo.w.markPrEventsSeen(ids)).toEqual({ ok: false, error: 'network' });
      expect(await repo.q.unseenPartnerPrs()).toHaveLength(ids.length);
      expect(await db.outbox.count()).toBe(0);
      unwrap(await repo.w.markPrEventsSeen([...ids, ...ids]));
      expect(await repo.q.unseenPartnerPrs()).toEqual([]);
      const after = unwrap(await viewer.fetchByIds('pr_events', ids));
      for (const row of after) {
        const original = before.find((item) => item.id === row.id)!;
        expect(row.seen_by).toEqual([viewer.currentUserId()]);
        const claim = (value: typeof row) => Object.fromEntries(Object.entries(value).filter(([key]) => !['seen_by', 'updated_at', 'received_at'].includes(key)));
        expect(claim(row)).toEqual(claim(original));
      }
      unwrap(await repo.w.markPrEventsSeen(ids));
      expect(unwrap(await viewer.fetchByIds('pr_events', ids))).toEqual(after);
      await repo.sync.pullNow();
      expect(await repo.q.unseenPartnerPrs()).toEqual([]);
      expect(await db.outbox.count()).toBe(0);
      const crew = await repo.q.myCrew();
      unwrap(await viewer.leaveCrew(crew!.crew.id));
      await repo.sync.pullNow();
      expect(await repo.q.unseenPartnerPrs()).toEqual([]);
      mark.mockRestore();
    } finally {
      repo.close();
      await db.delete();
    }
  });
}
