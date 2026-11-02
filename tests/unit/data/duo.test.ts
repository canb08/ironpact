import { afterEach, describe, expect, it, vi } from 'vitest';
import { liveQuery } from 'dexie';
import { createMockRemote, MOCK_CREW_ID, MOCK_EXERCISE_ID, MOCK_USER_IDS } from '../../../src/data/adapter.mock.ts';
import { createClock } from '../../../src/data/clock.ts';
import { IronpactDB } from '../../../src/data/db.ts';
import { createDataRepo, type ManagedRepo } from '../../../src/data/repo.ts';
import { browserEnvironment } from '../../../src/data/sync.ts';
import type { CrewPresence, CrewWeek } from '../../../src/data/duo.contract.ts';
import { createMockRealtimeBus } from '../../../src/data/realtime.mock.ts';
import { defaultProfile } from '../../../src/data/defaults.ts';
import { decorateRemote, deferred, fixtureId, ManualEnvironment, unwrap } from './harness.ts';

const resources: { repo: ManagedRepo; db: IronpactDB }[] = [];
afterEach(async () => {
  for (const { repo } of resources) repo.close();
  for (const { db } of resources.splice(0)) await db.delete();
  vi.useRealTimers();
});
async function setup() {
  const now = Date.parse('2026-11-08T13:00:00Z');
  const remote = createMockRemote({ now: () => now });
  const subscribed = vi.spyOn(remote, 'subscribeCrew');
  const environment = new ManualEnvironment(); environment.setOnline(true);
  const db = new IronpactDB(`duo-${crypto.randomUUID()}`);
  const repo = createDataRepo(remote, { db, environment, clock: createClock({ now: () => now }), autoStart: false, realtime: true });
  resources.push({ repo, db });
  await repo.ready; await repo.sync.pullNow();
  await vi.waitFor(() => expect(subscribed).toHaveBeenCalled());
  await repo.sync.pullNow();
  return { repo, db, remote, environment, now };
}
const presence = (user: string = MOCK_USER_IDS.bob, at = '2026-11-08T13:00:00Z'): CrewPresence => ({
  user_id: user, session_id: fixtureId(90), kind: 'gym', exercise_label: 'Bench', set_no: 1,
  planned_sets: 5, started_at: at, last_active_at: at,
});
const week = (start: string, plates: number): CrewWeek => ({ crew_id: MOCK_CREW_ID, week_start: start,
  statuses: { [MOCK_USER_IDS.alice]: { credits: 3, target: 3, status: 'FULL', spotted_by: null } },
  plate_delta: 1, plates_after: plates, adjusted_after_edit: false, computed_at: '2026-11-02T00:05:00Z' });

