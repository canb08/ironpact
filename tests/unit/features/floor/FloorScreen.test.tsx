// @vitest-environment jsdom
import '../../data/harness.ts';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { weekCredits } from '../../../../src/core/credits.ts';
import { localDateOf, weekDates, weekStartOf } from '../../../../src/core/weeks.ts';
import type { RemoteRow } from '../../../../src/data/adapter.ts';
import { MOCK_EXERCISE_ID, MOCK_USER_IDS, createMockRemote } from '../../../../src/data/adapter.mock.ts';
import { createClock } from '../../../../src/data/clock.ts';
import { IronpactDB } from '../../../../src/data/db.ts';
import { defaultProfile } from '../../../../src/data/defaults.ts';
import { createDataRepo } from '../../../../src/data/repo.ts';
import { RepoProvider } from '../../../../src/app/RepoProvider.tsx';
import FloorScreen from '../../../../src/features/floor/FloorScreen.tsx';
import { copy } from '../../../../src/ui/copy.ts';
import { fixtureId, ManualEnvironment } from '../../data/harness.ts';

let repo: ReturnType<typeof createDataRepo> | undefined;
let db: IronpactDB | undefined;

afterEach(async () => {
  cleanup();
  repo?.close();
  await db?.delete();
  repo = undefined;
  db = undefined;
  vi.useRealTimers();
});

function gymRow(userId: string, n: number, localDate: string, started: string) {
  const sessionId = fixtureId(n);
  const session: RemoteRow = {
    id: sessionId, user_id: userId, local_date: localDate, client_updated_at: started, deleted_at: null,
    kind: 'gym', mode: 'full', started_at: started, ended_at: started, tz: 'Europe/Amsterdam',
    readiness: null, together_id: null, note: null,
  };
  const set: RemoteRow = {
    id: fixtureId(n + 50), user_id: userId, local_date: localDate, client_updated_at: started, deleted_at: null,
    session_id: sessionId, exercise_id: MOCK_EXERCISE_ID, set_index: 1, reps: 5, weight_kg: 80,
    rpe: 8, is_warmup: false, note: null, logged_at: started,
  };
  return { session, set };
}

async function makeRepo(startIso: string) {
  let instant = Date.parse(startIso);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(instant);
  const environment = new ManualEnvironment();
  environment.setOnline(true);
  const remote = createMockRemote({ now: () => instant });
  remote.seed('profiles', [{
    ...defaultProfile(MOCK_USER_IDS.bob, 'Europe/Amsterdam'),
    display_name: 'Crewmate', initial: 'C', color_hue: 220,
  }]);
  const database = new IronpactDB(`ironpact-b5-${crypto.randomUUID()}`);
  const created = createDataRepo(remote, {
    db: database,
    clock: createClock({ now: () => instant, timezone: () => 'Europe/Amsterdam' }),
    environment,
    autoStart: false,
  });
  await created.ready;
  repo = created;
  db = database;
  return {
    repo: created,
    setNow(ms: number) {
      instant = ms;
      vi.setSystemTime(ms);
    },
    seed(rows: { sessions: RemoteRow[]; sets: RemoteRow[] }) {
      remote.seed('sessions', rows.sessions);
      remote.seed('sets', rows.sets);
    },
    pull: () => created.sync.pullNow(),
  };
}

function renderFloor() {
  const router = createMemoryRouter([
    { path: '/', element: <FloorScreen /> },
    { path: '/session', element: <main>Session</main> },
    { path: '/log/:kind', element: <main>Log</main> },
    { path: '/crew', element: <main>Crew</main> },
    { path: '/settings', element: <main>Settings</main> },
  ], { initialEntries: ['/'] });
  render(
    <RepoProvider repo={repo!}>
      <RouterProvider router={router} />
    </RepoProvider>,
  );
  return router;
}

function line(credits: number, target: number, minCount: number) {
  const shown = Number.isInteger(credits) ? String(credits) : credits.toFixed(1);
  return `${shown}/${target} · ${minCount} MIN`;
}

