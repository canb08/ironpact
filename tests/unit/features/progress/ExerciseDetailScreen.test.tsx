// @vitest-environment jsdom
import './harness.tsx';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { loadPreview } from '../../../../src/features/export/export.ts';
import { copy, fill } from '../../../../src/ui/copy.ts';
import { progressHarness } from './harness.tsx';

let harness: Awaited<ReturnType<typeof progressHarness>> | undefined;

afterEach(async () => {
  cleanup();
  await harness?.close();
  harness = undefined;
});

it('shows history and best e1RM, saves rest seconds, and stores big jumps on the profile', async () => {
  harness = await progressHarness();
  const exercise = await harness.repo.w.createExercise({
    name: 'Bench press', export_label: 'Bench press', kind: 'lift', category: 'compound', lower_body: true,
  });
  expect(exercise.ok).toBe(true);
  if (!exercise.ok) return;
  const started = await harness.repo.w.startSession({ kind: 'gym' });
  expect(started.ok).toBe(true);
  if (!started.ok) return;
  await harness.repo.w.logSet({
    session_id: started.value.id, exercise_id: exercise.value.id, reps: 5, weight_kg: 80, is_warmup: true,
  });
  await harness.repo.w.logSet({
    session_id: started.value.id, exercise_id: exercise.value.id, reps: 5, weight_kg: 80,
  });
  await harness.repo.w.finishSession(started.value.id);
  harness.render(`/exercise/${exercise.value.id}`);

  expect((await screen.findByTestId('best-e1rm')).textContent).toContain('93.3');
  expect(screen.getByText(fill(copy.setLine, { index: 2, reps: 5, kg: 80 }))).toBeTruthy();
  const rest = screen.getByRole('textbox', { name: copy.restSeconds }) as HTMLInputElement;
  expect(rest.value).toBe('120');

  const savePref = vi.spyOn(harness.repo.w, 'setExercisePref');
  fireEvent.change(rest, { target: { value: '14' } });
  fireEvent.click(screen.getByRole('button', { name: copy.saveRest }));
  expect((await screen.findByTestId('error-rest')).textContent).toBe(copy.restRange);
  expect(savePref).not.toHaveBeenCalled();
  expect(await harness.repo.q.exercisePref(exercise.value.id)).toBeUndefined();

  fireEvent.change(screen.getByRole('textbox', { name: copy.restSeconds }), { target: { value: '45' } });
  fireEvent.click(screen.getByRole('button', { name: copy.saveRest }));
  await waitFor(async () => {
    expect((await harness!.repo.q.exercisePref(exercise.value.id))?.rest_s).toBe(45);
  });

  fireEvent.click(screen.getByRole('checkbox', { name: copy.bigJumps }));
  await waitFor(async () => {
    expect((await harness!.repo.q.me())?.big_jumps).toBe(true);
  });
  expect((screen.getByRole('checkbox', { name: copy.bigJumps }) as HTMLInputElement).checked).toBe(true);
});

it('editing a set kg updates the list and the export preview', async () => {
  harness = await progressHarness();
  const exercise = await harness.repo.w.createExercise({
    name: 'Bench press', export_label: 'Bench press', kind: 'lift', category: 'compound', lower_body: false,
  });
  expect(exercise.ok).toBe(true);
  if (!exercise.ok) return;
  const started = await harness.repo.w.startSession({ kind: 'gym' });
  expect(started.ok).toBe(true);
  if (!started.ok) return;
  const logged = await harness.repo.w.logSet({
    session_id: started.value.id, exercise_id: exercise.value.id, reps: 5, weight_kg: 80,
  });
  expect(logged.ok).toBe(true);
  await harness.repo.w.finishSession(started.value.id);
  harness.render(`/exercise/${exercise.value.id}`);

  const line = fill(copy.setLine, { index: 1, reps: 5, kg: 80 });
  const region = within(await screen.findByRole('region', { name: fill(copy.sessionSet, { index: 1 }) }));
  expect(region.getByText(line)).toBeTruthy();
  fireEvent.click(region.getByRole('button', { name: fill(copy.editSet, { index: 1 }) }));
  fireEvent.change(region.getByLabelText(copy.kg), { target: { value: '85' } });
  fireEvent.click(region.getByRole('button', { name: copy.save }));

  const next = fill(copy.setLine, { index: 1, reps: 5, kg: 85 });
  await waitFor(() => {
    expect(screen.getByText(next)).toBeTruthy();
  });
  expect(screen.queryByText(line)).toBeNull();

  const me = await harness.repo.q.me();
  expect(me).toBeDefined();
  if (!me) return;
  // Preview is the last 7 local days. The harness clock is 2026-10-24, so pin `now` there.
  const preview = await loadPreview(harness.repo, me, new Date('2026-10-24T12:00:00.000Z'));
  expect(preview.body).toContain('1×5×85kg');
  expect(preview.body).not.toContain('80kg');
});

it('soft-deletes a set and restores it onto the list and the export preview', async () => {
  harness = await progressHarness();
  const exercise = await harness.repo.w.createExercise({
    name: 'Bench press', export_label: 'Bench press', kind: 'lift', category: 'compound', lower_body: false,
  });
  expect(exercise.ok).toBe(true);
  if (!exercise.ok) return;
  const started = await harness.repo.w.startSession({ kind: 'gym' });
  expect(started.ok).toBe(true);
  if (!started.ok) return;
  await harness.repo.w.logSet({
    session_id: started.value.id, exercise_id: exercise.value.id, reps: 5, weight_kg: 80,
  });
  await harness.repo.w.finishSession(started.value.id);
  harness.render(`/exercise/${exercise.value.id}`);

  const line = fill(copy.setLine, { index: 1, reps: 5, kg: 80 });
  const region = within(await screen.findByRole('region', { name: fill(copy.sessionSet, { index: 1 }) }));
  fireEvent.click(region.getByRole('button', { name: fill(copy.deleteEntry, { name: fill(copy.sessionSet, { index: 1 }) }) }));
  await waitFor(() => {
    expect(screen.queryByText(line)).toBeNull();
  });
  const me = await harness.repo.q.me();
  expect(me).toBeDefined();
  if (!me) return;
  const gone = await loadPreview(harness.repo, me, new Date('2026-10-24T12:00:00.000Z'));
  expect(gone.body).not.toContain('80kg');

  fireEvent.click(screen.getByRole('button', { name: copy.restore }));
  await waitFor(() => {
    expect(screen.getByText(line)).toBeTruthy();
  });
  const back = await loadPreview(harness.repo, me, new Date('2026-10-24T12:00:00.000Z'));
  expect(back.body).toContain('1×5×80kg');
});
