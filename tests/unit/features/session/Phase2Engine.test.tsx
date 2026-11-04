// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { doMinPlan } from '../../../../src/core/readiness.ts';
import SessionScreen from '../../../../src/features/session/SessionScreen.tsx';
import { FRESH_UNDO_MS } from '../../../../src/features/session/sessionModel.ts';
import { skipRest } from '../../../../src/features/timer/useRestTimer.ts';
import { copy, fill } from '../../../../src/ui';
import { unwrap } from '../../data/harness.ts';
import { sessionHarness } from './harness.tsx';

HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };

async function click(button: HTMLElement) {
  // These integration tests cover React handlers and persisted state. Native
  // pointer targeting is covered by Playwright; avoid jsdom's costly pointer
  // simulation, and explicitly require an enabled control before dispatching.
  await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false));
  fireEvent.click(button);
}

describe('P2D session engine', () => {
  let harness: Awaited<ReturnType<typeof sessionHarness>>;
  beforeEach(async () => { localStorage.clear(); skipRest(); harness = await sessionHarness(); });
  afterEach(async () => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); skipRest(); localStorage.clear(); await harness.close(); });

  async function seedBench(weight_kg: number, rpe: number | null) {
    const exercise = await harness.exercise();
    const prior = unwrap(await harness.repo.w.startSession({ kind: 'gym' }));
    harness.tick();
    unwrap(await harness.repo.w.logSet({ session_id: prior.id, exercise_id: exercise.id, weight_kg, reps: 5, rpe }));
    unwrap(await harness.repo.w.finishSession(prior.id));
    harness.tick();
    return exercise;
  }

  async function openSession() {
    harness.render(<SessionScreen />);
    const picker = await screen.findByRole('dialog', { name: copy.pickerTitle });
    const exercises = await harness.repo.q.exercises();
    await click(await within(picker).findByRole('button', { name: exercises[0]!.name }));
    // Do not repeatedly scan the loading screen's inaccessible picker/dock.
    await waitFor(() => expect(document.querySelector('[data-session-dock]')).not.toBeNull());
    await screen.findByRole('button', { name: copy.x4Log });
    expect(screen.queryByRole('region', { name: copy.readinessTitle })).toBeNull();
  }

  const rows = () => within(screen.getByRole('region', { name: copy.sessionSets })).queryAllByRole('listitem');

  it('runs the phase 2 demo: readiness, 1-tap set, timer, PR card, delete, summary', async () => {
    const exercise = await seedBench(80, 9);
    await openSession();
    const open = await harness.repo.q.openSession();
    const logButton = screen.getByRole('button', { name: copy.x4Log }) as HTMLButtonElement;
    const kgDial = screen.getByRole('slider', { name: copy.kg });
    expect(open?.readiness).toBeNull();
    expect(open?.mode).toBe('full');
    expect(screen.getAllByRole('heading', { name: exercise.name })).toHaveLength(1);
    expect(screen.getByRole('button', { name: copy.x4Change })).toBeTruthy();
    expect(kgDial.getAttribute('aria-valuenow')).toBe('80');
    expect(screen.getByRole('slider', { name: copy.reps }).getAttribute('aria-valuenow')).toBe('5');

    harness.tick();
    await click(logButton);
    await waitFor(() => expect(rows()).toHaveLength(1));
    // A published row is not a signal that the next dial input is enabled.
    await waitFor(() => expect(logButton.disabled).toBe(false));
    expect(screen.getAllByRole('region', { name: copy.restTimerLabel }).length).toBeGreaterThan(0);
    expect((await harness.repo.q.setsOfSession(open!.id)).map((set) => [set.weight_kg, set.reps, set.rpe])).toEqual([[80, 5, null]]);

    harness.tick();
    fireEvent.keyDown(kgDial, { key: 'ArrowUp' });
    expect(kgDial.getAttribute('aria-valuenow')).toBe('82.5');
    await click(logButton);
    const card = await screen.findByRole('region', { name: copy.prCardLabel });
    expect(card.textContent).toContain(copy.prE1rm);
    expect(await harness.repo.q.prEvents({ sessionId: open!.id })).toHaveLength(1);

    const heavy = rows().find((row) => row.textContent?.includes('82.5'));
    expect(heavy).toBeTruthy();
    await click(within(heavy!).getByRole('button'));
    await click(screen.getByRole('button', { name: fill(copy.sessionDelete, { index: 2 }) }));
    await waitFor(() => expect(screen.queryByRole('region', { name: copy.prCardLabel })).toBeNull());
    await waitFor(async () => expect(await harness.repo.q.prEvents({ sessionId: open!.id })).toHaveLength(0));

    const skip = screen.queryByRole('button', { name: copy.skip });
    if (skip) await click(skip);
    const rack = screen.getByRole('button', { name: copy.x4FinishHold });
    expect(rack.className).toContain('ui-button--xl');
    expect(screen.getByRole('button', { name: copy.x4Log }).className).toContain('ui-button--xl');
    await waitFor(() => expect(rack.hasAttribute('disabled')).toBe(false));
    vi.useFakeTimers();
    fireEvent.keyDown(rack, { key: ' ' });
    act(() => { vi.advanceTimersByTime(600); });
    vi.useRealTimers();
    await screen.findByText(copy.summaryDuration);
    const summary = screen.getByRole('region', { name: copy.summaryTitle });
    expect(summary.textContent).toContain(copy.x4Volume);
    expect(within(summary).getByText('400 kg moved')).toBeTruthy();
    expect(summary.textContent).toContain(copy.summarySets);
    await screen.findByText(copy.x4Summary);
    expect(await harness.repo.q.openSession()).toBeUndefined();
  });

  it('applies the progression chip only when tapped', async () => {
    await seedBench(80, 8);
    await openSession();
    const logSet = vi.spyOn(harness.repo.w, 'logSet');
    const chip = await screen.findByRole('button', { name: '+2.5 → 82.5' });
    expect(screen.getByText(copy.progressionNudge)).toBeTruthy();
    expect(screen.getByRole('slider', { name: copy.kg }).getAttribute('aria-valuenow')).toBe('80');
    expect(logSet).not.toHaveBeenCalled();
    await click(chip);
    expect(screen.getByRole('slider', { name: copy.kg }).getAttribute('aria-valuenow')).toBe('82.5');
    expect(logSet).not.toHaveBeenCalled();
  });

  it('uses a +5 jump for a lower-body compound when big jumps is on', async () => {
    const exercise = unwrap(await harness.repo.w.createExercise({
      name: 'Back squat', export_label: 'Back squat', kind: 'lift', category: 'compound', lower_body: true,
    }));
    unwrap(await harness.repo.w.upsertMyProfile({ big_jumps: true }));
    const prior = unwrap(await harness.repo.w.startSession({ kind: 'gym' }));
    harness.tick();
    unwrap(await harness.repo.w.logSet({ session_id: prior.id, exercise_id: exercise.id, weight_kg: 80, reps: 5, rpe: 8 }));
    unwrap(await harness.repo.w.finishSession(prior.id));
    harness.tick();
    await openSession();
    expect(await screen.findByRole('button', { name: '+5 → 85' })).toBeTruthy();
    expect(screen.getByText(copy.progressionBig)).toBeTruthy();
  });

  it('resumes an existing MIN plan without a readiness gate', async () => {
    const exercise = await seedBench(80, 9);
    const prior = await harness.repo.q.entriesBetween(exercise.owner_id ?? '', '0000-01-01', '9999-12-31');
    const me = unwrap(await harness.repo.w.upsertMyProfile({}));
    const plan = doMinPlan({ sessions: prior.sessions, sets: prior.sets, exercises: [exercise], userId: me.id, barKg: me.bar_kg, platesKg: me.plates_kg });
    unwrap(await harness.repo.w.startSession({ kind: 'gym', mode: 'min', readiness: { sleep: 1, soreness: 1, energy: 1 } }));
    harness.render(<SessionScreen />);
    await click(await screen.findByRole('button', { name: copy.sessionResumeAction }));
    // Do not repeatedly scan the loading screen's inaccessible picker/dock.
    await waitFor(() => expect(document.querySelector('[data-session-dock]')).not.toBeNull());
    await screen.findByRole('button', { name: copy.x4Log });
    expect(screen.queryByRole('region', { name: copy.readinessTitle })).toBeNull();
    expect(screen.getByRole('slider', { name: copy.kg }).getAttribute('aria-valuenow')).toBe(String(plan.blocks[0]!.sets[0]!.weight_kg));
  });

  it('blocks a second session and offers resume after a remount', async () => {
    await seedBench(80, 9);
    await openSession();
    cleanup();
    harness.render(<SessionScreen />);
    expect(await screen.findByText(copy.openSession)).toBeTruthy();
    expect(screen.getByText(/Resume session \(\d+ min\)\?/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: copy.start })).toBeNull();
    await click(screen.getByRole('button', { name: copy.sessionResumeAction }));
    // Do not repeatedly scan the loading screen's inaccessible picker/dock.
    await waitFor(() => expect(document.querySelector('[data-session-dock]')).not.toBeNull());
    await screen.findByRole('button', { name: copy.x4Log });
  });

  it('offers readiness only on the summary and persists the optional check-in', async () => {
    await seedBench(80, 9);
    await openSession();
    await click(screen.getByRole('button', { name: copy.x4Log }));
    await waitFor(() => expect(rows()).toHaveLength(1));
    const open = (await harness.repo.q.openSession())!;
    const finish = screen.getByRole('button', { name: copy.x4FinishHold });
    await waitFor(() => expect(finish.hasAttribute('disabled')).toBe(false));
    vi.useFakeTimers(); fireEvent.keyDown(finish, { key: ' ' });
    act(() => vi.advanceTimersByTime(600)); vi.useRealTimers();
    const summary = await screen.findByRole('region', { name: copy.summaryTitle });
    await click(await within(summary).findByText(copy.x4Readiness, { exact: false }));
    for (const label of [copy.readinessSleep, copy.readinessSoreness, copy.readinessEnergy]) {
      fireEvent.change(within(summary).getByRole('combobox', { name: label }), { target: { value: '2' } });
    }
    fireEvent.change(within(summary).getByRole('textbox', { name: copy.x4Note }), { target: { value: 'Good workout' } });
    await click(within(summary).getByRole('button', { name: copy.summaryDone }));
    await waitFor(async () => {
      const history = await harness.repo.q.entriesBetween(open.user_id, open.local_date, open.local_date);
      expect(history.sessions.find((row) => row.id === open.id)).toMatchObject({ note: 'Good workout', readiness: { sleep: 2, soreness: 2, energy: 2 } });
    });
  });

  it('shows Undo on a new row for 8 seconds', async () => {
    await seedBench(80, 9);
    await openSession();
    const timeouts = vi.spyOn(window, 'setTimeout');
    harness.tick();
    await click(await screen.findByRole('button', { name: copy.x4Log }));
    const undo = await screen.findByRole('button', { name: copy.undo });
    expect(undo.className).toContain('ui-button--xl');
    expect(FRESH_UNDO_MS).toBe(8000);
    expect(timeouts.mock.calls.some((call) => call[1] === FRESH_UNDO_MS)).toBe(true);
  });

  it('uses the big-jump value in the lower-body stepper', async () => {
    unwrap(await harness.repo.w.createExercise({ name: 'Back squat', export_label: 'Back squat', kind: 'lift', category: 'compound', lower_body: true }));
    unwrap(await harness.repo.w.upsertMyProfile({ big_jumps: true }));
    await openSession();
    fireEvent.keyDown(screen.getByRole('slider', { name: copy.kg }), { key: 'ArrowUp' });
    expect(screen.getByRole('slider', { name: copy.kg }).getAttribute('aria-valuenow')).toBe('5');
  });
});
