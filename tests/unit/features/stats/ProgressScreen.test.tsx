// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { MemoryRouter } from 'react-router';
import type { Exercise, Session, SetRow } from '../../../../src/core/types.ts';
import { movingAverage7 } from '../../../../src/features/stats/body.ts';
import { emptyBundle, type ProgressData } from '../../../../src/features/stats/bundle.ts';
import { ProgressView } from '../../../../src/features/stats/ProgressScreen.tsx';
import { trendWindow } from '../../../../src/features/stats/trend.ts';
import { copy } from '../../../../src/ui/copy.ts';
import { bodyweight, cardio, martial, exercise, id, profile, session, set } from '../../core/fixtures.ts';

const window = trendWindow('2026-11-02');
const partnerId = id(20);

function data(patch: Partial<ProgressData> = {}): ProgressData {
  return {
    me: profile,
    window,
    lifts: [exercise],
    partners: [],
    mine: emptyBundle(),
    bundles: new Map(),
    prs: [],
    ...patch,
  };
}

function renderProgress(value: ProgressData | null) {
  return render(
    <MemoryRouter>
      <ProgressView data={value} />
    </MemoryRouter>,
  );
}

it('teaches a distinct logging action on every empty tab', () => {
  renderProgress(data());
  for (const [name, empty] of [
    [copy.progressLifts, copy.x5LiftsEmpty], [copy.x5Cardio, copy.x5CardioEmpty],
    [copy.x5Fight, copy.x5FightEmpty], [copy.progressBody, copy.x5BodyEmpty],
  ]) {
    fireEvent.click(screen.getByRole('radio', { name }));
    expect(screen.getByText(empty!)).toBeTruthy();
    expect(document.querySelector('polyline')).toBeNull();
  }
});

it('links each lift with two sessions to its exercise page and draws a sparkline', () => {
  const sessions: Session[] = [
    { ...session, id: id(30), user_id: profile.id, local_date: '2026-09-01', started_at: '2026-09-01T08:00:00.000Z' },
    { ...session, id: id(31), user_id: profile.id, local_date: '2026-10-01', started_at: '2026-10-01T08:00:00.000Z' },
  ];
  const sets: SetRow[] = [
    { ...set, id: id(40), user_id: profile.id, session_id: id(30), exercise_id: exercise.id, local_date: '2026-09-01', weight_kg: 60, reps: 1 },
    { ...set, id: id(41), user_id: profile.id, session_id: id(31), exercise_id: exercise.id, local_date: '2026-10-01', weight_kg: 80, reps: 1 },
  ];
  renderProgress(data({
    mine: { ...emptyBundle(), sessions, sets },
  }));
  const link = screen.getByRole('link', { name: new RegExp(exercise.name) });
  expect(link.getAttribute('href')).toBe(`/exercise/${exercise.id}`);
  expect(document.querySelector('.progress-line--you')).toBeTruthy();
  expect(screen.getByRole('table', { name: `${exercise.name}. Best estimated 1-rep max over 12 weeks.` })).toBeTruthy();
});

it('shows the first weigh-in immediately and draws the 7-day average', () => {
  const one = renderProgress(data({
    mine: { ...emptyBundle(), bodyweight: [{ ...bodyweight, user_id: profile.id, local_date: '2026-10-01', weight_kg: 80 }] },
  }));
  fireEvent.click(screen.getByRole('radio', { name: copy.progressBody }));
  expect(screen.getByText('Latest weigh-in: 80 kg')).toBeTruthy();
  expect(document.querySelector('.progress-dot--weight')).toBeTruthy();
  one.unmount();

  const rows = [70, 71, 72, 73, 74, 75, 76].map((kg, index) => ({
    ...bodyweight,
    id: id(80 + index),
    user_id: profile.id,
    local_date: `2026-10-0${index + 1}`,
    weight_kg: kg,
    measured_at: `2026-10-0${index + 1}T08:00:00.000Z`,
  }));
  const average = movingAverage7(rows, profile.id).at(-1)?.averageKg;
  renderProgress(data({ mine: { ...emptyBundle(), bodyweight: rows } }));
  fireEvent.click(screen.getByRole('radio', { name: copy.progressBody }));
  expect(document.querySelector('.progress-line--you')).toBeTruthy();
  expect(document.querySelector('.progress-line--weight')).toBeTruthy();
  const table = screen.getByRole('table', { name: copy.progressBodyCaption });
  expect(table.textContent).toContain('73');
  expect(average).toBe(73);
});