it('MIN one tap logs one 20m walk and Undo removes it', async () => {
  const handle = await makeRepo('2026-10-24T12:00:00.000Z');
  const router = renderFloor();
  expect((await screen.findByTestId('my-week')).textContent).toBe('0/3 · 0 MIN');
  expect(screen.getByTestId('partner-week').textContent).toBe('0/3 · 0 MIN');
  expect(screen.getByText(copy.emptyFloor)).toBeTruthy();
  expect(screen.getByRole('link', { name: copy.run }).getAttribute('href')).toBe('/log/run');
  expect(screen.getByRole('link', { name: copy.martialArts }).getAttribute('href')).toBe('/log/martial');
  expect(screen.getByRole('link', { name: copy.weight }).getAttribute('href')).toBe('/log/weight');
  expect(screen.getByRole('link', { name: copy.min }).getAttribute('href')).toBe('/log/min');
  expect(screen.getByRole('link', { name: copy.crew }).getAttribute('href')).toBe('/crew');
  expect(screen.getByRole('link', { name: copy.settings }).getAttribute('href')).toBe('/settings');

  const min = screen.getByRole('button', { name: copy.min });
  fireEvent.click(min);
  fireEvent.click(min);
  await waitFor(async () => {
    const entries = await handle.repo.q.entriesBetween(MOCK_USER_IDS.alice, '0000-01-01', '9999-12-31');
    expect(entries.min).toHaveLength(1);
    expect(entries.sessions.filter((session) => session.kind === 'min')).toHaveLength(1);
    expect(screen.getByTestId('my-week').textContent).toBe('0.5/3 · 1 MIN');
  });
  const logged = await handle.repo.q.entriesBetween(MOCK_USER_IDS.alice, '0000-01-01', '9999-12-31');
  expect(logged.min[0]?.description).toBe(copy.walk);
  expect(screen.getByRole('status').textContent).toBe(copy.minLogged);

  fireEvent.click(screen.getByRole('button', { name: copy.undo }));
  await waitFor(async () => {
    const entries = await handle.repo.q.entriesBetween(MOCK_USER_IDS.alice, '0000-01-01', '9999-12-31');
    expect(entries.min).toHaveLength(0);
    expect(entries.sessions.filter((session) => session.kind === 'min')).toHaveLength(0);
    expect(screen.getByTestId('my-week').textContent).toBe('0/3 · 0 MIN');
  });

  fireEvent.click(screen.getByRole('button', { name: copy.start }));
  expect(router.state.location.pathname).toBe('/session');
});

it('week text matches core on a Sunday night that is already Monday in UTC', async () => {
  const start = Date.parse('2026-10-25T23:30:00.000Z');
  const handle = await makeRepo('2026-10-25T23:30:00.000Z');
  const old = gymRow(MOCK_USER_IDS.alice, 1, '2026-10-25', '2026-10-25T20:00:00.000Z');
  const partner = gymRow(MOCK_USER_IDS.bob, 2, '2026-10-26', '2026-10-25T23:10:00.000Z');
  handle.seed({ sessions: [old.session, partner.session], sets: [old.set, partner.set] });
  await handle.pull();

  const first = await handle.repo.w.logRun({ distance_m: 5000, duration_s: 1500 });
  const secondAt = start + 1000;
  handle.setNow(secondAt);
  const second = await handle.repo.w.logRun({ distance_m: 3000, duration_s: 900 });
  const thirdAt = start + 2000;
  handle.setNow(thirdAt);
  const min = await handle.repo.w.logMin(copy.walk);
  expect(first.ok && second.ok && min.ok).toBe(true);

  renderFloor();
  const mine = await screen.findByTestId('my-week');
  const now = new Date().toISOString();
  const profile = await handle.repo.q.me();
  expect(profile?.tz).toBe('Europe/Amsterdam');
  expect(localDateOf(now, 'UTC')).toBe('2026-10-25');
  const weekStart = weekStartOf(localDateOf(now, profile!.tz));
  expect(weekStart).toBe('2026-10-26');
  const dates = weekDates(weekStart);
  const entries = await handle.repo.q.entriesBetween(profile!.id, dates[0]!, dates[6]!);
  const credits = weekCredits(entries, weekStart, profile!.weekly_target);
  const expected = line(credits.credits, profile!.weekly_target, credits.minCount);
  expect(expected).toBe('2/3 · 1 MIN');
  expect(mine.textContent).toBe(expected);

  const bob = (await handle.repo.q.profiles([MOCK_USER_IDS.bob]))[0];
  const bobStart = weekStartOf(localDateOf(now, bob!.tz));
  const bobDates = weekDates(bobStart);
  const bobEntries = await handle.repo.q.entriesBetween(bob!.id, bobDates[0]!, bobDates[6]!);
  const bobCredits = weekCredits(bobEntries, bobStart, bob!.weekly_target);
  const partnerLine = line(bobCredits.credits, bob!.weekly_target, bobCredits.minCount);
  expect(partnerLine).toBe('1/3 · 0 MIN');
  expect(screen.getByRole('heading', { name: 'Crewmate' })).toBeTruthy();
  expect(screen.getByTestId('partner-week').textContent).toBe(partnerLine);
  expect(screen.getByTestId('last-session').textContent).toBe('2026-10-26 · MIN');
});
