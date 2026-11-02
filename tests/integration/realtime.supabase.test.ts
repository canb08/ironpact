import { afterAll, beforeAll, expect, it, describe, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { createClock } from '../../src/data/clock.ts';
import { createSupabaseRemote } from '../../src/data/adapter.supabase.ts';
import { IronpactDB } from '../../src/data/db.ts';
import { createDataRepo, type ManagedRepo } from '../../src/data/repo.ts';
import { browserEnvironment } from '../../src/data/sync.ts';
import type { CrewPresence } from '../../src/data/duo.contract.ts';
import { ManualEnvironment, unwrap } from '../unit/data/harness.ts';
import { localStack } from './local-stack.ts';

// CI runs this file after the A7 suite, because both use the same local-only
// alice/bob fixture identities. No production endpoint or credentials are used.
describe.skipIf(process.env.RUN_SUPABASE_INTEGRATION !== '1')('P3B Supabase realtime', () => {
  let stack: Awaited<ReturnType<typeof localStack>>;
  let a: ManagedRepo;
  let b: ManagedRepo;
  let dbA: IronpactDB;
  let dbB: IronpactDB;
  let session: string;
  let exercise: string;
  let crew: string;
  let now = Date.now();
  const clockB = createClock({ now: () => now });
  const environmentB = new ManualEnvironment();
  let partnerPresence: CrewPresence[] = [];
  beforeAll(async () => {
    stack = await localStack();
    await stack.reset();
    crew = unwrap(await stack.remote.createCrew('Crew', 'Europe/Amsterdam'));
    const remoteB = await stack.bob.signIn();
    unwrap(await remoteB.redeemInvite(unwrap(await stack.remote.createInvite(crew))));
    dbA = new IronpactDB(`p3b-a-${crypto.randomUUID()}`);
    dbB = new IronpactDB(`p3b-b-${crypto.randomUUID()}`);
    a = createDataRepo(stack.remote, { db: dbA, environment: { ...browserEnvironment(), online: () => true, visible: () => true } });
    environmentB.setOnline(true);
    // B has no periodic polling. Only the real subscription may wake a pull.
    b = createDataRepo(remoteB, { db: dbB, environment: environmentB,
      clock: clockB, autoStart: false, realtime: true });
    await Promise.all([a.ready, b.ready]);
    await Promise.all([a.sync.pullNow(), b.sync.pullNow()]);
    await vi.waitFor(() => {
      for (const client of [stack.alice.client, stack.bob.client]) {
        expect(client.getChannels()).toHaveLength(13);
        expect(client.getChannels().every((channel) => channel.state === 'joined')).toBe(true);
      }
    }, { timeout: 20_000, interval: 20 });
    b.duo.presence.onChange((rows) => { partnerPresence = rows; });
    exercise = unwrap(await a.w.createExercise({ name: 'Realtime lift', export_label: 'Realtime lift', kind: 'lift', category: 'compound', lower_body: false })).id;
    session = unwrap(await a.w.startSession({ kind: 'gym' })).id;
    await a.sync.flushNow();
  }, 60_000);
  afterAll(async () => {
    a?.close(); b?.close();
    await Promise.all([dbA?.delete(), dbB?.delete()]);
    await stack?.close();
  }, 30_000);

  it('prints set-to-partner-feed p90 over ten runs, at most 3000 ms', async () => {
    const samples: number[] = [];
    for (let i = 0; i < 10; i++) {
      const started = performance.now();
      const set = unwrap(await a.w.logSet({ session_id: session, exercise_id: exercise, reps: 5, weight_kg: 60 + i }));
      await vi.waitFor(async () => expect((await b.q.crewFeed(20)).some((item) => item.type === 'set' && item.row.id === set.id)).toBe(true),
        { timeout: 10_000, interval: 10 });
      samples.push(performance.now() - started);
    }
    const p90 = [...samples].sort((left, right) => left - right)[8]!;
    console.log(`P3B realtime: 10 runs; ms=[${samples.map((ms) => ms.toFixed(1)).join(', ')}]; p90=${p90.toFixed(1)} ms (budget 3000 ms)`);
    expect(p90).toBeLessThanOrEqual(3000);
  }, 120_000);

  it('hides presence within 2 min 10 s with an injected fake clock, and finish untracks immediately', async () => {
    await vi.waitFor(() => expect(partnerPresence[0]?.planned_sets).toBe(10), { timeout: 5000 });
    const last = partnerPresence[0]!;
    expect(last.planned_sets).toBe(10);
    now = Date.parse(last.last_active_at) + 120_001 - clockB.offsetMs();
    // Only B's injected timers/clock advance. The real websocket heartbeat is
    // untouched, and no leave/update packet is needed to hide the stale entry.
    for (const timer of [...environmentB.timers.values()]) timer.callback();
    expect(partnerPresence).toEqual([]);
    expect(120_001).toBeLessThanOrEqual(130_000);
    now = Date.now() - clockB.offsetMs();
    unwrap(await a.w.logSet({ session_id: session, exercise_id: exercise, reps: 5, weight_kg: 60 }));
    await vi.waitFor(() => expect(partnerPresence).toHaveLength(1), { timeout: 5000 });
    unwrap(await a.w.finishSession(session));
    await vi.waitFor(() => expect(partnerPresence).toEqual([]), { timeout: 3000 });
  }, 20_000);

  it('a third authenticated member joins and receives rows using the existing schema', async () => {
    const email = 'member3@example.test';
    const password = crypto.randomUUID() + crypto.randomUUID();
    const created = await stack.admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error || !created.data.user) throw new Error('Third local fixture user creation failed');
    const id = created.data.user.id;
    const client = createClient(stack.url, process.env.SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const db = new IronpactDB(`p3b-third-${crypto.randomUUID()}`);
    let third: ManagedRepo | undefined;
    try {
      const signed = await client.auth.signInWithPassword({ email, password });
      expect(signed.error).toBeNull();
      const remote = createSupabaseRemote(client); await remote.serverNow();
      unwrap(await remote.redeemInvite(unwrap(await stack.remote.createInvite(crew))));
      third = createDataRepo(remote, { db, environment: { ...browserEnvironment(), online: () => true, visible: () => true }, autoStart: false, realtime: true });
      await third.ready; await third.sync.pullNow();
      expect((await third.q.myCrew())?.members).toHaveLength(3);
      expect((await third.q.crewFeed(20)).filter((item) => item.type === 'set')).toHaveLength(11);
      await vi.waitFor(() => expect(client.getChannels().filter((channel) => channel.state === 'joined')).toHaveLength(13), { timeout: 20_000 });
    } finally {
      third?.close(); await db.delete(); await client.auth.signOut();
      // Membership cascades from auth.users; no table or migration is added.
      expect((await stack.admin.auth.admin.deleteUser(id)).error).toBeNull();
    }
  }, 40_000);
});
