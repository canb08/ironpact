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
      await repo.sync.pullNow();
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

    it('sign-out keeps local rows, and a late acknowledgement cannot drop the pending outbox', async () => {
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
      expect(await db.sets.get(rows[0]!.id)).toBeDefined();
      expect(await db.outbox.where('row_id').equals(rows[0]!.id).count()).toBe(1);
    });

    it('20 offline sets survive a null user at startup and flush once alice returns', async () => {
      const rows = await logSets(20);
      const alice = remote.currentUserId();
      expect(alice).not.toBeNull();
      repo.close();
      let reported: string | null = null;
      const listeners = new Set<(user: string | null) => void>();
      const startup = decorateRemote(remote, {
        currentUserId: () => reported,
        onAuthChange(cb) {
          listeners.add(cb);
          const unsubscribe = remote.onAuthChange(cb);
          return () => { listeners.delete(cb); unsubscribe(); };
        },
      });
      environment.setOnline(false);
      repo = createDataRepo(startup, { db, clock: clock(), environment, autoStart: false });
      await repo.ready;
      expect(repo.auth.userId()).toBeNull();
      expect(await db.sets.count()).toBe(20);
      expect(await db.outbox.where('status').equals('pending').count()).toBeGreaterThanOrEqual(20);
      reported = alice;
      for (const listener of listeners) listener(alice);
      environment.setOnline(true);
      await repo.sync.flushNow();
      const server = unwrap(await remote.fetchByIds('sets', rows.map((row) => row.id)));
      expect(server).toHaveLength(20);
      expect(new Set(server.map((row) => row.id)).size).toBe(20);
      expect(repo.sync.status().pendingCount).toBe(0);
    });

    it('a hung serverNow and pullPage still let logSet resolve within 100ms into the outbox', async () => {
      const { session, exercise } = await gym();
      repo.close();
      environment.setOnline(true);
      const hung = decorateRemote(remote, {
        serverNow: () => new Promise<string>(() => {}),
        pullPage: () => new Promise(() => {}),
      });
      repo = createDataRepo(hung, { db, clock: clock(), environment, autoStart: false });
      await repo.ready;
      const started = Date.now();
      const row = unwrap(await repo.w.logSet({
        session_id: session.id, exercise_id: exercise.id, reps: 5, weight_kg: 60,
      }));
      expect(Date.now() - started).toBeLessThan(100);
      expect(await db.outbox.where('row_id').equals(row.id).count()).toBe(1);
    });

    it('quota failure rolls back mirror and outbox together and returns storage_full', async () => {
      const { session, exercise } = await gym();
      const before = await db.outbox.count();
      vi.spyOn(db.outbox, 'put').mockRejectedValueOnce(new DOMException('full', 'QuotaExceededError'));
      expect(await repo.w.logSet({ session_id: session.id, exercise_id: exercise.id, reps: 5, weight_kg: 60 })).toEqual({ ok: false, error: 'storage_full' });
      expect(await repo.q.setsOfSession(session.id)).toEqual([]);
      expect(await db.outbox.count()).toBe(before);
    });

    it('P2A exerciseHistory is newest-first for that exercise and drops a deleted set', async () => {
      const { session, exercise } = await gym();
      const other = unwrap(await repo.w.createExercise({
        name: 'Other lift', export_label: 'Other lift', kind: 'lift', category: 'isolation', lower_body: false,
      }));
      instant += 1000;
      const first = unwrap(await repo.w.logSet({ session_id: session.id, exercise_id: exercise.id, reps: 5, weight_kg: 60 }));
      instant += 1000;
      const second = unwrap(await repo.w.logSet({ session_id: session.id, exercise_id: exercise.id, reps: 3, weight_kg: 70 }));
      unwrap(await repo.w.logSet({ session_id: session.id, exercise_id: other.id, reps: 8, weight_kg: 20 }));
      unwrap(await repo.w.finishSession(session.id));
      instant += 1000;
      const later = unwrap(await repo.w.startSession({ kind: 'gym' }));
      instant += 1000;
      const laterSet = unwrap(await repo.w.logSet({ session_id: later.id, exercise_id: exercise.id, reps: 5, weight_kg: 80 }));
      unwrap(await repo.w.finishSession(later.id));
      expect((await repo.q.exerciseHistory(exercise.id, 1)).map((row) => row.session.id)).toEqual([later.id]);
      const history = await repo.q.exerciseHistory(exercise.id, 10);
      expect(history.map((row) => row.session.id)).toEqual([later.id, session.id]);
      expect(history[0]!.sets.map((row) => row.id)).toEqual([laterSet.id]);
      expect(history[1]!.sets.map((row) => row.id)).toEqual([first.id, second.id]);
      expect(await repo.q.exerciseHistory(other.id, 10)).toHaveLength(1);
      expect(await repo.q.exerciseHistory(exercise.id, 0)).toEqual([]);
      unwrap(await repo.w.softDelete('sets', laterSet.id));
      expect((await repo.q.exerciseHistory(exercise.id, 10)).map((row) => row.session.id)).toEqual([session.id]);
    });

    it('P2A recentSessionsWithSets is the last finished gym sessions with ordered sets', async () => {
      const run = unwrap(await repo.w.logRun({ distance_m: 1000, duration_s: 400 }));
      const { session, exercise } = await gym();
      instant += 1000;
      unwrap(await repo.w.logSet({ session_id: session.id, exercise_id: exercise.id, reps: 5, weight_kg: 40 }));
      instant += 1000;
      unwrap(await repo.w.logSet({ session_id: session.id, exercise_id: exercise.id, reps: 5, weight_kg: 50 }));
      expect(await repo.q.recentSessionsWithSets(5)).toEqual([]);
      unwrap(await repo.w.finishSession(session.id));
      instant += 1000;
      const second = unwrap(await repo.w.startSession({ kind: 'gym' }));
      instant += 1000;
      const only = unwrap(await repo.w.logSet({ session_id: second.id, exercise_id: exercise.id, reps: 4, weight_kg: 55 }));
      unwrap(await repo.w.finishSession(second.id));
      expect((await repo.q.recentSessionsWithSets(1)).map((row) => row.session.id)).toEqual([second.id]);
      const recent = await repo.q.recentSessionsWithSets(5);
      expect(recent.map((row) => row.session.id)).toEqual([second.id, session.id]);
      expect(recent[0]!.sets.map((row) => row.id)).toEqual([only.id]);
      expect(recent[1]!.sets.map((row) => row.set_index)).toEqual([1, 2]);
      expect(recent.every((row) => row.session.kind === 'gym' && row.session.ended_at !== null)).toBe(true);
      expect(recent.some((row) => row.session.id === run.session_id)).toBe(false);
    });

    it('P2A recordPrEvents is one batch, and deleting the set tombstones those events in one batch', async () => {
      const { session, exercise } = await gym();
      instant += 1000;
      const set = unwrap(await repo.w.logSet({ session_id: session.id, exercise_id: exercise.id, reps: 5, weight_kg: 60 }));
      const draft = {
        exercise_id: exercise.id, source_id: set.id, pr_type: 'e1rm' as const, reps: 5, value: 70,
        previous_value: 60, pct_over_previous: 16.6667, user_id: remote.currentUserId()!, local_date: set.local_date,
        display: 'takeover', bucket_label: 'ignored',
      };
      expect(await repo.w.recordPrEvents([])).toEqual({ ok: true, value: [] });
      expect(await repo.w.recordPrEvents([{ ...draft, user_id: '00000000-0000-4000-8000-000000000099' }])).toEqual({ ok: false, error: 'world_record' });
      const before = await db.outbox.count();
      const recorded = unwrap(await repo.w.recordPrEvents([draft]));
      expect(recorded).toHaveLength(1);
      expect(recorded[0]).toMatchObject({ pr_type: 'e1rm', source_id: set.id, seen_by: [], exercise_id: exercise.id });
      expect(recorded[0]).not.toHaveProperty('display');
      expect(await db.outbox.count()).toBe(before + 1);
      const queued = await db.outbox.where('row_id').equals(recorded[0]!.id).toArray();
      expect(queued).toHaveLength(1);
      expect(queued[0]!.payload).not.toHaveProperty('display');
      expect(queued[0]!.payload).not.toHaveProperty('bucket_label');
      expect(await repo.q.prEvents({})).toEqual([expect.objectContaining({ id: recorded[0]!.id })]);
      expect(await repo.q.prEvents({ exerciseId: exercise.id, sessionId: session.id, since: set.local_date })).toHaveLength(1);
      expect(await repo.q.prEvents({ since: '2026-10-26' })).toEqual([]);
      expect(await repo.q.prEvents({ exerciseId: fixtureId(1) })).toEqual([]);
      // Tombstones are for acknowledged claims. Offline-only claims are dropped.
      environment.setOnline(true);
      await repo.sync.flushNow();
      expect(await repo.q.deadLetters()).toEqual([]);
      environment.setOnline(false);
      const puts: string[] = [];
      const put = db.outbox.put.bind(db.outbox);
      const failure = vi.spyOn(db.outbox, 'put').mockImplementation((entry, key) => {
        puts.push(entry.table);
        if (puts.length === 2) throw new DOMException('full', 'QuotaExceededError');
        return put(entry, key);
      });
      expect(await repo.w.softDelete('sets', set.id)).toEqual({ ok: false, error: 'storage_full' });
      failure.mockRestore();
      expect(puts).toEqual(['sets', 'pr_events']);
      expect(await repo.q.prEvents({})).toHaveLength(1);
      expect(await db.sets.get(set.id)).toMatchObject({ deleted_at: null });
      unwrap(await repo.w.softDelete('sets', set.id));
      expect(await repo.q.prEvents({})).toEqual([]);
      expect(await repo.q.setsOfSession(session.id)).toEqual([]);
      const tombstones = (await db.outbox.toArray()).filter((entry) => entry.payload.deleted_at && (entry.row_id === set.id || entry.row_id === recorded[0]!.id));
      expect(tombstones).toHaveLength(2);
      expect(new Set(tombstones.map((entry) => entry.payload.deleted_at)).size).toBe(1);
    });

    it('P2A setExercisePref remembers rest seconds on one row and does not write big jumps', async () => {
      const { exercise } = await gym();
      expect(await repo.q.exercisePref(exercise.id)).toBeUndefined();
      expect(await repo.w.setExercisePref(exercise.id, { rest_s: 10 })).toEqual({ ok: false, error: 'world_record' });
      expect(await repo.w.setExercisePref(fixtureId(2), { rest_s: 90 })).toEqual({ ok: false, error: 'world_record' });
      const first = unwrap(await repo.w.setExercisePref(exercise.id, { rest_s: 90 }));
      instant += 1000;
      const second = unwrap(await repo.w.setExercisePref(exercise.id, { rest_s: 150 }));
      expect(second.id).toBe(first.id);
      expect(await repo.q.exercisePref(exercise.id)).toMatchObject({ id: first.id, rest_s: 150, exercise_id: exercise.id });
      expect(await db.mirror('exercise_prefs').count()).toBe(1);
      expect((await db.outbox.toArray()).some((entry) => entry.table === 'profiles')).toBe(false);
      environment.setOnline(true);
      await repo.sync.flushNow();
      expect(await repo.q.deadLetters()).toEqual([]);
      expect(unwrap(await remote.fetchByIds('exercise_prefs', [first.id]))).toEqual([expect.objectContaining({ rest_s: 150 })]);
    });

    it('P2A moving a session date moves live and tombstoned children without bumping their timestamps', async () => {
      const { session, exercise } = await gym();
      instant += 1000;
      const live = unwrap(await repo.w.logSet({ session_id: session.id, exercise_id: exercise.id, reps: 5, weight_kg: 60 }));
      instant += 1000;
      const dead = unwrap(await repo.w.logSet({ session_id: session.id, exercise_id: exercise.id, reps: 3, weight_kg: 80 }));
      unwrap(await repo.w.softDelete('sets', dead.id));
      const tombstone = await db.sets.get(dead.id);
      const liveStamp = live.client_updated_at;
      instant += 60_000;
      unwrap(await repo.w.updateSession(session.id, { note: 'felt strong', readiness: { sleep: 2, soreness: 2, energy: 3 } }));
      expect(await db.sets.get(live.id)).toMatchObject({ local_date: live.local_date, client_updated_at: liveStamp });
      expect(await repo.w.updateSession(session.id, { note: 'x'.repeat(201) })).toEqual({ ok: false, error: 'world_record' });
      const moved = unwrap(await repo.w.updateSession(session.id, { local_date: '2026-10-24' }));
      expect(moved).toMatchObject({ local_date: '2026-10-24', note: 'felt strong' });
      expect(await db.sets.get(live.id)).toMatchObject({ local_date: '2026-10-24', client_updated_at: liveStamp, deleted_at: null });
      expect(await db.sets.get(dead.id)).toMatchObject({
        local_date: '2026-10-24', client_updated_at: tombstone!.client_updated_at, deleted_at: tombstone!.deleted_at,
      });
      expect((await repo.q.day('2026-10-25')).sets).toEqual([]);
      expect((await repo.q.day('2026-10-24')).sets.map((row) => row.id)).toEqual([live.id]);
      expect((await repo.q.day('2026-10-24')).sessions.map((row) => row.id)).toContain(session.id);
      environment.setOnline(true);
      await repo.sync.flushNow();
      expect(await repo.q.deadLetters()).toEqual([]);
      const serverLive = unwrap(await remote.fetchByIds('sets', [live.id]))[0];
      const serverDead = unwrap(await remote.fetchByIds('sets', [dead.id]))[0];
      expect(serverLive).toMatchObject({ local_date: '2026-10-24' });
      expect(serverDead).toMatchObject({ local_date: '2026-10-24' });
      expect(Date.parse(String(serverDead?.deleted_at))).toBe(Date.parse(String(tombstone!.deleted_at)));
    });

    it('P2A updateEntry edits a run, martial, MIN and moves a bodyweight onto its new date', async () => {
      const run = unwrap(await repo.w.logRun({ distance_m: 2000, duration_s: 600, note: 'easy' }));
      const martial = unwrap(await repo.w.logMartial({ discipline: 'BJJ', duration_min: 60 }));
      const min = unwrap(await repo.w.logMin('20m walk'));
      const weight = unwrap(await repo.w.logBodyweight(80));
      instant += 1000;
      expect(await repo.w.updateEntry('cardio_entries', run.id, { distance_m: 50 })).toEqual({ ok: false, error: 'world_record' });
      const edited = unwrap(await repo.w.updateEntry('cardio_entries', run.id, { distance_m: 2100, local_date: '2026-10-23' }));
      expect(edited).toMatchObject({ distance_m: 2100, local_date: '2026-10-23' });
      expect(await repo.q.session(run.session_id)).toMatchObject({ local_date: '2026-10-23' });
      expect((await repo.q.day('2026-10-25')).cardio).toEqual([]);
      expect((await repo.q.day('2026-10-23')).cardio.map((row) => row.id)).toEqual([run.id]);
      expect(unwrap(await repo.w.updateEntry('martial_entries', martial.id, { rounds: 5, note: 'drilled' }))).toMatchObject({ rounds: 5, note: 'drilled' });
      expect(unwrap(await repo.w.updateEntry('min_entries', min.id, { description: '30m walk' }))).toMatchObject({ description: '30m walk' });
      const moved = unwrap(await repo.w.updateEntry('bodyweight_entries', weight.id, { local_date: '2026-10-26', weight_kg: 80.5 }));
      expect(moved.id).toBe(bodyweightId(remote.currentUserId()!, '2026-10-26'));
      expect(moved.id).not.toBe(weight.id);
      expect(await db.bodyweight_entries.get(weight.id)).toMatchObject({ deleted_at: expect.any(String) });
      expect((await repo.q.day('2026-10-25')).bodyweight).toEqual([]);
      expect((await repo.q.day('2026-10-26')).bodyweight).toEqual([expect.objectContaining({ id: moved.id, weight_kg: 80.5 })]);
      const day = await repo.q.day('2026-10-25');
      expect(day.martial.map((row) => row.id)).toEqual([martial.id]);
      expect(day.min.map((row) => row.id)).toEqual([min.id]);
      environment.setOnline(true);
      await repo.sync.flushNow();
      expect(await repo.q.deadLetters()).toEqual([]);
      expect(unwrap(await remote.fetchByIds('cardio_entries', [run.id]))[0]).toMatchObject({ distance_m: 2100, local_date: '2026-10-23' });
      expect(unwrap(await remote.fetchByIds('bodyweight_entries', [moved.id]))[0]).toMatchObject({ weight_kg: 80.5, local_date: '2026-10-26' });
    });

    async function twoSessions(exerciseId: string, sessionId: string) {
      instant += 1000;
      unwrap(await repo.w.logSet({ session_id: sessionId, exercise_id: exerciseId, reps: 5, weight_kg: 80 }));
      unwrap(await repo.w.finishSession(sessionId));
      instant += 86_400_000;
      const later = unwrap(await repo.w.startSession({ kind: 'gym' }));
      instant += 1000;
      const best = unwrap(await repo.w.logSet({ session_id: later.id, exercise_id: exerciseId, reps: 5, weight_kg: 100 }));
      instant += 1000;
      const next = unwrap(await repo.w.logSet({ session_id: later.id, exercise_id: exerciseId, reps: 5, weight_kg: 90 }));
      unwrap(await repo.w.finishSession(later.id));
      return { best, next };
    }

    it('P5F editing an unacknowledged PR set down drops its claim and promotes the next set', async () => {
      const { session, exercise } = await gym();
      const { best, next } = await twoSessions(exercise.id, session.id);
      const first = unwrap(await repo.w.recomputePrs(exercise.id));
      expect(first.changed).toBe(true);
      const standing = await repo.q.prEvents({ exerciseId: exercise.id });
      const champion = standing.find((row) => row.pr_type === 'e1rm');
      expect(champion?.source_id).toBe(best.id);
      expect(unwrap(await repo.w.recomputePrs(exercise.id)).changed).toBe(false);
      instant += 1000;
      const quiet = await repo.w.updateSet(next.id, { note: 'steady' });
      expect(quiet.ok && quiet.notice).toEqual({ prsChanged: false, barAdjusted: false });
      instant += 1000;
      const edited = await repo.w.updateSet(best.id, { weight_kg: 70 });
      expect(edited.ok && edited.notice).toEqual({ prsChanged: true, barAdjusted: false });
      const stamp = (await db.sets.get(best.id))?.client_updated_at;
      expect(await db.mirror('pr_events').get(champion!.id)).toBeUndefined();
      expect(await repo.q.isPending(champion!.id)).toBe(false);
      const live = await repo.q.prEvents({ exerciseId: exercise.id });
      const promoted = live.find((row) => row.pr_type === 'e1rm');
      expect(promoted?.source_id).toBe(next.id);
      expect(promoted?.client_updated_at).toBe(stamp);
      expect(live.some((row) => row.source_id === best.id)).toBe(false);
      expect(unwrap(await repo.w.recomputePrs(exercise.id)).changed).toBe(false);
      environment.setOnline(true);
      await repo.sync.flushNow();
      expect(await repo.q.deadLetters()).toEqual([]);
      const server = unwrap(await remote.fetchByIds('pr_events', [champion!.id, promoted!.id]));
      expect(server.find((row) => row.id === champion!.id)).toBeUndefined();
      expect(server.find((row) => row.id === promoted!.id)).toMatchObject({ source_id: next.id, pr_type: 'e1rm', deleted_at: null });
    });

    it('P5F editing an acknowledged PR preserves its claim and queues only deleted_at', async () => {
      const { session, exercise } = await gym();
      const { best, next } = await twoSessions(exercise.id, session.id);
      unwrap(await repo.w.recomputePrs(exercise.id));
      environment.setOnline(true);
      await repo.sync.flushNow();
      await repo.sync.pullNow();
      expect(await repo.q.deadLetters()).toEqual([]);
      environment.setOnline(false);
      const champion = (await repo.q.prEvents({ exerciseId: exercise.id })).find((row) => row.pr_type === 'e1rm')!;
      const acknowledged = await db.mirror('pr_events').get(champion.id);
      expect(acknowledged?.updated_at).toEqual(expect.any(String));
      instant += 1000;
      const edited = await repo.w.updateSet(best.id, { weight_kg: 70 });
      expect(edited.ok && edited.notice?.prsChanged).toBe(true);
      const tombstone = { ...acknowledged, deleted_at: new Date(instant).toISOString() };
      expect(await db.mirror('pr_events').get(champion.id)).toEqual(tombstone);
      expect((await db.outbox.where('row_id').equals(champion.id).first())?.payload).toEqual(tombstone);
      const promoted = (await repo.q.prEvents({ exerciseId: exercise.id })).find((row) => row.pr_type === 'e1rm')!;
      expect(promoted.source_id).toBe(next.id);
      environment.setOnline(true);
      await repo.sync.flushNow();
      expect(await repo.q.deadLetters()).toEqual([]);
      const server = unwrap(await remote.fetchByIds('pr_events', [champion.id, promoted.id]));
      expect(Date.parse(String(server.find((row) => row.id === champion.id)?.deleted_at))).toBe(instant);
      expect(server.find((row) => row.id === promoted.id)).toMatchObject({ source_id: next.id, deleted_at: null });
    });

    it('P5F rolls back dropping pending claims if the edited source cannot be queued', async () => {
      const { session, exercise } = await gym();
      const { best } = await twoSessions(exercise.id, session.id);
      unwrap(await repo.w.recomputePrs(exercise.id));
      const claims = await db.mirror('pr_events').toArray();
      const queue = await db.outbox.toArray();
      const failure = vi.spyOn(db.outbox, 'put').mockRejectedValue(new DOMException('full', 'QuotaExceededError'));
      expect(await repo.w.updateSet(best.id, { weight_kg: 70 })).toEqual({ ok: false, error: 'storage_full' });
      failure.mockRestore();
      expect(await db.mirror('pr_events').toArray()).toEqual(claims);
      expect(await db.outbox.toArray()).toEqual(queue);
      expect(await db.sets.get(best.id)).toEqual(best);
    });

    it('P5F deleting the PR set promotes the next set, and a shorter run drops its distance PR', async () => {
      const { session, exercise } = await gym();
      const { best, next } = await twoSessions(exercise.id, session.id);
      unwrap(await repo.w.recomputePrs(exercise.id));
      instant += 1000;
      const removed = await repo.w.softDelete('sets', best.id);
      expect(removed.ok && removed.notice?.prsChanged).toBe(true);
      expect((await repo.q.prEvents({ exerciseId: exercise.id })).find((row) => row.pr_type === 'e1rm')?.source_id).toBe(next.id);
      const early = unwrap(await repo.w.logRun({ distance_m: 5000, duration_s: 1500 }));
      instant += 86_400_000;
      const longer = unwrap(await repo.w.logRun({ distance_m: 8000, duration_s: 2400 }));
      expect(unwrap(await repo.w.recomputePrs(null)).changed).toBe(true);
      const distance = (await repo.q.prEvents({})).find((row) => row.pr_type === 'distance');
      expect(distance?.source_id).toBe(longer.id);
      instant += 1000;
      const shortened = await repo.w.updateEntry('cardio_entries', longer.id, { distance_m: 4000 });
      expect(shortened.ok && shortened.notice).toMatchObject({ prsChanged: true, barAdjusted: false });
      expect((await repo.q.prEvents({})).some((row) => row.pr_type === 'distance' && row.source_id === early.id)).toBe(false);
      expect((await repo.q.prEvents({})).some((row) => row.pr_type === 'distance')).toBe(false);
      expect(await db.mirror('pr_events').get(distance!.id)).toBeUndefined();
      expect(await repo.q.isPending(distance!.id)).toBe(false);
      environment.setOnline(true);
      await repo.sync.flushNow();
      expect(await repo.q.deadLetters()).toEqual([]);
    });

    it('P2A contract case count on this backend', () => {
      const methods = [
        'exerciseHistory', 'recentSessionsWithSets', 'prEvents', 'exercisePref', 'day',
        'recordPrEvents', 'recomputePrs', 'setExercisePref', 'updateSession', 'updateEntry',
      ] as const;
      console.log(`P2A ${remote.kind}: ${methods.length} methods, 6 contract cases`);
      expect(methods.every((method) => method in repo.q || method in repo.w)).toBe(true);
    });
  });
}
