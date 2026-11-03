// @vitest-environment jsdom
import '../../data/harness.ts';
import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
import QuickLogScreen from '../../../../src/features/quicklog/QuickLogScreen.tsx';
import FloorScreen from '../../../../src/features/floor/FloorScreen.tsx';
import { copy } from '../../../../src/ui/copy.ts';
import { fixtureId, ManualEnvironment } from '../../data/harness.ts';

let repo: ReturnType<typeof createDataRepo> | undefined;
let db: IronpactDB | undefined;

afterEach(async () => {
  cleanup();
  localStorage.clear();
  repo?.close();
  await db?.delete();
  repo = undefined;
  db = undefined;
  vi.restoreAllMocks();
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
  // A6: the first pull runs in the background after `ready`; settle it before asserting.
  await created.sync.pullNow();
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
    { path: '/install', element: <main>Install</main> },
    { path: '/session', element: <main>Session</main> },
    { path: '/log/:kind', element: <QuickLogScreen /> },
    { path: '/crew', element: <main>Crew</main> },
    { path: '/settings', element: <main>Settings</main> },
    { path: '/day/:date', element: <main>Day</main> },
    { path: '/exercise/:id', element: <main>Exercise</main> },
  ], { initialEntries: ['/'] });
  render(
    <StrictMode>
      <RepoProvider repo={repo!}>
        <RouterProvider router={router} />
      </RepoProvider>
    </StrictMode>,
  );
  return router;
}

function plateLabel(name: string, credits: number, target: number) {
  return `${name} ${credits} of ${target}`;
}

