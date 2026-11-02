// @vitest-environment jsdom
import '../../data/harness.ts';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { localDateOf } from '../../../../src/core/weeks.ts';
import { MOCK_USER_IDS, createMockRemote } from '../../../../src/data/adapter.mock.ts';
import { createClock } from '../../../../src/data/clock.ts';
import { IronpactDB } from '../../../../src/data/db.ts';
import { defaultProfile } from '../../../../src/data/defaults.ts';
import { bodyweightId } from '../../../../src/data/ids.ts';
import { createDataRepo } from '../../../../src/data/repo.ts';
import { RepoProvider } from '../../../../src/app/RepoProvider.tsx';
import QuickLogScreen from '../../../../src/features/quicklog/QuickLogScreen.tsx';
import { copy, fill } from '../../../../src/ui/copy.ts';
import { ManualEnvironment } from '../../data/harness.ts';

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

async function makeRepo() {
  const instant = Date.parse('2026-10-24T12:00:00.000Z');
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
  return created;
}

function renderLog(path: string) {
  const router = createMemoryRouter([
    { path: '/log/:kind', element: <QuickLogScreen /> },
    { path: '/', element: <main>Floor</main> },
  ], { initialEntries: [path] });
  render(
    <RepoProvider repo={repo!}>
      <RouterProvider router={router} />
    </RepoProvider>,
  );
}

function setField(label: string, value: string) {
  fireEvent.change(screen.getByRole('textbox', { name: label }), { target: { value } });
}

it('shows the copy for each quick-log range error and does not save', async () => {
  const created = await makeRepo();
  const cases: { path: string; fill: () => void; id: string; text: string }[] = [
    { path: '/log/run', fill: () => { setField(copy.distance, '101'); setField(copy.duration, '30:00'); }, id: 'error-distance', text: copy.outOfRange },
    { path: '/log/run', fill: () => { setField(copy.distance, '0'); setField(copy.duration, '30:00'); }, id: 'error-distance', text: copy.outOfRange },
    { path: '/log/run', fill: () => { setField(copy.distance, '5'); setField(copy.duration, '24:00:00'); }, id: 'error-duration', text: copy.outOfRange },
    { path: '/log/run', fill: () => { setField(copy.distance, '5'); setField(copy.duration, '0:00'); }, id: 'error-duration', text: copy.outOfRange },
    { path: '/log/weight', fill: () => setField(copy.weight, '250.1'), id: 'error-weight', text: copy.outOfRange },
    { path: '/log/weight', fill: () => setField(copy.weight, '29.9'), id: 'error-weight', text: copy.outOfRange },
    { path: '/log/min', fill: () => setField(copy.minLabel, 'a'.repeat(41)), id: 'error-min', text: copy.keepTo40 },
    { path: '/log/min', fill: () => setField(copy.minLabel, ''), id: 'error-min', text: copy.keepTo40 },
  ];

  for (const item of cases) {
    cleanup();
    renderLog(item.path);
    if (item.path === '/log/min') {
      await waitFor(() => {
        expect((screen.getByRole('textbox', { name: copy.minLabel }) as HTMLInputElement).value).toBe(copy.walk);
      });
    } else {
      expect(await screen.findByRole('button', { name: copy.save })).toBeTruthy();
    }
    item.fill();
    fireEvent.click(screen.getByRole('button', { name: copy.save }));
    expect((await screen.findByTestId(item.id)).textContent).toBe(item.text);
  }

  const entries = await created.q.entriesBetween(MOCK_USER_IDS.alice, '0000-01-01', '9999-12-31');
  expect(entries.cardio).toHaveLength(0);
  expect(entries.martial).toHaveLength(0);
  expect(entries.min).toHaveLength(0);
  expect(entries.bodyweight).toHaveLength(0);
});

it('shows live pace for a valid run', async () => {
  await makeRepo();
  renderLog('/log/run');
  setField(copy.distance, '5.2');
  setField(copy.duration, '27:40');
  expect(screen.getByTestId('pace').textContent).toBe(fill(copy.paceLine, { time: '5:19' }));
});

