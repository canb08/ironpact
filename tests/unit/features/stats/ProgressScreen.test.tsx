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
import { bodyweight, exercise, id, profile, session, set } from '../../core/fixtures.ts';

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

it('shows the empty sentence and no chart when nothing is logged', () => {
  renderProgress(data());
  expect(screen.getByText(copy.emptyProgress)).toBeTruthy();
  expect(document.querySelector('polyline')).toBeNull();
  for (const name of [copy.progressRun, copy.progressMartial, copy.progressBody]) {
    fireEvent.click(screen.getByRole('tab', { name }));
    expect(screen.getByText(copy.emptyProgress)).toBeTruthy();
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
  const link = screen.getByRole('link', { name: exercise.name });
  expect(link.getAttribute('href')).toBe(`/exercise/${exercise.id}`);
  expect(document.querySelector('.progress-line--you')).toBeTruthy();
  expect(screen.getByRole('table', { name: `${exercise.name}. Best e1RM over 12 weeks.` })).toBeTruthy();
});

it('draws the 7-day average on Body and stays empty below two weigh-ins', () => {
  const one = renderProgress(data({
    mine: { ...emptyBundle(), bodyweight: [{ ...bodyweight, user_id: profile.id, local_date: '2026-10-01', weight_kg: 80 }] },
  }));
  fireEvent.click(screen.getByRole('tab', { name: copy.progressBody }));
  expect(screen.getByText(copy.emptyProgress)).toBeTruthy();
  expect(document.querySelector('polyline')).toBeNull();
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
  fireEvent.click(screen.getByRole('tab', { name: copy.progressBody }));
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
  fireEvent.click(screen.getByRole('button', { name: 'Show Crewmate' }));
  expect(document.querySelector('.progress-line--partner')?.getAttribute('stroke-dasharray')).toBe('5 4');
  expect(document.body.textContent).not.toContain(String(heavy));
  fireEvent.click(screen.getByRole('tab', { name: copy.progressBody }));
  expect(document.body.textContent).not.toContain(String(heavy));
  expect(document.body.textContent).toContain('%');
});
