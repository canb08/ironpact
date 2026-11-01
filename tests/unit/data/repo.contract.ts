import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Exercise, Session, SetRow } from '../../../src/core/types.ts';
import type { Remote, RemoteRow } from '../../../src/data/adapter.ts';
import { createClock } from '../../../src/data/clock.ts';
import { IronpactDB } from '../../../src/data/db.ts';
import { bodyweightId } from '../../../src/data/ids.ts';
import { enqueue } from '../../../src/data/outbox.ts';
import { createDataRepo } from '../../../src/data/repo.ts';
import { decorateRemote, deferred, fixtureId, ManualEnvironment, unwrap } from './harness.ts';

/** A7 can supply its authenticated, isolated Remote; this suite uses no mock-only hooks. */
export type RemoteFactory = (context: { now: () => number }) => Remote | Promise<Remote>;

export function runRepoContract(makeRemote: RemoteFactory) {
  describe('Repo contract (any Remote)', () => {
    let instant: number;
    let remote: Remote;
    let db: IronpactDB;
    let environment: ManualEnvironment;
    let repo: ReturnType<typeof createDataRepo>;
    const now = () => instant;
    const clock = () => createClock({ now, timezone: () => 'Europe/Amsterdam' });

    beforeEach(async () => {
      instant = Date.parse('2026-10-25T22:30:00.000Z');
      remote = await makeRemote({ now });
      expect(remote.currentUserId()).not.toBeNull();
      db = new IronpactDB(`ironpact-contract-${crypto.randomUUID()}`);
      environment = new ManualEnvironment();
      repo = createDataRepo(remote, { db, clock: clock(), environment, autoStart: false });
      await repo.ready;
    });

    afterEach(async () => {
      repo.close();
      expect(environment.timers.size).toBe(0);
      await db.delete();
      vi.restoreAllMocks();
    });

    async function gym(): Promise<{ session: Session; exercise: Exercise }> {
      const exercise = unwrap(await repo.w.createExercise({
        name: 'Contract lift', export_label: 'Contract lift', kind: 'lift',
        category: 'compound', lower_body: false,
      }));
      const session = unwrap(await repo.w.startSession({ kind: 'gym' }));
      return { session, exercise };
    }

    async function logSets(count: number): Promise<SetRow[]> {
      const { session, exercise } = await gym();
      const rows: SetRow[] = [];
      for (let i = 0; i < count; i++) {
        instant += 1000;
        rows.push(unwrap(await repo.w.logSet({
          session_id: session.id, exercise_id: exercise.id, reps: 5, weight_kg: 60,
        })));
      }
      return rows;
    }

    async function restart(usingRemote = remote) {
      repo.close();
      repo = createDataRepo(usingRemote, { db, clock: clock(), environment, autoStart: false });
      await repo.ready;
    }

    it('20 offline sets flush to exactly 20 server rows, with no duplicates', async () => {
      const rows = await logSets(20);
      expect(await db.sets.count()).toBe(20);
      expect(await repo.q.isPending(rows[0]!.id)).toBe(true);
      await repo.sync.flushNow();
      expect(unwrap(await remote.fetchByIds('sets', rows.map((row) => row.id)))).toHaveLength(0);
      environment.setOnline(true);
      await repo.sync.flushNow();
      const server = unwrap(await remote.fetchByIds('sets', rows.map((row) => row.id)));
      expect(server).toHaveLength(20);
      expect(new Set(server.map((row) => row.id)).size).toBe(20);
      expect(repo.sync.status().pendingCount).toBe(0);
      expect(await repo.q.isPending(rows[0]!.id)).toBe(false);
    });

    it('sending the same outbox payload twice leaves one server row', async () => {
      const [row] = await logSets(1);
      environment.setOnline(true);
      await repo.sync.flushNow();
      expect((await remote.upsert('sets', [{ ...row! }])).ok).toBe(true);
      expect((await remote.upsert('sets', [{ ...row! }])).ok).toBe(true);
      expect(unwrap(await remote.fetchByIds('sets', [row!.id]))).toHaveLength(1);
    });

    it('kill after a committed batch before its acknowledgement, then reopen and replay, preserves exactly 20 sets', async () => {
      const rows = await logSets(20);
      const committed = deferred<void>();
      const release = deferred<void>();
      const interrupted = decorateRemote(remote, {
        async upsert(table, payload) {
          const response = await remote.upsert(table, payload);
          if (table === 'sets' && response.ok) {
            committed.resolve();
            await release.promise;
          }
          return response;
        },
      });
      await restart(interrupted);
      environment.setOnline(true);
      const flushing = repo.sync.flushNow();
      await committed.promise;
      repo.close();
      release.resolve();
      await flushing;
      expect(await db.outbox.where('status').equals('pending').count()).toBeGreaterThan(0);
      // Reopen the physical IndexedDB database, rather than reusing an in-memory mirror.
      const databaseName = db.name;
      db.close();
      db = new IronpactDB(databaseName);
      environment.setOnline(false);
      await restart();
      expect(await repo.q.openSession()).toMatchObject({ id: rows[0]!.session_id });
      environment.setOnline(true);
      await repo.sync.flushNow();
      expect(unwrap(await remote.fetchByIds('sets', rows.map((row) => row.id)))).toHaveLength(20);
      expect(await db.outbox.count()).toBe(0);
    });

    it('5 edits of one offline set coalesce into 1 upsert with the final value', async () => {
      const [row] = await logSets(1);
      for (let reps = 6; reps <= 10; reps++) {
        instant += 1000;
        unwrap(await repo.w.updateSet(row!.id, { reps }));
      }
      const sent: RemoteRow[] = [];
      await restart(decorateRemote(remote, {
        async upsert(table, payload) {
          if (table === 'sets') sent.push(...payload);
          return remote.upsert(table, payload);
        },
      }));
      environment.setOnline(true);
      await repo.sync.flushNow();
      expect(sent).toHaveLength(1);
      expect(sent[0]).toMatchObject({ id: row!.id, reps: 10 });
    });

    for (const missingReturn of [false, true]) {
      it(`LWW older client_updated_at loses and the mirror converges via ${missingReturn ? 'fetchByIds when the acknowledgement omits it' : 'the returned server row'}`, async () => {
        const [row] = await logSets(1);
        environment.setOnline(true);
        await repo.sync.flushNow();
        const newer = { ...row!, reps: 12, client_updated_at: new Date(instant + 60_000).toISOString() };
        expect((await remote.upsert('sets', [newer])).ok).toBe(true);
        environment.setOnline(false);
        unwrap(await repo.w.updateSet(row!.id, { reps: 6 }));
        const fetched: string[] = [];
        await restart(decorateRemote(remote, {
          async upsert(table, payload) {
            const result = await remote.upsert(table, payload);
            return missingReturn && table === 'sets' && result.ok ? { ok: true, value: [] } : result;
          },
          async fetchByIds(table, ids) {
            fetched.push(...ids);
            return remote.fetchByIds(table, ids);
          },
        }));
        environment.setOnline(true);
        await repo.sync.flushNow();
        expect((await repo.q.setsOfSession(row!.session_id))[0]).toMatchObject({ reps: 12 });
        expect(await repo.q.isPending(row!.id)).toBe(false);
        if (missingReturn) expect(fetched).toContain(row!.id);
      });
    }

    it('one invalid row in a batch of 100 is bisected: 99 sync, 1 becomes dead, later writes continue', async () => {
      const rows = await logSets(100);
      const badId = rows[42]!.id;
      const batchSizes: number[] = [];
      await restart(decorateRemote(remote, {
        async upsert(table, payload) {
          if (table === 'sets') {
            batchSizes.push(payload.length);
            if (payload.some((row) => row.id === badId)) {
              return { ok: false, error: { kind: 'client', status: 422, message: 'invalid set' } };
            }
          }
          return remote.upsert(table, payload);
        },
      }));
      environment.setOnline(true);
      await repo.sync.flushNow();
      expect(batchSizes).toContain(100);
      expect(Math.max(...batchSizes)).toBeLessThanOrEqual(100);
      expect(unwrap(await remote.fetchByIds('sets', rows.map((row) => row.id)))).toHaveLength(99);
      expect(await repo.q.deadLetters()).toEqual([expect.objectContaining({ row_id: badId, table: 'sets', last_error: expect.stringContaining('invalid set') })]);
      instant += 1000;
      unwrap(await repo.w.updateSet(rows[0]!.id, { reps: 8 }));
      await repo.sync.flushNow();
      expect(unwrap(await remote.fetchByIds('sets', [rows[0]!.id]))[0]).toMatchObject({ reps: 8 });
      expect(repo.sync.status()).toMatchObject({ pendingCount: 0, deadCount: 1 });
    });

    it('keyset pull retains all 1005 rows sharing one updated_at across a 1000-row page boundary', async () => {
      const [template] = await logSets(1);
      const timestamp = '2026-10-25T22:40:00.000Z';
      const rows = Array.from({ length: 1005 }, (_, index) => ({
        ...template!, id: fixtureId(index + 1), set_index: index + 1, updated_at: timestamp,
      }));
      await db.outbox.clear();
      await db.sets.clear();
      const pages: { after: string | null; limit: number }[] = [];
      await restart(decorateRemote(remote, {
        async pullPage(table, after, limit) {
          if (table !== 'sets') return remote.pullPage(table, after, limit);
          pages.push({ after: after?.id ?? null, limit });
          return { ok: true, value: rows.filter((row) => !after || row.updated_at > after.updated_at || (row.updated_at === after.updated_at && row.id > after.id)).slice(0, limit) };
        },
      }));
      environment.setOnline(true);
      await repo.sync.pullNow();
      expect(await db.sets.count()).toBe(1005);
      expect(new Set((await repo.q.setsOfSession(template!.session_id)).map((row) => row.id)).size).toBe(1005);
      expect(pages).toEqual([{ after: null, limit: 1000 }, { after: fixtureId(1000), limit: 1000 }]);
      // A second pull overlaps the cursor and must remain idempotent.
      await repo.sync.pullNow();
      expect(await db.sets.count()).toBe(1005);
      expect(pages[2]).toEqual({ after: '', limit: 1000 });
    });

    it('23:30 Sunday 25 Oct 2026 Amsterdam session keeps its date for a 00:10 set after DST ends', async () => {
      const { session, exercise } = await gym();
      expect(session).toMatchObject({ tz: 'Europe/Amsterdam', local_date: '2026-10-25' });
      instant = Date.parse('2026-10-25T23:10:00.000Z');
      const row = unwrap(await repo.w.logSet({ session_id: session.id, exercise_id: exercise.id, reps: 5, weight_kg: 60 }));
      expect(row.local_date).toBe('2026-10-25');
      expect(row.logged_at).toBe('2026-10-25T23:10:00.000Z');
    });

    it('bodyweight twice in a day has the deterministic same id and only the later value', async () => {
      const first = unwrap(await repo.w.logBodyweight(80.2));
      instant += 60_000;
      const second = unwrap(await repo.w.logBodyweight(79.8));
      expect(second.id).toBe(first.id);
      expect(second.id).toBe(bodyweightId(remote.currentUserId()!, '2026-10-25'));
      expect(await db.bodyweight_entries.toArray()).toEqual([expect.objectContaining({ id: first.id, weight_kg: 79.8 })]);
      environment.setOnline(true);
      await repo.sync.flushNow();
      expect(unwrap(await remote.fetchByIds('bodyweight_entries', [first.id]))).toEqual([expect.objectContaining({ weight_kg: 79.8 })]);
    });

    it('reopening offline preserves the last measured clock offset for subsequent writes', async () => {
      environment.setOnline(true);
      await restart(decorateRemote(remote, {
        async serverNow() { return new Date(instant + 120_000).toISOString(); },
      }));
      const first = unwrap(await repo.w.logBodyweight(80));
      expect(first.client_updated_at).toBe(new Date(instant + 120_000).toISOString());
      environment.setOnline(false);
      const name = db.name;
      repo.close();
      db.close();
      db = new IronpactDB(name);
      instant += 1000;
      await restart();
      const second = unwrap(await repo.w.logBodyweight(81));
      expect(second.client_updated_at).toBe(new Date(instant + 120_000).toISOString());
      expect(second.id).toBe(first.id);
    });

    it('replaying an immutable composite-key outbox row acknowledges its canonical row instead of dead-lettering it', async () => {
      const { exercise } = await gym();
      const row = { exercise_id: exercise.id, muscle: 'chest', weight: 1 };
      await enqueue(db, [{ table: 'exercise_muscles', row }], new Date(instant).toISOString());
      environment.setOnline(true);
      await repo.sync.flushNow();
      expect(await repo.q.deadLetters()).toEqual([]);
      expect(await db.outbox.count()).toBe(0);
      await enqueue(db, [{ table: 'exercise_muscles', row }], new Date(instant).toISOString());
      await repo.sync.flushNow();
      expect(await repo.q.deadLetters()).toEqual([]);
      expect(await db.outbox.count()).toBe(0);
      expect(await db.mirror('exercise_muscles').get([exercise.id, 'chest'])).toMatchObject(row);
    });

    it('a pull never overwrites a pending local edit', async () => {
      const [row] = await logSets(1);
      environment.setOnline(true);
      await repo.sync.flushNow();
      environment.setOnline(false);
      instant += 1000;
      unwrap(await repo.w.updateSet(row!.id, { reps: 9 }));
      environment.setOnline(true);
      await repo.sync.pullNow();
      expect((await repo.q.setsOfSession(row!.session_id))[0]).toMatchObject({ reps: 9 });
      expect(await repo.q.isPending(row!.id)).toBe(true);
    });

    it('soft-deleting a set atomically queues its PR tombstones and hides the set', async () => {
      const [row] = await logSets(1);
      const pr = {
        id: fixtureId(9000), user_id: remote.currentUserId()!, source_id: row!.id,
        exercise_id: row!.exercise_id, pr_type: 'rep_max', reps: 5, value: 60,
        previous_value: 50, pct_over_previous: 20, seen_by: [], local_date: row!.local_date,
        client_updated_at: row!.client_updated_at, deleted_at: null,
      };
      await db.mirror('pr_events').put(pr);
      const put = db.outbox.put.bind(db.outbox);
      const failure = vi.spyOn(db.outbox, 'put').mockImplementation((entry, key) => {
        if (entry.table === 'pr_events') throw new DOMException('full', 'QuotaExceededError');
        return put(entry, key);
      });
      expect(await repo.w.softDelete('sets', row!.id)).toEqual({ ok: false, error: 'storage_full' });
      expect(await db.sets.get(row!.id)).toMatchObject({ deleted_at: null });
      expect(await db.mirror('pr_events').get(pr.id)).toMatchObject({ deleted_at: null });
      failure.mockRestore();
      unwrap(await repo.w.softDelete('sets', row!.id));
      expect(await repo.q.setsOfSession(row!.session_id)).toEqual([]);
      const tombstones = (await db.outbox.toArray()).filter((entry) => entry.row_id === row!.id || entry.row_id === pr.id);
      expect(tombstones).toHaveLength(2);
      expect(tombstones.every((entry) => entry.payload.deleted_at === new Date(instant).toISOString())).toBe(true);
    });

    it('a local edit during an in-flight acknowledgement survives and flushes its latest revision', async () => {
      const [row] = await logSets(1);
      const committed = deferred<void>();
      const release = deferred<void>();
      let gated = false;
      await restart(decorateRemote(remote, {
        async upsert(table, payload) {
          const response = await remote.upsert(table, payload);
          if (table === 'sets' && !gated) {
            gated = true;
            committed.resolve();
            await release.promise;
          }
          return response;
        },
      }));
      environment.setOnline(true);
      const flushing = repo.sync.flushNow();
      await committed.promise;
      instant += 1000;
      unwrap(await repo.w.updateSet(row!.id, { reps: 11 }));
      release.resolve();
      await flushing;
      expect((await repo.q.setsOfSession(row!.session_id))[0]).toMatchObject({ reps: 11 });
      await repo.sync.flushNow();
      expect(unwrap(await remote.fetchByIds('sets', [row!.id]))[0]).toMatchObject({ reps: 11 });
      expect(await repo.q.isPending(row!.id)).toBe(false);
    });

    it('a new session queued during an in-flight set flush syncs before its MIN child', async () => {
      const [row] = await logSets(1);
      const committed = deferred<void>();
      const release = deferred<void>();
      const order: { table: string; ids: (string | undefined)[] }[] = [];
      let gated = false;
      await restart(decorateRemote(remote, {
        async upsert(table, payload) {
          order.push({ table, ids: payload.map((item) => item.id) });
          const response = await remote.upsert(table, payload);
          if (table === 'sets' && !gated) {
            gated = true;
            committed.resolve();
            await release.promise;
          }
          return response;
        },
      }));
      environment.setOnline(true);
      const flushing = repo.sync.flushNow();
      await committed.promise;
      unwrap(await repo.w.finishSession(row!.session_id));
      const min = unwrap(await repo.w.logMin('20m walk'));
      release.resolve();
      await flushing;
      await repo.sync.flushNow();
      const parentIndex = order.findIndex((call) => call.table === 'sessions' && call.ids.includes(min.session_id));
      const childIndex = order.findIndex((call) => call.table === 'min_entries' && call.ids.includes(min.id));
      expect(parentIndex).toBeGreaterThanOrEqual(0);
      expect(childIndex).toBeGreaterThan(parentIndex);
      expect(await repo.q.deadLetters()).toEqual([]);
      expect(unwrap(await remote.fetchByIds('min_entries', [min.id]))).toHaveLength(1);
    });

    it('sign-out clears private mirrors and pending writes, including a late network acknowledgement', async () => {
      const rows = await logSets(1);
      const committed = deferred<void>();
      const release = deferred<void>();
      await restart(decorateRemote(remote, {
        async upsert(table, payload) {
          const response = await remote.upsert(table, payload);
          if (table === 'sets') { committed.resolve(); await release.promise; }
          return response;
        },
      }));
      environment.setOnline(true);
      const flushing = repo.sync.flushNow();
      await committed.promise;
      await repo.auth.signOut();
      release.resolve();
      await flushing;
      expect(repo.auth.userId()).toBeNull();
      expect(await repo.q.session(rows[0]!.session_id)).toBeUndefined();
      expect(await db.sets.count()).toBe(0);
      expect(await db.outbox.count()).toBe(0);
      expect(await db.profiles.count()).toBe(0);
    });

    it('quota failure rolls back mirror and outbox together and returns storage_full', async () => {
      const { session, exercise } = await gym();
      const before = await db.outbox.count();
      vi.spyOn(db.outbox, 'put').mockRejectedValueOnce(new DOMException('full', 'QuotaExceededError'));
      expect(await repo.w.logSet({ session_id: session.id, exercise_id: exercise.id, reps: 5, weight_kg: 60 })).toEqual({ ok: false, error: 'storage_full' });
      expect(await repo.q.setsOfSession(session.id)).toEqual([]);
      expect(await db.outbox.count()).toBe(before);
    });
  });
}