it('opens MIN once as a sheet, saves through the repo, and shows a thin plate on return', async () => {
  const handle = await makeRepo('2026-10-24T12:00:00.000Z');
  const router = renderFloor();
  await screen.findByTestId('shared-bar');
  expect(screen.getByRole('img').getAttribute('aria-label')).toBe('You 0 of 3, Crewmate 0 of 3');
  expect(screen.getAllByRole('link', { name: copy.x3Min })).toHaveLength(1);
  expect(screen.queryByRole('button', { name: copy.x3Min })).toBeNull();
  expect(screen.getByRole('link', { name: copy.x3Run }).getAttribute('href')).toBe('/log/run');
  expect(screen.getByRole('link', { name: copy.x3Fight }).getAttribute('href')).toBe('/log/martial');
  expect(screen.getByRole('link', { name: copy.x3WeighIn }).getAttribute('href')).toBe('/log/weight');
  expect(screen.queryByTestId('week-streak')).toBeNull();
  expect(screen.getByText(copy.x3MinHint)).toBeTruthy();
  fireEvent.click(screen.getByRole('link', { name: copy.x3Min }));
  await screen.findByRole('dialog', { name: copy.x3Min });
  await waitFor(() => expect((screen.getByRole('button', { name: copy.save }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: copy.save }));
  await waitFor(async () => {
    const entries = await handle.repo.q.entriesBetween(MOCK_USER_IDS.alice, '0000-01-01', '9999-12-31');
    expect(entries.min).toHaveLength(1);
    expect(entries.min[0]?.description).toBe(copy.walk);
    expect(entries.sessions.filter((session) => session.kind === 'min')).toHaveLength(1);
  });
  fireEvent.click(screen.getByRole('button', { name: copy.close }));
  await screen.findByTestId('shared-bar');
  expect(screen.getByRole('img').getAttribute('aria-label')).toBe('You 0.5 of 3, Crewmate 0 of 3');
  expect(document.querySelectorAll('[data-side="you"] [data-plate="min"]')).toHaveLength(1);
  fireEvent.click(screen.getByRole('link', { name: copy.x3StartWorkout }));
  expect(router.state.location.pathname).toBe('/session');
});

it('keeps Floor and its links mounted while a crew pull refresh is pending', async () => {
  const handle = await makeRepo('2026-10-24T12:00:00.000Z');
  let crewChanged: (() => void) | undefined;
  const subscribe = handle.repo.duo.onCrewChange.bind(handle.repo.duo);
  vi.spyOn(handle.repo.duo, 'onCrewChange').mockImplementation((listener) => {
    crewChanged = listener;
    return subscribe(listener);
  });
  renderFloor();
  await screen.findByTestId('shared-bar');
  // Floor's PR hook also pulls on mount; finish that pull before seeding the next delta.
  await act(async () => { await handle.pull(); });
  const main = screen.getByRole('main');
  const weight = screen.getByRole('link', { name: copy.x3WeighIn });
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  const lastSummary = handle.repo.q.lastSessionSummary.bind(handle.repo.q);
  const refresh = vi.spyOn(handle.repo.q, 'lastSessionSummary').mockImplementation(async (id) => {
    await pending;
    return lastSummary(id);
  });
  const busyStates: (string | null)[] = [];
  const observer = new MutationObserver(() => { busyStates.push(main.getAttribute('aria-busy')); });
  observer.observe(main, { attributes: true, attributeFilter: ['aria-busy'] });
  const partner = gymRow(MOCK_USER_IDS.bob, 8, '2026-10-24', '2026-10-24T11:00:00.000Z');
  try {
    handle.seed({ sessions: [partner.session], sets: [partner.set] });
    await act(async () => {
      await handle.pull();
      const entries = await handle.repo.q.entriesBetween(MOCK_USER_IDS.bob, '2026-10-24', '2026-10-24');
      expect(entries.sessions).toHaveLength(1);
      // Explicitly invalidate as the crew realtime subscription does after its delta pull.
      crewChanged!();
    });
    await waitFor(() => { expect(refresh).toHaveBeenCalled(); });
    expect(main.getAttribute('aria-busy')).toBeNull();
    expect(screen.getByRole('link', { name: copy.x3WeighIn })).toBe(weight);
    await act(async () => { release(); });
    await waitFor(() => { expect(screen.getByRole('img').getAttribute('aria-label')).toContain('Crewmate 1 of 3'); });
    expect(screen.getByRole('main')).toBe(main);
    expect(screen.getByRole('link', { name: copy.x3WeighIn })).toBe(weight);
    expect(busyStates).not.toContain('true');
  } finally {
    release();
    observer.disconnect();
  }
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
  const mine = await screen.findByTestId('shared-bar');
  const now = new Date().toISOString();
  const profile = await handle.repo.q.me();
  expect(profile?.tz).toBe('Europe/Amsterdam');
  expect(localDateOf(now, 'UTC')).toBe('2026-10-25');
  const weekStart = weekStartOf(localDateOf(now, profile!.tz));
  expect(weekStart).toBe('2026-10-26');
  const dates = weekDates(weekStart);
  const entries = await handle.repo.q.entriesBetween(profile!.id, dates[0]!, dates[6]!);
  const credits = weekCredits(entries, weekStart, profile!.weekly_target);
  const expected = plateLabel('You', credits.credits, profile!.weekly_target);
  expect(expected).toBe('You 2 of 3');
  expect(mine.querySelector('[role="img"]')?.getAttribute('aria-label')).toContain(expected);

  const bob = (await handle.repo.q.profiles([MOCK_USER_IDS.bob]))[0];
  const bobStart = weekStartOf(localDateOf(now, bob!.tz));
  const bobDates = weekDates(bobStart);
  const bobEntries = await handle.repo.q.entriesBetween(bob!.id, bobDates[0]!, bobDates[6]!);
  const bobCredits = weekCredits(bobEntries, bobStart, bob!.weekly_target);
  const partnerLine = plateLabel('Crewmate', bobCredits.credits, bob!.weekly_target);
  expect(partnerLine).toBe('Crewmate 1 of 3');
  expect(screen.getByRole('img').getAttribute('aria-label')).toContain(partnerLine);
  expect(screen.getByRole('button', { name: /You: last workout\s*Today: MIN/ })).toBeTruthy();
});

it('shows friendly dates, exercise names and one personal volume stat; the last workout opens its day', async () => {
  const handle = await makeRepo('2026-11-02T12:00:00.000Z');
  const mine = gymRow(MOCK_USER_IDS.alice, 1, '2026-11-02', '2026-11-02T10:00:00.000Z');
  const partner = gymRow(MOCK_USER_IDS.bob, 2, '2026-11-02', '2026-11-02T11:00:00.000Z');
  const warmup = { ...mine.set, id: fixtureId(99), is_warmup: true, weight_kg: 100 };
  handle.seed({ sessions: [mine.session, partner.session], sets: [mine.set, partner.set, warmup] });
  await handle.pull();
  const router = renderFloor();
  await screen.findByTestId('shared-bar');
  expect(screen.getByText(copy.x5Today, { selector: 'time' })).toBeTruthy();
  expect(screen.getAllByText('400 kg moved this week')).toHaveLength(1);
  expect(screen.getAllByText('Today: Bench press 5 × 80 kg')).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: /You: last workout/ }));
  expect(router.state.location.pathname).toBe('/day/2026-11-02');
});

it('shows only this week’s personal records and opens the recorded exercise', async () => {
  const handle = await makeRepo('2026-11-02T12:00:00.000Z');
  const fields = { id: fixtureId(150), user_id: MOCK_USER_IDS.alice,
    exercise_id: MOCK_EXERCISE_ID, source_id: fixtureId(151), pr_type: 'e1rm' as const,
    reps: null, value: 100, previous_value: 90, pct_over_previous: 11,
    seen_by: [], local_date: '2026-11-02', client_updated_at: '2026-11-02T10:00:00.000Z', deleted_at: null };
  vi.spyOn(handle.repo.q, 'prEvents').mockResolvedValue([fields, { ...fields, id: fixtureId(152), local_date: '2026-11-03' }]);
  const router = renderFloor();
  await screen.findByTestId('shared-bar');
  expect(screen.getAllByText(copy.x3Pr, { exact: true })).toHaveLength(1);
  expect(screen.getByText('Today: Estimated 1-rep max, 100 kg')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Bench press.*Estimated 1-rep max/ }));
  expect(router.state.location.pathname).toBe(`/exercise/${MOCK_EXERCISE_ID}`);
});
