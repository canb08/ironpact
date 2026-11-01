import { describe, expect, it } from 'vitest';
import { createMockRemote, MOCK_CREW_ID, MOCK_EXERCISE_ID, MOCK_USER_IDS } from '../../../src/data/adapter.mock.ts';
import { createClock } from '../../../src/data/clock.ts';
import { IronpactDB } from '../../../src/data/db.ts';
import { createDataRepo } from '../../../src/data/repo.ts';
import { fixtureId, ManualEnvironment, unwrap } from './harness.ts';

const instant = '2026-10-25T12:00:00.000Z';
const makeRemote = () => createMockRemote({ now: () => Date.parse(instant) });
const weight = (id: string, user = MOCK_USER_IDS.alice as string) => ({
  id, user_id: user, local_date: '2026-10-25', client_updated_at: instant,
  deleted_at: null, measured_at: instant, weight_kg: 80,
});

describe('mock Remote semantics (separate from the reusable Repo contract)', () => {
  it('starts with two test users in one crew and accepts any six-digit code', async () => {
    const remote = makeRemote();
    expect(remote.currentUserId()).toBe(MOCK_USER_IDS.alice);
    expect(unwrap(await remote.pullPage('profiles', null, 1000))).toHaveLength(2);
    expect(unwrap(await remote.pullPage('crew_members', null, 1000))).toHaveLength(2);
    expect(unwrap(await remote.verifyCode('bob@example.test', '987654'))).toBe(MOCK_USER_IDS.bob);
    expect(await remote.verifyCode('alice@example.test', '12345')).toEqual({ ok: false, error: 'bad_code' });
    expect(unwrap(await remote.verifyCode('alice@example.test', '000000'))).toBe(MOCK_USER_IDS.alice);
  });

  it('rejects an ownership violation as 4xx and rolls the entire batch back', async () => {
    const remote = makeRemote();
    const result = await remote.upsert('bodyweight_entries', [weight(fixtureId(1)), weight(fixtureId(2), MOCK_USER_IDS.bob)]);
    expect(result).toMatchObject({ ok: false, error: { kind: 'client', status: 400 } });
    expect(remote.inspect('bodyweight_entries')).toEqual([]);
  });

  it('LWW rejects older timestamps, applies ties, and sets the server updated_at', async () => {
    let now = Date.parse(instant);
    const remote = createMockRemote({ now: () => now });
    const row = weight(fixtureId(1));
    expect((await remote.upsert('bodyweight_entries', [row])).ok).toBe(true);
    now += 1000;
    const tied = await remote.upsert('bodyweight_entries', [{ ...row, weight_kg: 82 }]);
    expect(tied).toMatchObject({ ok: true, value: [{ weight_kg: 82, updated_at: new Date(now).toISOString() }] });
    const older = await remote.upsert('bodyweight_entries', [{ ...row, client_updated_at: '2026-10-25T11:59:59.000Z', weight_kg: 70 }]);
    expect(older).toMatchObject({ ok: true, value: [{ weight_kg: 82 }] });
    expect(remote.inspect('bodyweight_entries')).toHaveLength(1);
  });

  it('pages 1005 equal-timestamp rows by id without skipping or repeating any', async () => {
    const remote = makeRemote();
    remote.seed('sets', Array.from({ length: 1005 }, (_, index) => ({
      ...weight(fixtureId(index + 1)), session_id: fixtureId(2000), exercise_id: MOCK_EXERCISE_ID,
      reps: 5, set_index: index + 1, rpe: null, is_warmup: false, note: null,
      logged_at: instant, updated_at: instant,
    })));
    const first = unwrap(await remote.pullPage('sets', null, 1000));
    expect(first).toHaveLength(1000);
    const second = unwrap(await remote.pullPage('sets', { updated_at: instant, id: first.at(-1)!.id! }, 1000));
    expect(second).toHaveLength(5);
    const ids = [...first, ...second].map((row) => row.id);
    expect(ids).toEqual(Array.from({ length: 1005 }, (_, index) => fixtureId(index + 1)));
  });

  it('supports composite snapshot cursors even though membership rows have no SQL updated_at', async () => {
    const remote = makeRemote();
    const first = unwrap(await remote.pullPage('crew_members', null, 1))[0]!;
    const after = { updated_at: String(first.updated_at), id: JSON.stringify([first.crew_id, first.user_id]) };
    const second = unwrap(await remote.pullPage('crew_members', after, 1))[0]!;
    expect(second.user_id).not.toBe(first.user_id);
    expect(Number.isFinite(Date.parse(after.updated_at))).toBe(true);
    const end = { updated_at: String(second.updated_at), id: JSON.stringify([second.crew_id, second.user_id]) };
    expect(unwrap(await remote.pullPage('crew_members', end, 1))).toEqual([]);
  });

  it('keeps PostgreSQL microsecond ordering at a keyset page boundary', async () => {
    const remote = makeRemote();
    const earlier = { ...weight(fixtureId(2)), updated_at: '2026-10-25T12:00:00.000100Z' };
    const later = { ...weight(fixtureId(1)), updated_at: '2026-10-25T12:00:00.000900+00:00' };
    remote.seed('bodyweight_entries', [later, earlier]);
    expect(unwrap(await remote.pullPage('bodyweight_entries', null, 1))[0]?.id).toBe(earlier.id);
    expect(unwrap(await remote.pullPage('bodyweight_entries', { updated_at: earlier.updated_at, id: earlier.id }, 1))[0]?.id).toBe(later.id);
  });

  it('hides crewmate bodyweight until sharing is enabled and after it is revoked', async () => {
    const remote = makeRemote();
    const id = fixtureId(1);
    remote.seed('bodyweight_entries', [weight(id, MOCK_USER_IDS.bob)]);
    expect(unwrap(await remote.fetchByIds('bodyweight_entries', [id]))).toEqual([]);
    const profile = remote.inspect('profiles').find((row) => row.id === MOCK_USER_IDS.bob)!;
    remote.seed('profiles', [{ ...profile, show_bodyweight: true }]);
    expect(unwrap(await remote.fetchByIds('bodyweight_entries', [id]))).toHaveLength(1);
    remote.seed('profiles', [{ ...profile, show_bodyweight: false }]);
    expect(unwrap(await remote.fetchByIds('bodyweight_entries', [id]))).toEqual([]);
  });

  it('invite redemption is single-use and restores a departed member to the crew', async () => {
    const remote = makeRemote();
    const code = unwrap(await remote.createInvite(MOCK_CREW_ID));
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{10}$/);
    unwrap(await remote.verifyCode('bob@example.test', '123456'));
    unwrap(await remote.leaveCrew(MOCK_CREW_ID));
    expect(unwrap(await remote.redeemInvite(code))).toBe(MOCK_CREW_ID);
    expect(await remote.redeemInvite(code)).toEqual({ ok: false, error: 'code_dead' });
  });

  it('export tokens expose plain spx_ tokens once, enforce three active tokens, and allow revocation', async () => {
    const remote = makeRemote();
    const tokens = [];
    for (let index = 0; index < 3; index++) tokens.push(unwrap(await remote.createExportToken(`Token ${index}`)));
    expect(tokens.every((token) => /^spx_[A-Za-z0-9_-]{43}$/.test(token))).toBe(true);
    expect(await remote.createExportToken('Fourth')).toEqual({ ok: false, error: 'token_limit' });
    const metadata = unwrap(await remote.listExportTokens());
    expect(JSON.stringify(metadata)).not.toContain('spx_');
    unwrap(await remote.revokeExportToken(metadata[0]!.id));
    expect((await remote.createExportToken('Replacement')).ok).toBe(true);
    expect(unwrap(await remote.listExportTokens()).filter((token) => !token.revoked_at)).toHaveLength(3);
  });

  it('pulling an empty authoritative membership snapshot removes cached crew and partner visibility after remote leave', async () => {
    const remote = makeRemote();
    const bob = remote.inspect('profiles').find((row) => row.id === MOCK_USER_IDS.bob)!;
    remote.seed('profiles', [{ ...bob, show_bodyweight: true }]);
    remote.seed('bodyweight_entries', [weight(fixtureId(1), MOCK_USER_IDS.bob)]);
    await remote.simulateCrewmateActivity();
    const environment = new ManualEnvironment();
    environment.setOnline(true);
    const db = new IronpactDB(`ironpact-privacy-${crypto.randomUUID()}`);
    const repo = createDataRepo(remote, {
      db, environment, autoStart: false,
      clock: createClock({ now: () => Date.parse(instant), timezone: () => 'Europe/Amsterdam' }),
    });
    try {
      await repo.ready;
      await repo.sync.pullNow();
      expect(await repo.q.myCrew()).toBeDefined();
      expect((await repo.q.entriesBetween(MOCK_USER_IDS.bob, '2026-10-25', '2026-10-25')).bodyweight).toHaveLength(1);
      expect(await repo.q.crewFeed(20)).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'set' })]));
      // This bypasses Repo.crew.leave(), as a leave on another device does.
      unwrap(await remote.leaveCrew(MOCK_CREW_ID));
      await repo.sync.pullNow();
      expect(await repo.q.myCrew()).toBeUndefined();
      expect(await repo.q.entriesBetween(MOCK_USER_IDS.bob, '2026-10-25', '2026-10-25')).toEqual({ sessions: [], sets: [], cardio: [], martial: [], min: [], bodyweight: [] });
      expect(await repo.q.crewFeed(20)).toEqual([]);
    } finally {
      repo.close();
      expect(environment.timers.size).toBe(0);
      await db.delete();
    }
  });
});