it('rebases a partner overlay and never prints the partner raw kilograms', () => {
  const heavy = 213.7;
  const partner = { ...profile, id: partnerId, display_name: 'Crewmate', show_bodyweight: true, color_hue: 220 };
  const bench: Exercise = exercise;
  const sessions: Session[] = [
    { ...session, id: id(30), user_id: profile.id, local_date: '2026-09-01', started_at: '2026-09-01T08:00:00.000Z' },
    { ...session, id: id(31), user_id: profile.id, local_date: '2026-10-01', started_at: '2026-10-01T08:00:00.000Z' },
    { ...session, id: id(32), user_id: partnerId, local_date: '2026-09-08', started_at: '2026-09-08T08:00:00.000Z' },
    { ...session, id: id(33), user_id: partnerId, local_date: '2026-10-08', started_at: '2026-10-08T08:00:00.000Z' },
  ];
  const sets: SetRow[] = [
    { ...set, id: id(40), user_id: profile.id, session_id: id(30), exercise_id: bench.id, weight_kg: 60, reps: 1 },
    { ...set, id: id(41), user_id: profile.id, session_id: id(31), exercise_id: bench.id, weight_kg: 80, reps: 1 },
    { ...set, id: id(42), user_id: partnerId, session_id: id(32), exercise_id: bench.id, weight_kg: heavy, reps: 1 },
    { ...set, id: id(43), user_id: partnerId, session_id: id(33), exercise_id: bench.id, weight_kg: heavy, reps: 1 },
  ];
  const weighIns = [1, 2].map((day) => ({
    ...bodyweight,
    id: id(90 + day),
    user_id: partnerId,
    local_date: `2026-10-0${day}`,
    weight_kg: heavy,
    measured_at: `2026-10-0${day}T08:00:00.000Z`,
  }));
  renderProgress(data({
    partners: [partner],
    mine: {
      ...emptyBundle(),
      sessions: sessions.filter((row) => row.user_id === profile.id),
      sets: sets.filter((row) => row.user_id === profile.id),
      bodyweight: [70, 71, 72, 73, 74, 75, 76].map((kg, index) => ({
        ...bodyweight,
        id: id(100 + index),
        user_id: profile.id,
        local_date: `2026-10-0${index + 1}`,
        weight_kg: kg,
        measured_at: `2026-10-0${index + 1}T08:00:00.000Z`,
      })),
    },
    bundles: new Map([[partnerId, {
      ...emptyBundle(),
      sessions: sessions.filter((row) => row.user_id === partnerId),
      sets: sets.filter((row) => row.user_id === partnerId),
      bodyweight: weighIns,
    }]]),
  }));
  fireEvent.click(screen.getByRole('switch', { name: 'Show Crewmate' }));
  expect(document.querySelector('.progress-line--partner')?.getAttribute('stroke-dasharray')).toBe('5 4');
  expect(document.body.textContent).not.toContain(String(heavy));
  fireEvent.click(screen.getByRole('radio', { name: copy.progressBody }));
  expect(document.body.textContent).not.toContain(String(heavy));
  expect(document.body.textContent).toContain('%');
});

