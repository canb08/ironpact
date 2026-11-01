import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMockRemote, MOCK_USER_IDS } from '../../../src/data/adapter.mock.ts';
import { createClock } from '../../../src/data/clock.ts';
import { IronpactDB } from '../../../src/data/db.ts';
import { enqueue } from '../../../src/data/outbox.ts';
import { SyncEngine } from '../../../src/data/sync.ts';
import { decorateRemote, deferred, fixtureId, ManualEnvironment, unwrap } from './harness.ts';

describe('sync scheduling and recovery', () => {
  let time: number;
  let db: IronpactDB;
  let environment: ManualEnvironment;
  let remote: ReturnType<typeof createMockRemote>;
  let engine: SyncEngine;
  const now = () => time;
  const iso = () => new Date(time).toISOString();
  const clock = () => createClock({ now, timezone: () => 'Europe/Amsterdam' });
  const weight = (id = fixtureId(1)) => ({
    id, user_id: MOCK_USER_IDS.alice, local_date: '2026-10-25',
    client_updated_at: iso(), deleted_at: null, measured_at: iso(), weight_kg: 80,
  });

  beforeEach(() => {
    time = Date.parse('2026-10-25T12:00:00.000Z');
    db = new IronpactDB(`ironpact-sync-${crypto.randomUUID()}`);
    environment = new ManualEnvironment();
    remote = createMockRemote({ now });
    engine = new SyncEngine(db, remote, clock(), environment);
  });

  afterEach(async () => {
    engine.close();
    expect(environment.timers.size).toBe(0);
    await db.delete();
  });

  it('transient errors retain writes, back off 2/4/8/16/32/60 seconds, enter server_asleep after 3, then recover', async () => {
    await enqueue(db, [{ table: 'bodyweight_entries', row: weight() }], iso());
    remote.failNext(6, 'transient');
    const states: string[] = [];
    engine.onStatus((status) => states.push(status.state));
    environment.setOnline(true);
    engine.start();
    await engine.flushNow();
    for (const [index, delay] of [2000, 4000, 8000, 16000, 32000, 60000].entries()) {
      expect(engine.status()).toMatchObject({ pendingCount: 1, deadCount: 0 });
      expect(engine.status().state).toBe(index >= 2 ? 'server_asleep' : 'idle');
      const retry = [...environment.timers.entries()].find(([, timer]) => timer.delay !== 30_000);
      expect(retry?.[1].delay).toBe(delay);
      expect(unwrap(await remote.fetchByIds('bodyweight_entries', [fixtureId(1)]))).toEqual([]);
      environment.timers.delete(retry![0]);
      time += delay;
      retry![1].callback();
      expect(engine.status().state).toBe('flushing');
      await engine.flushNow();
    }
    expect(states).toContain('server_asleep');
    expect(engine.status()).toMatchObject({ state: 'idle', pendingCount: 0, deadCount: 0 });
    expect(unwrap(await remote.fetchByIds('bodyweight_entries', [fixtureId(1)]))).toHaveLength(1);
  });

  it('concurrent flush requests share one flight and send a pending row once', async () => {
    const entered = deferred<void>();
    const release = deferred<void>();
    let sends = 0;
    engine.close();
    engine = new SyncEngine(db, decorateRemote(remote, {
      async upsert(table, rows) {
        sends++;
        entered.resolve();
        await release.promise;
        return remote.upsert(table, rows);
      },
    }), clock(), environment);
    await enqueue(db, [{ table: 'bodyweight_entries', row: weight() }], iso());
    environment.setOnline(true);
    const first = engine.flushNow();
    await entered.promise;
    const second = engine.flushNow();
    expect(second).toBe(first);
    release.resolve();
    await Promise.all([first, second, engine.flushNow()]);
    expect(sends).toBe(1);
    expect(await db.outbox.count()).toBe(0);
  });

  it('a missing acknowledgement plus an empty fetch retains the payload for retry', async () => {
    engine.close();
    engine = new SyncEngine(db, decorateRemote(remote, {
      async upsert() { return { ok: true, value: [] }; },
      async fetchByIds() { return { ok: true, value: [] }; },
    }), clock(), environment);
    const row = weight();
    await enqueue(db, [{ table: 'bodyweight_entries', row }], iso());
    environment.setOnline(true);
    await engine.flushNow();
    expect(engine.status()).toMatchObject({ pendingCount: 1, deadCount: 0 });
    expect(await db.bodyweight_entries.get(row.id)).toEqual(row);
    expect(await db.outbox.toArray()).toEqual([expect.objectContaining({ status: 'pending', payload: row })]);
  });

  it('two controllers opening the same database share the flight and send each outbox row once', async () => {
    const entered = deferred<void>();
    const release = deferred<void>();
    let sends = 0;
    const network = decorateRemote(remote, {
      async upsert(table, rows) {
        sends++;
        entered.resolve();
        await release.promise;
        return remote.upsert(table, rows);
      },
    });
    engine.close();
    engine = new SyncEngine(db, network, clock(), environment);
    const secondDb = new IronpactDB(db.name);
    const secondEngine = new SyncEngine(secondDb, network, clock(), environment);
    environment.setOnline(true);
    await Promise.all([engine.calibrate(), secondEngine.calibrate()]);
    await enqueue(db, [{ table: 'bodyweight_entries', row: weight() }], iso());
    const first = engine.flushNow();
    await entered.promise;
    const second = secondEngine.flushNow();
    try {
      // These IDB transactions form a deterministic barrier for an unguarded second queue read.
      await Promise.resolve();
      await secondDb.outbox.count();
      await secondDb.outbox.count();
      expect(sends).toBe(1);
    } finally {
      release.resolve();
      await Promise.all([first, second]);
      secondEngine.close();
      secondDb.close();
    }
    expect(sends).toBe(1);
    expect(await db.outbox.count()).toBe(0);
  });

  it('independent database names can flush concurrently', async () => {
    const entered = deferred<void>();
    const secondEntered = deferred<void>();
    const release = deferred<void>();
    let sends = 0;
    const network = decorateRemote(remote, {
      async upsert(table, rows) {
        sends++;
        if (sends === 1) { entered.resolve(); await release.promise; }
        else secondEntered.resolve();
        return remote.upsert(table, rows);
      },
    });
    engine.close();
    engine = new SyncEngine(db, network, clock(), environment);
    const secondDb = new IronpactDB(`ironpact-independent-${crypto.randomUUID()}`);
    const secondEngine = new SyncEngine(secondDb, network, clock(), environment);
    environment.setOnline(true);
    await enqueue(db, [{ table: 'bodyweight_entries', row: weight() }], iso());
    await enqueue(secondDb, [{ table: 'bodyweight_entries', row: { ...weight(fixtureId(2)), local_date: '2026-10-26' } }], iso());
    const first = engine.flushNow();
    await entered.promise;
    const second = secondEngine.flushNow();
    try {
      await secondEntered.promise;
      expect(sends).toBe(2);
    } finally {
      release.resolve();
      await Promise.all([first, second]);
      secondEngine.close();
      await secondDb.delete();
    }
    expect(await db.outbox.count()).toBe(0);
  });

  it('online, visible, periodic foreground, and after-write triggers all flush; hidden periodic ticks wait for visibility', async () => {
    engine.start();
    await enqueue(db, [{ table: 'bodyweight_entries', row: weight() }], iso());
    environment.setOnline(true);
    expect(engine.status().state).toBe('flushing');
    await engine.flushNow();
    expect(await db.outbox.count()).toBe(0);

    // Enqueue directly here to isolate each trigger from afterWrite().
    await enqueue(db, [{ table: 'bodyweight_entries', row: { ...weight(), weight_kg: 81 } }], iso());
    environment.setVisible(false);
    const tick = [...environment.timers.entries()].find(([, timer]) => timer.delay === 30_000)!;
    environment.timers.delete(tick[0]);
    tick[1].callback();
    expect(engine.status().state).toBe('idle');
    expect(await db.outbox.count()).toBe(1);
    environment.setVisible(true);
    expect(engine.status().state).toBe('flushing');
    await engine.flushNow();
    expect(await db.outbox.count()).toBe(0);

    await enqueue(db, [{ table: 'bodyweight_entries', row: { ...weight(), weight_kg: 82 } }], iso());
    const foregroundTick = [...environment.timers.entries()].find(([, timer]) => timer.delay === 30_000)!;
    environment.timers.delete(foregroundTick[0]);
    foregroundTick[1].callback();
    expect(engine.status().state).toBe('flushing');
    await engine.flushNow();
    expect(await db.outbox.count()).toBe(0);

    await enqueue(db, [{ table: 'bodyweight_entries', row: { ...weight(), weight_kg: 83 } }], iso());
    engine.afterWrite();
    expect(engine.status().state).toBe('flushing');
    await engine.flushNow();
    expect(unwrap(await remote.fetchByIds('bodyweight_entries', [fixtureId(1)]))[0]).toMatchObject({ weight_kg: 83 });
    expect(await db.outbox.count()).toBe(0);
  });
});
