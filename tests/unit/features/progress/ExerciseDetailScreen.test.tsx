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
  expect(screen.queryByRole('textbox', { name: copy.restSeconds })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: copy.x5Settings }));
  expect(screen.getByRole('dialog', { name: copy.x5Settings })).toBeTruthy();
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
    expect(screen.queryByRole('region', { name: fill(copy.sessionSet, { index: 1 }) })).toBeNull();
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

it('shows PRs recalculated only when an edit changes the standing PR', async () => {
  harness = await progressHarness();
  const exercise = await harness.repo.w.createExercise({
    name: 'Bench press', export_label: 'Bench press', kind: 'lift', category: 'compound', lower_body: false,
  });
  expect(exercise.ok).toBe(true);
  if (!exercise.ok) return;
  const started = await harness.repo.w.startSession({ kind: 'gym' });
  expect(started.ok).toBe(true);
  if (!started.ok) return;
  await harness.repo.w.logSet({ session_id: started.value.id, exercise_id: exercise.value.id, reps: 5, weight_kg: 80 });
  await harness.repo.w.finishSession(started.value.id);
  await harness.repo.w.updateSession(started.value.id, { started_at: '2026-10-20T08:00:00.000Z' });
  const later = await harness.repo.w.startSession({ kind: 'gym' });
  expect(later.ok).toBe(true);
  if (!later.ok) return;
  await harness.repo.w.logSet({ session_id: later.value.id, exercise_id: exercise.value.id, reps: 5, weight_kg: 100 });
  await harness.repo.w.logSet({ session_id: later.value.id, exercise_id: exercise.value.id, reps: 5, weight_kg: 90 });
  await harness.repo.w.finishSession(later.value.id);
  expect((await harness.repo.w.recomputePrs(exercise.value.id)).ok).toBe(true);
  harness.render(`/exercise/${exercise.value.id}`);
  await screen.findByText(fill(copy.setLine, { index: 1, reps: 5, kg: 100 }));

  const regionNamed = (index: number, kg: number) => {
    const name = fill(copy.sessionSet, { index });
    const line = fill(copy.setLine, { index, reps: 5, kg });
    const match = screen.getAllByRole('region', { name }).find((node) => within(node).queryByText(line));
    if (!match) throw new Error(`missing set ${line}`);
    return within(match);
  };
  const lesser = regionNamed(2, 90);
  fireEvent.click(lesser.getByRole('button', { name: fill(copy.editSet, { index: 2 }) }));
  fireEvent.click(lesser.getByRole('button', { name: copy.save }));
  await waitFor(() => {
    expect(screen.queryByRole('button', { name: copy.save })).toBeNull();
  });
  expect(screen.queryByText(copy.prsRecalculated)).toBeNull();
  expect(screen.queryByText(copy.barAdjusted)).toBeNull();

  const champion = regionNamed(1, 100);
  fireEvent.click(champion.getByRole('button', { name: fill(copy.editSet, { index: 1 }) }));
  fireEvent.change(champion.getByLabelText(copy.kg), { target: { value: '70' } });
  fireEvent.click(champion.getByRole('button', { name: copy.save }));
  expect(await screen.findByText(copy.prsRecalculated)).toBeTruthy();
  expect(screen.queryByText(copy.barAdjusted)).toBeNull();
  const events = await harness.repo.q.prEvents({ exerciseId: exercise.value.id });
  expect(events.find((row) => row.pr_type === 'e1rm')?.value).toBeCloseTo(90 * (1 + 5 / 30), 5);
});

it('keeps the rep-max table collapsed and labels a private partner overlay with their saved name', async () => {
  harness = await progressHarness();
  await harness.repo.sync.pullNow();
  const { profile, exercise, session, set, id } = await import('../../core/fixtures.ts');
  const me = await harness.repo.q.me();
  if (!me) throw new Error('missing viewer');
  const partnerId = id(80);
  await harness.db.profiles.put({ ...profile, id: partnerId, display_name: 'Crewmate' });
  const crew = await harness.repo.q.myCrew();
  if (!crew) throw new Error('missing crew');
  await harness.db.crew_members.put({ crew_id: crew.crew.id, user_id: partnerId, role: 'member', joined_at: '2026-10-01T08:00:00Z', left_at: null });
  await harness.db.exercises.put(exercise);
  const date = new Date().toISOString().slice(0, 10);
  for (const [user, n, weight] of [[me.id, 90, 80], [partnerId, 100, 213.7]] as const) {
    for (let index = 0; index < 2; index++) {
      await harness.db.sessions.put({ ...session, id: id(n + index), user_id: user, local_date: date });
      await harness.db.sets.put({ ...set, id: id(n + index + 20), user_id: user, session_id: id(n + index), exercise_id: exercise.id, weight_kg: weight, reps: 1, is_warmup: false });
    }
  }
  harness.render(`/exercise/${exercise.id}`);
  const toggle = await screen.findByRole('switch', { name: 'Show Crewmate' });
  expect(toggle.getAttribute('aria-checked')).toBe('false');
  expect(document.querySelector('.exercise-rep-max')?.hasAttribute('open')).toBe(false);
  fireEvent.click(toggle);
  await waitFor(() => expect(document.querySelector('.progress-line--partner')).toBeTruthy());
  expect(toggle.getAttribute('aria-checked')).toBe('true');
  expect(document.body.textContent).not.toContain('213.7');
  expect(screen.getByText(copy.x5Comparison)).toBeTruthy();
  expect(screen.getAllByRole('link', { name: copy.x5Today })).toHaveLength(1);
});