it('shows a first run and a first fight session, with real weekly rounds', () => {
  renderProgress(data({ mine: { ...emptyBundle(),
    sessions: [{ ...session, id: id(30), user_id: profile.id, local_date: '2026-11-02' }],
    cardio: [{ ...cardio, user_id: profile.id, session_id: id(30), activity: 'Run', distance_m: 5000, duration_s: 1800 }],
    martial: [{ ...martial, user_id: profile.id, session_id: id(30), discipline: 'Boxing', duration_min: 40, rounds: 8 }],
  } }));
  fireEvent.click(screen.getByRole('radio', { name: copy.x5Cardio }));
  expect(screen.getByText('Latest run: 5 km at 6:00 per km')).toBeTruthy();
  expect(screen.queryByText(copy.x5CardioEmpty)).toBeNull();
  fireEvent.click(screen.getByRole('radio', { name: copy.x5Fight }));
  expect(screen.getByText('Today: 40 min, 8 rounds')).toBeTruthy();
  expect(screen.queryByText(copy.x5FightEmpty)).toBeNull();
});

it('keeps a stored Boxing row and lists Muay Thai combos newest first', () => {
  renderProgress(data({ mine: { ...emptyBundle(),
    sessions: [
      { ...session, id: id(30), user_id: profile.id, local_date: '2026-11-01' },
      { ...session, id: id(31), user_id: profile.id, local_date: '2026-11-02' },
    ],
    martial: [
      { ...martial, id: id(70), user_id: profile.id, session_id: id(30), local_date: '2026-11-01', discipline: 'Boxing', duration_min: 40, rounds: 8, note: 'drilled guard', logged_at: '2026-11-01T18:00:00.000Z' },
      { ...martial, id: id(71), user_id: profile.id, session_id: id(31), local_date: '2026-11-02', discipline: 'Muay Thai', duration_min: 38, rounds: 6, note: 'Pads · 1-2 / Teep', logged_at: '2026-11-02T18:00:00.000Z' },
      { ...martial, id: id(72), user_id: profile.id, session_id: id(31), local_date: '2026-11-02', discipline: 'Muay Thai', duration_min: 18, rounds: 6, note: 'Pads · 1-2', logged_at: '2026-11-02T12:00:00.000Z' },
    ],
  } }));
  fireEvent.click(screen.getByRole('radio', { name: copy.x5Fight }));
  expect(screen.getByRole('heading', { name: 'Boxing' })).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Muay Thai' })).toBeTruthy();
  const book = screen.getByRole('region', { name: copy.y2ComboBook });
  const items = [...book.querySelectorAll('li')].map((item) => item.textContent);
  expect(items).toEqual(['1-2, drilled 2', 'Teep, drilled 1']);
  expect(book.textContent).not.toContain('drilled guard');
});

it('formats chart table dates without changing the chart coordinates', () => {
  renderProgress(data({ mine: {
    ...emptyBundle(),
    sessions: [
      { ...session, id: id(80), user_id: profile.id, local_date: '2026-10-01' },
      { ...session, id: id(81), user_id: profile.id, local_date: '2026-10-08' },
    ],
    sets: [
      { ...set, id: id(82), user_id: profile.id, session_id: id(80), exercise_id: exercise.id, local_date: '2026-10-01' },
      { ...set, id: id(83), user_id: profile.id, session_id: id(81), exercise_id: exercise.id, local_date: '2026-10-08' },
    ],
    cardio: [
      { ...cardio, id: id(84), session_id: id(80), user_id: profile.id, local_date: '2026-10-01' },
      { ...cardio, id: id(85), session_id: id(81), user_id: profile.id, local_date: '2026-10-08' },
    ],
    bodyweight: [
      { ...bodyweight, id: id(86), user_id: profile.id, local_date: '2026-10-01' },
      { ...bodyweight, id: id(87), user_id: profile.id, local_date: '2026-10-08' },
    ],
  } }));
  for (const name of [copy.progressLifts, copy.x5Cardio, copy.progressBody]) {
    fireEvent.click(screen.getByRole('radio', { name }));
    const cells = document.querySelectorAll('table td');
    expect(cells.length).toBeGreaterThan(0);
    for (const cell of cells) expect(cell.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    const lines = document.querySelectorAll('polyline');
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) expect(line.getAttribute('points')).not.toMatch(/NaN|Infinity/);
  }
});
