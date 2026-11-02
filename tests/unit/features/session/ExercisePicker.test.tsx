// @vitest-environment jsdom
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExercisePicker } from '../../../../src/features/session/ExercisePicker.tsx';
import { copy } from '../../../../src/ui';
import { unwrap } from '../../data/harness.ts';
import { sessionHarness } from './harness.tsx';

describe('S7 with the A6 mock Repo', () => {
  let harness: Awaited<ReturnType<typeof sessionHarness>>;
  beforeEach(async () => { harness = await sessionHarness(); });
  afterEach(async () => { cleanup(); vi.restoreAllMocks(); await harness.close(); });

  it('searches the catalogue and selects a match', async () => {
    const bench = await harness.exercise();
    await harness.exercise('Squat');
    const select = vi.fn();
    const close = vi.fn();
    harness.render(<ExercisePicker open onSelect={select} onClose={close} />);
    await screen.findByRole('button', { name: 'Bench press' });
    await userEvent.type(screen.getByRole('searchbox', { name: copy.pickerSearch }), 'BENCH');
    expect(screen.queryByRole('button', { name: 'Squat' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Bench press' }));
    expect(select).toHaveBeenCalledWith(bench);
    expect(close).toHaveBeenCalledOnce();
  });

  it('creates a searchable exercise offline and selects the saved row', async () => {
    const select = vi.fn();
    harness.render(<ExercisePicker open onSelect={select} onClose={() => {}} />);
    await userEvent.type(screen.getByRole('searchbox'), 'Cable curl');
    await userEvent.click(screen.getByRole('button', { name: copy.pickerCreate }));
    expect((screen.getByRole('textbox', { name: copy.pickerName }) as HTMLInputElement).value).toBe('Cable curl');
    await userEvent.click(screen.getByRole('checkbox', { name: copy.pickerIsolation }));
    await userEvent.click(screen.getByRole('button', { name: copy.pickerCreate }));
    await screen.findByRole('button', { name: 'Cable curl' });
    const exercise = (await harness.repo.q.exercises())[0]!;
    expect(exercise).toMatchObject({ name: 'Cable curl', export_label: 'Cable curl', category: 'isolation', kind: 'lift' });
    expect(select).toHaveBeenCalledWith(exercise);
    expect(await harness.repo.q.isPending(exercise.id)).toBe(true);
  });

  it('shows duplicate-label feedback and rejects reserved labels before writing', async () => {
    await harness.exercise('Cable curl');
    harness.render(<ExercisePicker open onSelect={() => {}} onClose={() => {}} />);
    await userEvent.type(screen.getByRole('searchbox'), 'Cable curl');
    await userEvent.click(screen.getByRole('button', { name: copy.pickerCreate }));
    const create = vi.spyOn(harness.repo.w, 'createExercise');
    await userEvent.clear(screen.getByRole('textbox', { name: copy.pickerExportLabel }));
    await userEvent.type(screen.getByRole('textbox', { name: copy.pickerExportLabel }), 'Run');
    await userEvent.click(screen.getByRole('button', { name: copy.pickerCreate }));
    expect(screen.getByRole('alert').textContent).toBe(copy.pickerInvalid);
    expect(create).not.toHaveBeenCalled();
    await userEvent.clear(screen.getByRole('textbox', { name: copy.pickerExportLabel }));
    await userEvent.type(screen.getByRole('textbox', { name: copy.pickerExportLabel }), 'Cable curl');
    await userEvent.click(screen.getByRole('button', { name: copy.pickerCreate }));
    expect((await screen.findByRole('alert')).textContent).toBe(copy.pickerDuplicate);
    expect(await harness.repo.q.exercises()).toHaveLength(1);
  });

  it('renders exactly the recent eight in last-use order, deduplicating a reused exercise', async () => {
    const exercises = [];
    const session = unwrap(await harness.repo.w.startSession({ kind: 'gym' }));
    for (let index = 0; index < 10; index++) {
      const exercise = await harness.exercise(`Lift ${index}`);
      exercises.push(exercise);
      harness.tick();
      unwrap(await harness.repo.w.logSet({ session_id: session.id, exercise_id: exercise.id, weight_kg: 20, reps: 5 }));
    }
    harness.tick();
    unwrap(await harness.repo.w.logSet({ session_id: session.id, exercise_id: exercises[2]!.id, weight_kg: 20, reps: 5 }));
    harness.render(<ExercisePicker open onSelect={() => {}} onClose={() => {}} />);
    const recent = await screen.findByRole('region', { name: copy.x4Recent });
    expect(within(recent).getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Lift 2', 'Lift 9', 'Lift 8', 'Lift 7', 'Lift 6', 'Lift 5', 'Lift 4', 'Lift 3',
    ]);
  });
});
