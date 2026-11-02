// @vitest-environment jsdom
import '../../data/harness.ts';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { RepoProvider } from '../../../../src/app/RepoProvider.tsx';
import { MOCK_CREW_ID, MOCK_USER_IDS, createMockRemote } from '../../../../src/data/adapter.mock.ts';
import { createClock } from '../../../../src/data/clock.ts';
import { IronpactDB } from '../../../../src/data/db.ts';
import { defaultProfile } from '../../../../src/data/defaults.ts';
import { createDataRepo } from '../../../../src/data/repo.ts';
import CrewScreen from '../../../../src/features/crew-feed/CrewScreen.tsx';
import FloorScreen from '../../../../src/features/floor/FloorScreen.tsx';
import { copy } from '../../../../src/ui/copy.ts';
import { ManualEnvironment } from '../../data/harness.ts';

let repo: ReturnType<typeof createDataRepo> | undefined;
let db: IronpactDB | undefined;
let peerClose: (() => void) | undefined;

afterEach(async () => {
  cleanup();
  peerClose?.();
  peerClose = undefined;
  repo?.close();
  await db?.delete();
  repo = undefined;
  db = undefined;
  window.history.pushState({}, '', '/');
});

it('runs the phase 3 demo on the mock backend', async () => {
  const now = Date.now();
  const environment = new ManualEnvironment();
  environment.setOnline(true);
  const remote = createMockRemote({ now: () => Date.now() });
  remote.seed('profiles', [{
    ...defaultProfile(MOCK_USER_IDS.bob, 'Europe/Amsterdam'),
    display_name: 'Crewmate', initial: 'C', color_hue: 220,
  }]);
  const subscribed = vi.spyOn(remote, 'subscribeCrew');
  const database = new IronpactDB(`ironpact-p3e-${crypto.randomUUID()}`);
  const created = createDataRepo(remote, {
    db: database,
    clock: createClock({ now: () => Date.now(), timezone: () => 'Europe/Amsterdam' }),
    environment,
    autoStart: false,
    realtime: true,
  });
  repo = created;
  db = database;
  await created.ready;
  await created.sync.pullNow();
  await vi.waitFor(() => expect(subscribed).toHaveBeenCalled());

  const router = createMemoryRouter([
    { path: '/', element: <><FloorScreen /><CrewScreen /></> },
    { path: '/session', element: <main>Session</main> },
    { path: '/log/:kind', element: <main>Log</main> },
    { path: '/crew', element: <main>Crew</main> },
    { path: '/settings', element: <main>Settings</main> },
  ], { initialEntries: ['/'] });
  render(<RepoProvider repo={created}><RouterProvider router={router} /></RepoProvider>);

  expect((await screen.findByTestId('bar-plates')).textContent).toContain('0');
  expect(document.querySelector(`[data-member="${MOCK_USER_IDS.bob}"][data-state="full"]`)).toBeNull();

  const peer = await remote.subscribeCrew(MOCK_CREW_ID, { onPresence() {}, onChange() {} });
  peerClose = () => peer.close();
  const started = new Date(now - 14 * 60_000).toISOString();
  peer.setPresence({
    user_id: MOCK_USER_IDS.bob,
    session_id: '00000000-0000-4000-8000-000000000099',
    kind: 'gym',
    exercise_label: 'Bench',
    set_no: 3,
    planned_sets: 5,
    started_at: started,
    last_active_at: new Date().toISOString(),
  });

  const banners = await screen.findAllByTestId('presence-banner');
  await waitFor(() => {
    const rows = screen.getAllByTestId('presence-banner');
    expect(rows.length).toBeGreaterThan(0);
    for (const banner of rows) {
      expect(banner.textContent).toContain('Crewmate is on the floor · Bench 3/5 ·');
      expect(banner.textContent).toMatch(/· \d+ min$/);
    }
  });
  expect(banners.length).toBeGreaterThan(0);

  const feed = await screen.findByRole('list', { name: copy.crewFeedTitle });
  expect(feed.children).toHaveLength(0);
  await remote.simulateCrewmateActivity();
  await waitFor(() => expect(feed.children.length).toBeGreaterThan(0), { timeout: 4000 });
  expect(feed.textContent).toContain('Bench press');
  await waitFor(() => {
    expect(document.querySelector(`[data-member="${MOCK_USER_IDS.bob}"][data-state="full"]`)).toBeTruthy();
  }, { timeout: 4000 });

  window.history.pushState({}, '', '/?debug=week');
  window.dispatchEvent(new PopStateEvent('popstate'));
  expect((await screen.findByTestId('bar-plates')).textContent).toContain('1');
  expect(screen.getByTestId('debug-week').textContent).toBe(copy.plateAdded);
  expect(screen.getByTestId('bar-tier').textContent).toBe('Iron');
});