it('weight twice on the same day keeps one uuidv5 row', async () => {
  const created = await makeRepo();
  renderLog('/log/weight');
  const input = await screen.findByRole('textbox', { name: copy.weight });
  fireEvent.change(input, { target: { value: '80.2' } });
  fireEvent.click(screen.getByRole('button', { name: copy.save }));
  expect(await screen.findByText("Replaces today's 80.2.")).toBeTruthy();
  fireEvent.change(input, { target: { value: '79.8' } });
  fireEvent.click(screen.getByRole('button', { name: copy.save }));
  const date = localDateOf(new Date().toISOString(), 'Europe/Amsterdam');
  await waitFor(async () => {
    const entries = await created.q.entriesBetween(MOCK_USER_IDS.alice, date, date);
    expect(entries.bodyweight).toHaveLength(1);
    expect(entries.bodyweight[0]?.weight_kg).toBe(79.8);
    expect(entries.bodyweight[0]?.id).toBe(bodyweightId(MOCK_USER_IDS.alice, date));
  });
  expect(await screen.findByText("Replaces today's 79.8.")).toBeTruthy();
});

it('logs the usual Muay Thai class in one tap, with no discipline picker', async () => {
  const created = await makeRepo();
  renderLog('/log/martial');
  expect((await screen.findByTestId('class-rounds')).textContent).toBe('6 struck · 6 held');
  expect(screen.getByTestId('class-minutes').textContent).toBe('~60 min');
  expect(screen.getByTestId('class-body').textContent).toBe('60 push-ups + 60 squats');
  expect(screen.getByTestId('class-note').textContent).toBe('Pads');
  expect(screen.queryByRole('textbox')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: copy.y2LogClass }));
  await waitFor(async () => {
    const entries = await created.q.entriesBetween(MOCK_USER_IDS.alice, '0000-01-01', '9999-12-31');
    expect(entries.martial).toHaveLength(1);
    expect(entries.martial[0]).toMatchObject({
      discipline: 'Muay Thai',
      duration_min: 60,
      rounds: 6,
      rpe: null,
      note: 'Pads',
    });
  });
});

it('adjusts to 2 combos per half and stores the combo you remember', async () => {
  const created = await makeRepo();
  renderLog('/log/martial');
  fireEvent.click(await screen.findByRole('button', { name: copy.y2Adjust }));
  fireEvent.keyDown(screen.getByRole('slider', { name: copy.y2CombosHalf }), { key: 'ArrowDown' });
  expect(screen.getByTestId('class-rounds').textContent).toBe('4 struck · 4 held');
  expect(screen.getByTestId('class-body').textContent).toBe('40 push-ups + 40 squats');
  fireEvent.click(screen.getByRole('button', { name: '1' }));
  fireEvent.click(screen.getByRole('button', { name: '2' }));
  fireEvent.click(screen.getByRole('button', { name: 'R kick' }));
  expect(screen.getByTestId('combo-draft').textContent).toBe('1-2-R kick');
  fireEvent.click(screen.getByRole('button', { name: fill(copy.y2FeelChip, { n: 3 }) }));
  fireEvent.click(screen.getByRole('button', { name: copy.y2LogClass }));
  await waitFor(async () => {
    const entries = await created.q.entriesBetween(MOCK_USER_IDS.alice, '0000-01-01', '9999-12-31');
    expect(entries.martial).toHaveLength(1);
    expect(entries.martial[0]).toMatchObject({
      discipline: 'Muay Thai',
      duration_min: 60,
      rounds: 4,
      rpe: 8,
      note: 'Pads · 1-2-R kick',
    });
  });
});

it('copies minutes, rounds and focus from the last class', async () => {
  const created = await makeRepo();
  const seeded = await created.w.logMartial({
    discipline: 'Muay Thai',
    duration_min: 45,
    rounds: 4,
    rpe: 9,
    note: 'Clinch',
  });
  expect(seeded.ok).toBe(true);
  renderLog('/log/martial');
  fireEvent.click(await screen.findByRole('button', { name: copy.y2Adjust }));
  await waitFor(() => {
    expect(screen.getByRole('button', { name: copy.y2Same }).hasAttribute('disabled')).toBe(false);
  });
  fireEvent.click(screen.getByRole('button', { name: copy.y2Same }));
  expect(screen.getByRole('heading', { name: 'Clinch' })).toBeTruthy();
  expect(screen.getByTestId('class-minutes').textContent).toBe('~45 min');
  expect(screen.getByTestId('class-rounds').textContent).toBe('4 rounds');
  expect(screen.getByRole('button', { name: 'Feel 4' }).getAttribute('aria-pressed')).toBe('true');
});

