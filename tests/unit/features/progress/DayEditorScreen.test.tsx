// @vitest-environment jsdom
import './harness.tsx';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { weekStartOf } from '../../../../src/core/weeks.ts';
import { MOCK_CREW_ID } from '../../../../src/data/adapter.mock.ts';
import { copy, fill } from '../../../../src/ui/copy.ts';
import { DAY, progressHarness } from './harness.tsx';

let harness: Awaited<ReturnType<typeof progressHarness>> | undefined;

afterEach(async () => {
  cleanup();
  await harness?.close();
  harness = undefined;
});

async function openDay() {
  harness = await progressHarness();
  const run = await harness.repo.w.logRun({ distance_m: 5200, duration_s: 1660 });
  expect(run.ok).toBe(true);
  harness.render(`/day/${DAY}`);
  expect(await screen.findByRole('region', { name: copy.run })).toBeTruthy();
  return harness;
}

it('moves a run to another day and shows it only there', async () => {
  const opened = await openDay();
  const run = within(screen.getByRole('region', { name: copy.run }));
  fireEvent.change(run.getByLabelText(copy.dateLabel), { target: { value: '2026-10-25' } });
  fireEvent.click(run.getByRole('button', { name: copy.save }));

  await waitFor(() => {
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('2026-10-25');
  });
  expect(await screen.findByRole('region', { name: copy.run })).toBeTruthy();
  // The moved day re-reads live data; the empty state can flash before the run lands.
  await waitFor(() => {
    expect(screen.queryByText(copy.emptyDay)).toBeNull();
  });

  fireEvent.click(screen.getByRole('link', { name: DAY }));
  await waitFor(() => {
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(DAY);
  });
  await waitFor(() => {
    expect(screen.queryByRole('region', { name: copy.run })).toBeNull();
  });
  expect(screen.getByText(copy.emptyDay)).toBeTruthy();

  const moved = await opened.repo.q.day('2026-10-25');
  const left = await opened.repo.q.day(DAY);
  expect(moved.cardio).toHaveLength(1);
  expect(moved.sessions).toHaveLength(1);
  expect(moved.cardio[0]?.distance_m).toBe(5200);
  expect(left.cardio).toHaveLength(0);
  expect(left.sessions).toHaveLength(0);
  expect(screen.queryByText(copy.prsRecalculated)).toBeNull();
  expect(screen.queryByText(copy.barAdjusted)).toBeNull();
});

it('shows the copy-bank error for an out-of-range edit and does not save', async () => {
  const opened = await openDay();
  const exercise = await opened.repo.w.createExercise({
    name: 'Bench press', export_label: 'Bench press', kind: 'lift', category: 'compound', lower_body: false,
  });
  expect(exercise.ok).toBe(true);
  if (!exercise.ok) return;
  const started = await opened.repo.w.startSession({ kind: 'gym' });
  expect(started.ok).toBe(true);
  if (!started.ok) return;
  const logged = await opened.repo.w.logSet({ session_id: started.value.id, exercise_id: exercise.value.id, reps: 5, weight_kg: 80 });
  expect(logged.ok).toBe(true);
  await opened.repo.w.finishSession(started.value.id);
  cleanup();
  opened.render(`/day/${DAY}`);

  const updateEntry = vi.spyOn(opened.repo.w, 'updateEntry');
  const updateSet = vi.spyOn(opened.repo.w, 'updateSet');
  const run = within(await screen.findByRole('region', { name: copy.run }));
  fireEvent.change(run.getByLabelText(copy.distance), { target: { value: '101' } });
  fireEvent.change(run.getByLabelText(copy.dateLabel), { target: { value: '2026-10-25' } });
  fireEvent.click(run.getByRole('button', { name: copy.save }));
  expect((await run.findByTestId('error-distance')).textContent).toBe(copy.outOfRange);
  expect(updateEntry).not.toHaveBeenCalled();

  const set = within(await screen.findByRole('region', { name: 'Set 1' }));
  fireEvent.change(set.getByLabelText(copy.kg), { target: { value: '501' } });
  fireEvent.click(set.getByRole('button', { name: copy.save }));
  expect((await set.findByTestId('error-kg')).textContent).toBe(copy.outOfRange);
  expect(updateSet).not.toHaveBeenCalled();

  const sameDay = await opened.repo.q.day(DAY);
  const nextDay = await opened.repo.q.day('2026-10-25');
  expect(sameDay.cardio[0]?.distance_m).toBe(5200);
  expect(sameDay.sets[0]?.weight_kg).toBe(80);
  expect(nextDay.cardio).toHaveLength(0);
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(DAY);
});

it('soft-deletes a run and restores it on the same day', async () => {
  const opened = await openDay();
  fireEvent.click(screen.getByRole('button', { name: fill(copy.deleteEntry, { name: copy.run }) }));
  await waitFor(() => {
    expect(screen.queryByRole('region', { name: copy.run })).toBeNull();
  });
  expect((await opened.repo.q.day(DAY)).cardio).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: copy.restore }));
  expect(await screen.findByRole('region', { name: copy.run })).toBeTruthy();
  expect((await opened.repo.q.day(DAY)).cardio).toHaveLength(1);
  expect((await opened.repo.q.day(DAY)).sessions).toHaveLength(1);
});

it('shows the closed-week notice without a PR notice, and a run edit only when the PR changed', async () => {
  const opened = await openDay();
  await opened.repo.sync.pullNow();
  await opened.db.table('crew_weeks').put({
    crew_id: MOCK_CREW_ID,
    week_start: weekStartOf(DAY),
    statuses: {},
    plate_delta: 0,
    plates_after: 1,
    adjusted_after_edit: false,
    computed_at: '2026-10-26T00:05:00.000Z',
  });
  const run = within(screen.getByRole('region', { name: copy.run }));
  fireEvent.change(run.getByLabelText(copy.note), { target: { value: 'easy' } });
  fireEvent.click(run.getByRole('button', { name: copy.save }));
  expect(await screen.findByText(copy.barAdjusted)).toBeTruthy();
  expect(screen.queryByText(copy.prsRecalculated)).toBeNull();

  cleanup();
  await opened.close();
  const next = await progressHarness();
  harness = next;
  const early = await next.repo.w.logRun({ distance_m: 5000, duration_s: 1500 });
  expect(early.ok).toBe(true);
  if (!early.ok) return;
  await next.repo.w.updateSession(early.value.session_id, { started_at: '2026-10-20T08:00:00.000Z' });
  const longer = await next.repo.w.logRun({ distance_m: 8000, duration_s: 2400 });
  expect(longer.ok).toBe(true);
  if (!longer.ok) return;
  expect((await next.repo.w.recomputePrs(null)).ok).toBe(true);
  next.render(`/day/${DAY}`);
  const cards = await screen.findAllByRole('region', { name: copy.run });
  const longerCard = cards.find((node) => (within(node).getByLabelText(copy.distance) as HTMLInputElement).value === '8');
  if (!longerCard) throw new Error('missing 8 km run');
  const card = within(longerCard);
  expect(screen.queryByText(copy.prsRecalculated)).toBeNull();
  fireEvent.change(card.getByLabelText(copy.distance), { target: { value: '4' } });
  fireEvent.click(card.getByRole('button', { name: copy.save }));
  expect(await screen.findByText(copy.prsRecalculated)).toBeTruthy();
  expect(screen.queryByText(copy.barAdjusted)).toBeNull();
});