describe('duo mirror and mock realtime', () => {
  it('reads crew-scoped weeks, canonical Bar history and non-deleted spots; liveQuery reruns', async () => {
    const { repo, db, environment } = await setup();
    environment.setOnline(false);
    const values: number[] = [];
    const subscription = liveQuery(() => repo.duo.bar()).subscribe((bar) => values.push(bar.value));
    try {
      await db.table('crew_weeks').bulkPut([week('2026-10-19', 1), week('2026-10-26', 2),
        { ...week('2026-10-26', 99), crew_id: fixtureId(800) }]);
      await vi.waitFor(() => expect(values).toContain(2));
      expect((await repo.duo.weeks('2026-10-26')).map((row) => row.week_start)).toEqual(['2026-10-26']);
      await db.table('crew_weeks').put({ ...week('2026-10-26', 0), adjusted_after_edit: true });
      await vi.waitFor(() => expect(values.at(-1)).toBe(0));
      const token = { id: fixtureId(81), crew_id: MOCK_CREW_ID, kind: 'spot', week_start: '2026-10-26', deleted_at: null };
      await db.table('streak_tokens').bulkPut([token, { ...token, id: fixtureId(82), deleted_at: '2026-11-01' },
        { ...token, id: fixtureId(83), kind: 'freeze' }, { ...token, id: fixtureId(84), crew_id: fixtureId(800) }]);
      expect((await repo.duo.spots()).map((row) => row.id)).toEqual([fixtureId(81)]);
    } finally { subscription.unsubscribe(); }
  });

  it('a mock partner write triggers delta pull and the ordinary crew feed without a manual pull', async () => {
    const { repo, remote } = await setup();
    const changed = vi.fn(); const stop = repo.duo.onCrewChange(changed);
    try {
      await remote.simulateCrewmateActivity();
      await vi.waitFor(async () => expect(await repo.q.crewFeed(10)).toHaveLength(1));
      await vi.waitFor(() => expect(changed).toHaveBeenCalled());
    } finally { stop(); }
  });

  it('a third member joins the existing tables and appears in presence without a schema change', async () => {
    const { repo, db, remote } = await setup();
    const schemaVersion = db.verno;
    const third = fixtureId(3);
    remote.seed('profiles', [{ ...defaultProfile(third, 'Europe/Amsterdam') }]);
    remote.seed('crew_members', [{ crew_id: MOCK_CREW_ID, user_id: third, role: 'member', joined_at: '2026-10-01T00:00:00Z', left_at: null }]);
    await vi.waitFor(async () => expect((await repo.q.myCrew())?.members).toHaveLength(3));
    let visible: CrewPresence[] = [];
    const stop = repo.duo.presence.onChange((rows) => { visible = rows; });
    const peer = await remote.subscribeCrew(MOCK_CREW_ID, { onPresence() {}, onChange() {} });
    try {
      peer.setPresence({ ...presence(), user_id: third });
      await vi.waitFor(() => expect(visible.map((row) => row.user_id)).toEqual([third]));
      expect(db.verno).toBe(schemaVersion);
    } finally { stop(); peer.close(); }
  });

  it('publishes start/set/finish from data writes, counts each exercise and infers planned sets from history', async () => {
    const { repo, remote, environment } = await setup();
    // Let the initial membership observation attach the repo's connection.
    const tracked: CrewPresence[][] = [];
    const peer = await remote.subscribeCrew(MOCK_CREW_ID, { onPresence: (rows) => tracked.push(rows), onChange() {} });
    try {
      const previous = unwrap(await repo.w.startSession({ kind: 'gym' }));
      for (let i = 0; i < 3; i++) unwrap(await repo.w.logSet({ session_id: previous.id, exercise_id: MOCK_EXERCISE_ID, reps: 5, weight_kg: 60 }));
      unwrap(await repo.w.finishSession(previous.id));
      const { db } = resources.at(-1)!;
      await db.sessions.update(previous.id, { started_at: '2026-11-07T13:00:00Z' });
      const session = unwrap(await repo.w.startSession({ kind: 'gym' }));
      await vi.waitFor(() => expect(tracked.at(-1)?.[0]).toMatchObject({ session_id: session.id, set_no: 0 }));
      unwrap(await repo.w.logSet({ session_id: session.id, exercise_id: MOCK_EXERCISE_ID, reps: 5, weight_kg: 60 }));
      await vi.waitFor(() => expect(tracked.at(-1)?.[0]).toMatchObject({ exercise_label: 'Bench', set_no: 1, planned_sets: 3 }));
      expect(environment.timers.size).toBeGreaterThan(0);
      unwrap(await repo.w.finishSession(session.id));
      await vi.waitFor(() => expect(tracked.at(-1)).toEqual([]));
      expect(await repo.w.logSet({ session_id: session.id, exercise_id: MOCK_EXERCISE_ID, reps: 5, weight_kg: 60 })).toMatchObject({ ok: false });
      expect(tracked.at(-1)).toEqual([]);
    } finally { peer.close(); }
  });

  it('clears stale partner presence at 120 seconds without another server message (fake clock)', async () => {
    const { repo, remote, now } = await setup();
    // Use timers with a clock that can advance, preserving actual IndexedDB I/O.
    repo.close();
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(now);
    const db = new IronpactDB(`duo-expiry-${crypto.randomUUID()}`);
    const environment = { ...browserEnvironment(), online: () => true, visible: () => true };
    const fresh = createDataRepo(remote, { db, environment, autoStart: false, realtime: true });
    resources.push({ repo: fresh, db });
    await fresh.ready; await fresh.sync.pullNow();
    let visible: CrewPresence[] = [];
    fresh.duo.presence.onChange((rows) => { visible = rows; });
    const peer = await remote.subscribeCrew(MOCK_CREW_ID, { onPresence() {}, onChange() {} });
    try {
      peer.setPresence(presence());
      await vi.waitFor(() => expect(visible).toHaveLength(1));
      await vi.advanceTimersByTimeAsync(119_000);
      expect(visible).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1000);
      expect(visible).toEqual([]);
    } finally { peer.close(); }
  });

  it('foreground recovers missed rows and sign-out removes presence and closes subscriptions', async () => {
    const { repo, remote, environment } = await setup();
    environment.setOnline(false);
    await remote.simulateCrewmateActivity();
    expect(await repo.q.crewFeed(10)).toEqual([]);
    environment.setOnline(true); environment.setVisible(true);
    await vi.waitFor(async () => expect(await repo.q.crewFeed(10)).toHaveLength(1));
    let visible: CrewPresence[] = [];
    repo.duo.presence.onChange((rows) => { visible = rows; });
    const peer = await remote.subscribeCrew(MOCK_CREW_ID, { onPresence() {}, onChange() {} });
    try {
      peer.setPresence(presence());
      await vi.waitFor(() => expect(visible).toHaveLength(1));
      await repo.auth.signOut();
      expect(visible).toEqual([]);
      peer.setPresence(presence());
      expect(visible).toEqual([]);
      expect(await repo.duo.bar()).toEqual({ value: 0, history: [] });
    } finally { peer.close(); }
  });

  it('retains an event delivered while a delta pull is in flight', async () => {
    const { repo, db, remote, environment } = await setup(); repo.close();
    const blocked = deferred<void>();
    let block = false; let calls = 0;
    const decorated = decorateRemote(remote, { async pullPage(table, after, limit) {
      const result = await remote.pullPage(table, after, limit);
      if (table === 'sets') { calls++; if (block) { block = false; await blocked.promise; } }
      return result;
    } });
    const fresh = createDataRepo(decorated, { db, environment, autoStart: false, realtime: true });
    resources.push({ repo: fresh, db });
    await fresh.ready; await fresh.sync.pullNow();
    expect(calls).toBeGreaterThan(0);
    block = true;
    const before = calls;
    environment.setVisible(true);
    await vi.waitFor(() => expect(calls).toBeGreaterThan(before));
    await remote.simulateCrewmateActivity();
    await new Promise((resolve) => setTimeout(resolve, 100));
    blocked.resolve();
    await vi.waitFor(async () => expect(await fresh.q.crewFeed(10)).toHaveLength(1));
  });

  it('isolates mock rooms and supports multiple members and tabs', () => {
    const bus = createMockRealtimeBus();
    const seen = vi.fn(); const other = vi.fn();
    const a = bus.connect('crew-a', { onPresence: seen, onChange() {} });
    const b = bus.connect('crew-a', { onPresence() {}, onChange() {} });
    const c = bus.connect('crew-a', { onPresence() {}, onChange() {} });
    const d = bus.connect('crew-b', { onPresence: other, onChange() {} });
    a.setPresence(presence(MOCK_USER_IDS.alice)); b.setPresence(presence());
    c.setPresence({ ...presence(), user_id: fixtureId(3) });
    expect(seen.mock.lastCall?.[0]).toHaveLength(3);
    expect(other.mock.lastCall?.[0]).toEqual([]);
    b.close(); expect(seen.mock.lastCall?.[0]).toHaveLength(2);
    a.close(); c.close(); d.close();
  });

  it('flushes earned credits before the spot RPC, pulls its canonical token and rejects offline use', async () => {
    const { repo, remote, environment } = await setup();
    remote.seed('crew_members', Object.values(MOCK_USER_IDS).map((id) => ({ crew_id: MOCK_CREW_ID,
      user_id: id, role: id === MOCK_USER_IDS.alice ? 'owner' : 'member', joined_at: '2026-10-01T00:00:00Z', left_at: null })));
    for (let i = 0; i < 4; i++) {
      const entry = unwrap(await repo.w.logRun({ distance_m: 3000, duration_s: 1200 }));
      unwrap(await repo.w.updateSession(entry.session_id, { local_date: `2026-11-0${2 + i}` }));
    }
    const useSpot = vi.spyOn(remote, 'useSpot');
    const id = unwrap(await repo.duo.useSpot('2026-11-02'));
    expect((await repo.duo.spots()).map((row) => row.id)).toEqual([id]);
    expect(repo.sync.status().pendingCount).toBe(0);
    environment.setOnline(false);
    expect(await repo.duo.useSpot('2026-11-02')).toEqual({ ok: false, error: 'network' });
    expect(useSpot).toHaveBeenCalledTimes(1);
  });
});
