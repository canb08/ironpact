import { describe, expect, it } from 'vitest';
import { createMockRemote, MOCK_CREW_ID, MOCK_USER_IDS } from '../../../src/data/adapter.mock.ts';
import { fixtureId, unwrap } from './harness.ts';

function fixture() {
  let now = Date.parse('2026-11-08T13:00:00Z');
  const remote = createMockRemote({ now: () => now });
  remote.seed('crew_members', Object.values(MOCK_USER_IDS).map((id) => ({ crew_id: MOCK_CREW_ID,
    user_id: id, role: id === MOCK_USER_IDS.alice ? 'owner' : 'member', joined_at: '2026-10-01T00:00:00Z', left_at: null })));
  // Four distinct days: target=3 plus one extra credit, all through real credit rules.
  for (let i = 0; i < 4; i++) {
    const at = `2026-11-0${2 + i}T12:00:00Z`;
    const common = { user_id: MOCK_USER_IDS.alice, local_date: at.slice(0, 10), deleted_at: null, client_updated_at: at };
    remote.seed('sessions', [{ ...common, id: fixtureId(100 + i), kind: 'run', mode: 'full', started_at: at, ended_at: at }]);
    remote.seed('cardio_entries', [{ ...common, id: fixtureId(200 + i), session_id: fixtureId(100 + i), logged_at: at }]);
  }
  return { remote, setTime: (value: string) => { now = Date.parse(value); } };
}
describe('P3A use_spot contract on the mock', () => {
  it('consumes exactly one token, covers the REST partner and replays after the window closes', async () => {
    const { remote, setTime } = fixture();
    const id = unwrap(await remote.useSpot('2026-11-02'));
    expect(remote.inspect('streak_tokens')).toMatchObject([{ id, covers_user_id: MOCK_USER_IDS.bob, user_id: MOCK_USER_IDS.alice }]);
    setTime('2026-11-09T12:00:00Z');
    expect(unwrap(await remote.useSpot('2026-11-02'))).toBe(id);
    expect(remote.inspect('streak_tokens')).toHaveLength(1);
  });
  it.each(['2026-11-08T10:59:59Z', '2026-11-09T00:00:00Z'])('rejects outside Sunday afternoon in crew time: %s', async (time) => {
    const { remote, setTime } = fixture(); setTime(time);
    expect(await remote.useSpot('2026-11-02')).toEqual({ ok: false, error: 'spot_window_closed' });
  });
  it('rejects a non-Monday and a closed week', async () => {
    const { remote } = fixture();
    expect(await remote.useSpot('not-a-date')).toEqual({ ok: false, error: 'invalid_week_start' });
    expect(await remote.useSpot('2026-11-03')).toEqual({ ok: false, error: 'invalid_week_start' });
    remote.seed('crew_weeks', [{ crew_id: MOCK_CREW_ID, week_start: '2026-11-02' }]);
    expect(await remote.useSpot('2026-11-02')).toEqual({ ok: false, error: 'week_closed' });
  });
  it('enforces the monthly cap, including tombstoned tokens like SQL', async () => {
    const { remote } = fixture();
    remote.seed('streak_tokens', [{ id: fixtureId(300), user_id: MOCK_USER_IDS.alice,
      crew_id: MOCK_CREW_ID, kind: 'spot', week_start: '2026-10-26', local_date: '2026-11-01', deleted_at: '2026-11-02' }]);
    expect(await remote.useSpot('2026-11-02')).toEqual({ ok: false, error: 'spot_monthly_limit' });
  });
  it('requires target + 1 and an eligible, uncovered REST partner', async () => {
    const { remote } = fixture();
    const profile = remote.inspect('profiles').find((row) => row.id === MOCK_USER_IDS.alice)!;
    remote.seed('profiles', [{ ...profile, weekly_target: 4 }]);
    expect(await remote.useSpot('2026-11-02')).toEqual({ ok: false, error: 'spot_needs_extra_credit' });
    remote.seed('profiles', [{ ...profile, weekly_target: 3 }]);
    remote.seed('crew_members', [{ crew_id: MOCK_CREW_ID, user_id: MOCK_USER_IDS.bob,
      joined_at: '2026-11-03T00:00:00Z', role: 'member', left_at: null }]);
    expect(await remote.useSpot('2026-11-02')).toEqual({ ok: false, error: 'no_partner_needs_spot' });
  });
  it('freezes archived crews and rejects unauthenticated calls', async () => {
    const { remote } = fixture();
    remote.seed('crew_members', [{ crew_id: MOCK_CREW_ID, user_id: MOCK_USER_IDS.bob,
      joined_at: '2026-10-01T00:00:00Z', role: 'member', left_at: '2026-11-05T00:00:00Z' }]);
    expect(await remote.useSpot('2026-11-02')).toEqual({ ok: false, error: 'crew_archived' });
    await remote.signOut();
    expect(await remote.useSpot('2026-11-02')).toEqual({ ok: false, error: 'unauthenticated' });
  });
});
