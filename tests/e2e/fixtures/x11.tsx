// Real AppShell, Repo, outbox and mock server. Seed before mounting so live
// queries never capture a half-seeded state. Background sync is manual here;
// the flight specs separately exercise automatic online/offline syncing.
import { createRoot } from 'react-dom/client';
import { AppShell } from '../../../src/App.tsx';
import { createDataRepo } from '../../../src/data/repo.ts';
import { createMockRemote, MOCK_USER_IDS } from '../../../src/data/adapter.mock.ts';
import { createClock } from '../../../src/data/clock.ts';
import { router } from '../../../src/router.tsx';
import '../../../src/ui/tokens.css';

const BENCH = '00000000-0000-4000-8000-000000000010';
const theme = new URLSearchParams(location.search).get('theme') === 'light' ? 'light' : 'dark';
let instant = Date.parse('2026-11-03T12:00:00.000Z');
const at = (date: string, time: string) => { instant = Date.parse(`${date}T${time}:00.000Z`); };
const remote = createMockRemote({ now: () => instant });
const repo = createDataRepo(remote, { clock: createClock({ now: () => instant, timezone: () => 'Europe/Amsterdam' }), autoStart: false });
function value<T>(result: { ok: true; value: T } | { ok: false; error: string }): T {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
await repo.ready;
value(await repo.w.upsertMyProfile({ display_name: 'Lifter', initial: 'L', theme, tz: 'Europe/Amsterdam', reduce_motion: true, haptics_on: false, weekly_target: 5 }));
for (const [index, date] of ['2026-10-20', '2026-10-27', '2026-11-02'].entries()) {
  at(date, '07:00');
  value(await repo.w.logBodyweight(80 - index * 0.5));
  at(date, '08:00');
  value(await repo.w.logRun({ distance_m: 4000 + index * 500, duration_s: 1500 + index * 60 }));
  at(date, '10:00');
  value(await repo.w.logMartial({ discipline: 'Muay Thai', duration_min: 60, rounds: 6 }));
  at(date, '17:00');
  const gym = value(await repo.w.startSession({ kind: 'gym' }));
  for (let set = 1; set <= 6; set++) {
    at(date, `17:0${set}`);
    value(await repo.w.logSet({ session_id: gym.id, exercise_id: BENCH, reps: 5, weight_kg: 70 + index * 5 }));
  }
  at(date, '17:45');
  value(await repo.w.finishSession(gym.id));
}
at('2026-11-02', '18:00');
value(await repo.w.logMin('10-minute walk'));
at('2026-11-03', '12:00');
value(await repo.w.recomputePrs(BENCH));
await repo.sync.flushNow();
// Seed a real partner on the mock server, so subsequent pulls preserve the
// fixture. Keep its legacy stored name to exercise every display fallback.
const last = await repo.q.lastSessionSummary(MOCK_USER_IDS.alice);
const gym = (await repo.q.recentSessionsWithSets(1))[0];
if (!last || !gym) throw new Error('Missing fixture workout');
const partnerSession = '10000000-0000-4000-8000-000000000001';
remote.seed('sessions', [{ ...gym.session, id: partnerSession, user_id: MOCK_USER_IDS.bob, started_at: '2026-11-02T16:00:00.000Z', ended_at: '2026-11-02T16:45:00.000Z' }]);
remote.seed('sets', gym.sets.map((row, index) => ({ ...row, id: `20000000-0000-4000-8000-${String(index).padStart(12, '0')}`, session_id: partnerSession, user_id: MOCK_USER_IDS.bob, weight_kg: 90, logged_at: `2026-11-02T16:0${index + 1}:00.000Z` })));
await repo.sync.pullNow();
value(await repo.w.markPrEventsSeen((await repo.q.prEvents({})).map((row) => row.id)));
localStorage.setItem('ironpact.install-dismissed', '1');
await router.navigate('/progress');
createRoot(document.getElementById('root')!).render(<AppShell repo={repo} />);
