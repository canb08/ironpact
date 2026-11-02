import { runPartnerPrContract } from '../unit/data/partner-pr.contract.ts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createClock } from '../../src/data/clock.ts';
import { IronpactDB, rowKey, SNAPSHOT_TIMESTAMP } from '../../src/data/db.ts';
import { createDataRepo } from '../../src/data/repo.ts';
import { decorateRemote, ManualEnvironment, unwrap } from '../unit/data/harness.ts';
import { runRepoContract } from '../unit/data/repo.contract.ts';
import { localStack } from './local-stack.ts';

describe.skipIf(process.env.RUN_SUPABASE_INTEGRATION !== '1')('Supabase local stack', () => {
  let stack: Awaited<ReturnType<typeof localStack>>;
  beforeAll(async () => { stack = await localStack(); }, 30_000);
  afterAll(async () => { await stack?.close(); }, 30_000);
  beforeEach(async () => { await stack.reset(); }, 30_000);

  runPartnerPrContract(async () => {
    const owner = stack.remote;
    const crew = unwrap(await owner.createCrew('Crew', 'Europe/Amsterdam'));
    const invite = unwrap(await owner.createInvite(crew));
    return { owner, async asPartner() {
      const partner = await stack.bob.signIn();
      unwrap(await partner.redeemInvite(invite));
      return partner;
    } };
  });

  describe('A6 unchanged contract on Supabase', () => {
    runRepoContract(async ({ now }) => {
      const remote = stack.remote;
      // A6's contract injects an October clock and advances it synchronously.
      // Exercise the actual RPC, then align its value with that deterministic
      // clock; all reads, writes, auth and constraints still use the real stack.
      return decorateRemote(remote, { async serverNow() {
        await remote.serverNow();
        return new Date(now()).toISOString();
      } });
    });
  });

  it('flight: 20 offline sets survive physical DB close/reopen and repeated online flush, with 0 duplicates', async () => {
    let db = new IronpactDB(`ironpact-flight-${crypto.randomUUID()}`);
    const environment = new ManualEnvironment();
    const options = () => ({ db, environment, clock: createClock({ timezone: () => 'Europe/Amsterdam' }), autoStart: false });
    let repo = createDataRepo(stack.remote, options());
    try {
      await repo.ready;
      const exercise = unwrap(await repo.w.createExercise({ name: 'Flight lift', export_label: 'Flight lift', kind: 'lift', category: 'compound', lower_body: false }));
      const session = unwrap(await repo.w.startSession({ kind: 'gym' }));
      for (let i = 0; i < 20; i++) unwrap(await repo.w.logSet({ session_id: session.id, exercise_id: exercise.id, reps: 5, weight_kg: 60 }));
      const offline = await stack.admin.from('sets').select('id', { count: 'exact', head: true }).eq('user_id', stack.alice.id);
      expect(offline.error).toBeNull();
      expect(offline.count).toBe(0);
      repo.close();
      const name = db.name;
      db.close();
      db = new IronpactDB(name);
      environment.setOnline(true);
      repo = createDataRepo(stack.remote, options());
      await repo.ready;
      await repo.sync.flushNow();
      await repo.sync.flushNow();
      const server = await stack.admin.from('sets').select('id', { count: 'exact' }).eq('user_id', stack.alice.id);
      expect(server.error).toBeNull();
      expect(server.count).toBe(20);
      expect(new Set(server.data?.map((row) => row.id)).size).toBe(20);
      expect(await db.outbox.count()).toBe(0);
      console.log(`Flight test: ${server.count} server rows, 0 duplicates`);
    } finally { repo.close(); await db.delete(); }
  });

  it('RLS rejects alice upserting a row with bob user_id, classified for bisection', async () => {
    const result = await stack.remote.upsert('bodyweight_entries', [{
      id: crypto.randomUUID(), user_id: stack.bob.id, local_date: '2026-10-25',
      client_updated_at: new Date().toISOString(), measured_at: new Date().toISOString(), weight_kg: 80, deleted_at: null,
    }]);
    expect(result).toMatchObject({ ok: false, error: { kind: 'client', status: 403 } });
    const server = await stack.admin.from('bodyweight_entries').select('id').eq('user_id', stack.bob.id);
    expect(server.error).toBeNull();
    expect(server.data).toEqual([]);
  });

  it('server_now returns actual database time under the authenticated role', async () => {
    const start = Date.now();
    const time = Date.parse(await stack.remote.serverNow());
    expect(time).toBeGreaterThanOrEqual(start - 1000);
    expect(time).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it('verifies a real six-digit email OTP, publishes auth changes and signs out', async () => {
    const remote = stack.remote;
    const changes: (string | null)[] = [];
    const unsubscribe = remote.onAuthChange((id) => changes.push(id));
    try {
      await remote.signOut();
      expect(remote.currentUserId()).toBeNull();
      const generated = await stack.admin.auth.admin.generateLink({ type: 'magiclink', email: 'alice@example.test' });
      if (generated.error || !generated.data.properties) throw new Error('Local OTP generation failed');
      const code = generated.data.properties.email_otp;
      if (!/^\d{6}$/.test(code)) throw new Error('Local OTP must contain six digits');
      expect(unwrap(await remote.verifyCode('alice@example.test', code))).toBe(stack.alice.id);
      expect(remote.currentUserId()).toBe(stack.alice.id);
      expect(changes).toEqual([null, stack.alice.id]);
      await remote.signOut();
      expect(changes).toEqual([null, stack.alice.id, null]);
      unsubscribe();
      await stack.alice.signIn();
      expect(changes).toHaveLength(3);
    } finally { unsubscribe(); }
  });

  it('paginates 1005 real rows with tied timestamps, including the empty-ID overlap cursor', async () => {
    const timestamp = '2026-10-25T12:00:00.123456+00:00';
    const rows = Array.from({ length: 1005 }, (_, index) => ({
      id: `70000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      user_id: stack.alice.id, local_date: '2026-10-25', measured_at: timestamp,
      client_updated_at: timestamp, updated_at: timestamp, weight_kg: 80,
    }));
    for (let start = 0; start < rows.length; start += 100) {
      const result = await stack.admin.from('bodyweight_entries').insert(rows.slice(start, start + 100));
      expect(result.error).toBeNull();
    }
    const first = unwrap(await stack.remote.pullPage('bodyweight_entries', { updated_at: timestamp, id: '' }, 1000));
    expect(first).toHaveLength(1000);
    const end = first[first.length - 1]!;
    const next = unwrap(await stack.remote.pullPage('bodyweight_entries', { updated_at: String(end.updated_at), id: end.id! }, 1000));
    expect(next).toHaveLength(5);
    expect(new Set([...first, ...next].map((row) => row.id)).size).toBe(1005);
    expect(unwrap(await stack.remote.fetchByIds('bodyweight_entries', rows.map((row) => row.id)))).toHaveLength(1005);
  });

  it('crew and export-token RPCs preserve L2 error values and token metadata privacy', async () => {
    const remote = stack.remote;
    expect(await remote.createCrew('Crew', 'invalid/timezone')).toEqual({ ok: false, error: 'invalid_timezone' });
    const crew = unwrap(await remote.createCrew('Crew', 'Europe/Amsterdam'));
    expect(await remote.createCrew('Crew', 'Europe/Amsterdam')).toEqual({ ok: false, error: 'already_in_crew' });
    const invite = unwrap(await remote.createInvite(crew));
    expect(invite).toMatch(/^[0-9A-HJKMNP-TV-Z]{10}$/);
    const bob = await stack.bob.signIn();
    expect(await bob.redeemInvite('invalid')).toEqual({ ok: false, error: 'code_dead' });
    expect(unwrap(await bob.redeemInvite(invite))).toBe(crew);
    expect(await bob.createInvite(crew)).toEqual({ ok: false, error: 'not_crew_owner' });
    const members = unwrap(await remote.pullPage('crew_members', null, 1000));
    expect(members).toHaveLength(2);
    expect(members.every((row) => row.updated_at === SNAPSHOT_TIMESTAMP)).toBe(true);
    const page = unwrap(await remote.pullPage('crew_members', null, 1));
    const second = unwrap(await remote.pullPage('crew_members', { updated_at: SNAPSHOT_TIMESTAMP, id: rowKey('crew_members', page[0]!) }, 1));
    expect(new Set([...page, ...second].map((row) => rowKey('crew_members', row))).size).toBe(2);
    unwrap(await bob.leaveCrew(crew));
    expect(unwrap(await bob.pullPage('crew_members', null, 1000))).toEqual([]);
    expect(unwrap(await remote.createExportToken('Vault'))).toMatch(/^spx_[A-Za-z0-9_-]{43}$/);
    unwrap(await remote.createExportToken('Second'));
    unwrap(await remote.createExportToken('Third'));
    expect(await remote.createExportToken('Fourth')).toEqual({ ok: false, error: 'token_limit' });
    const tokens = unwrap(await remote.listExportTokens());
    expect(tokens).toHaveLength(3);
    expect(tokens.every((row) => !('token_hash' in row))).toBe(true);
    unwrap(await remote.revokeExportToken(tokens[0]!.id));
    expect(unwrap(await remote.listExportTokens()).find((row) => row.id === tokens[0]!.id)?.revoked_at).not.toBeNull();
  });

  it('immutable composite rows replay safely, reject changes and use JSON key order across enum values', async () => {
    const at = new Date().toISOString();
    const exercise = { id: crypto.randomUUID(), owner_id: stack.alice.id, name: 'Mapped lift', export_label: 'Mapped lift', kind: 'lift', client_updated_at: at };
    expect((await stack.remote.upsert('exercises', [exercise])).ok).toBe(true);
    const rows = ['triceps', 'abs', 'chest'].map((muscle) => ({ exercise_id: exercise.id, muscle, weight: 1 }));
    expect((await stack.remote.upsert('exercise_muscles', rows)).ok).toBe(true);
    expect((await stack.remote.upsert('exercise_muscles', rows)).ok).toBe(true);
    expect(await stack.remote.upsert('exercise_muscles', [{ ...rows[0]!, weight: 0.5 }])).toMatchObject({ ok: false, error: { kind: 'client' } });
    const all = unwrap(await stack.remote.pullPage('exercise_muscles', null, 1000)).filter((row) => row.exercise_id === exercise.id);
    expect(all.map((row) => row.muscle)).toEqual(['abs', 'chest', 'triceps']);
    expect(unwrap(await stack.remote.fetchByIds('exercise_muscles', rows.map((row) => rowKey('exercise_muscles', row))))).toHaveLength(3);
    const bob = await stack.bob.signIn();
    const crew = unwrap(await stack.remote.createCrew('Crew', 'Europe/Amsterdam'));
    unwrap(await bob.redeemInvite(unwrap(await stack.remote.createInvite(crew))));
    expect(await bob.upsert('exercise_muscles', rows)).toMatchObject({ ok: false, error: { kind: 'client' } });
  });
});
