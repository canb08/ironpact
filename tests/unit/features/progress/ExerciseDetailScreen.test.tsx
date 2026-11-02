// @vitest-environment jsdom
import './harness.tsx';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
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
