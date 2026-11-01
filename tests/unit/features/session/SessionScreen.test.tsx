// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SessionScreen from '../../../../src/features/session/SessionScreen.tsx';
import { copy, fill } from '../../../../src/ui';
import { deferred, unwrap } from '../../data/harness.ts';
import { sessionHarness } from './harness.tsx';

// jsdom has no native dialog top layer. Browser checks cover the real modal;
// these shims let the unit test exercise the failed write and its retry.
HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };

describe('S6 with the A6 mock Repo', () => {
  let harness: Awaited<ReturnType<typeof sessionHarness>>;
  beforeEach(async () => { harness = await sessionHarness(); });
  afterEach(async () => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); await harness.close(); });

  async function start() {
    await harness.exercise();
    harness.render(<SessionScreen />);
    await userEvent.click(await screen.findByRole('button', { name: copy.start }));
    const picker = await screen.findByRole('dialog', { name: copy.pickerTitle });
    await userEvent.click(await within(picker).findByRole('button', { name: 'Bench press' }));
    await screen.findByRole('button', { name: copy.logSet });
  }
  const rows = () => within(screen.getByRole('region', { name: copy.sessionSets })).queryAllByRole('listitem');
  async function log(count: number) {
    for (let index = 1; index <= count; index++) {
      harness.tick();
      await userEvent.click(screen.getByRole('button', { name: copy.logSet }));
      await waitFor(() => expect(rows()).toHaveLength(index));
    }
  }

  it('starts a gym session and logs three offline sets as three persisted rows', async () => {
    await start();
    fireEvent.change(screen.getByRole('spinbutton', { name: copy.kg }), { target: { value: '80' } });
    await userEvent.click(screen.getByRole('button', { name: copy.sessionWarmup }));
    await userEvent.click(screen.getByRole('button', { name: fill(copy.sessionRpeValue, { value: 8 }) }));
    await log(3);
    const session = await harness.repo.q.openSession();
    const sets = await harness.repo.q.setsOfSession(session!.id);
    expect(sets.map((set) => [set.weight_kg, set.reps])).toEqual([[80, 5], [80, 5], [80, 5]]);
    expect(sets.map((set) => set.is_warmup)).toEqual([true, false, false]);
    expect(sets.map((set) => set.rpe)).toEqual([8, null, null]);
    expect(screen.getAllByLabelText(copy.sessionSaved)).toHaveLength(3);
    expect(await harness.repo.q.isPending(sets[0]!.id)).toBe(true);
  });

  it.each(['501', '-1', '0.1'])('blocks invalid lift kg %s with copy-bank feedback and no write', async (value) => {
    await start();
    const logSet = vi.spyOn(harness.repo.w, 'logSet');
    fireEvent.change(screen.getByRole('spinbutton', { name: copy.kg }), { target: { value } });
    await userEvent.click(screen.getByRole('button', { name: copy.logSet }));
    expect(screen.getByRole('alert').textContent).toBe(copy.outOfRange);
    expect(logSet).not.toHaveBeenCalled();
    expect(rows()).toHaveLength(0);
  });

  it('uses ±2.5 kg and ±1 rep controls, accepts quarter kg, and blocks invalid reps', async () => {
    await start();
    await userEvent.click(screen.getByRole('button', { name: fill(copy.increase, { label: copy.kg }) }));
    await userEvent.click(screen.getByRole('button', { name: fill(copy.increase, { label: copy.reps }) }));
    expect((screen.getByRole('spinbutton', { name: copy.kg }) as HTMLInputElement).value).toBe('2.5');
    expect((screen.getByRole('spinbutton', { name: copy.reps }) as HTMLInputElement).value).toBe('6');
    fireEvent.change(screen.getByRole('spinbutton', { name: copy.reps }), { target: { value: '101' } });
    await userEvent.click(screen.getByRole('button', { name: copy.logSet }));
    expect(screen.getByRole('alert').textContent).toBe(copy.outOfRange);
    fireEvent.change(screen.getByRole('spinbutton', { name: copy.reps }), { target: { value: '6' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: copy.kg }), { target: { value: '80.25' } });
    await log(1);
    expect(rows()[0]!.textContent).toContain('80.25');
  });

  it('keeps a failed storage write unsaved, then retries the same draft from the blocking modal', async () => {
    await start();
    const logSet = vi.spyOn(harness.repo.w, 'logSet').mockResolvedValueOnce({ ok: false, error: 'storage_full' });
    fireEvent.change(screen.getByRole('spinbutton', { name: copy.kg }), { target: { value: '82.5' } });
    await userEvent.click(screen.getByRole('button', { name: copy.logSet }));
    const modal = await screen.findByRole('alertdialog', { name: copy.storageFull });
    expect(rows()).toHaveLength(0);
    await userEvent.click(within(modal).getByRole('button', { name: copy.retry }));
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(logSet).toHaveBeenCalledTimes(2);
    expect(rows()[0]!.textContent).toContain('82.5');
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('prevents duplicate writes while a log is still committing', async () => {
    await start();
    const ready = deferred<void>();
    const original = harness.repo.w.logSet;
    const logSet = vi.spyOn(harness.repo.w, 'logSet').mockImplementation(async (input) => {
      await ready.promise;
      return original(input);
    });
    const form = screen.getByRole('form', { name: 'Bench press' });
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(logSet).toHaveBeenCalledTimes(1);
    await act(async () => ready.resolve());
    await waitFor(() => expect(rows()).toHaveLength(1));
  });

  it('allows negative added weight for bodyweight lifts and blocks weights outside its UI range', async () => {
    const exercise = await harness.exercise('Assisted pull-up', 'bw_lift');
    const session = unwrap(await harness.repo.w.startSession({ kind: 'gym' }));
    unwrap(await harness.repo.w.logSet({ session_id: session.id, exercise_id: exercise.id, reps: 5, weight_kg: -20 }));
    harness.render(<SessionScreen />);
    await userEvent.click(await screen.findByRole('button', { name: copy.sessionResumeAction }));
    const input = await screen.findByRole('spinbutton', { name: copy.sessionAddedKg });
    expect((input as HTMLInputElement).value).toBe('-20');
    fireEvent.change(input, { target: { value: '-100.25' } });
    await userEvent.click(screen.getByRole('button', { name: copy.logSet }));
    expect(screen.getByRole('alert').textContent).toBe(copy.outOfRange);
    fireEvent.change(input, { target: { value: '-22.5' } });
    await userEvent.click(screen.getByRole('button', { name: copy.logSet }));
    await waitFor(() => expect(rows()).toHaveLength(2));
    expect((await harness.repo.q.setsOfSession(session.id))[1]!.weight_kg).toBe(-22.5);
  });

  it('swipe-deletes only horizontally, then Undo restores the same row through the outbox', async () => {
    await start();
    await log(1);
    const session = (await harness.repo.q.openSession())!;
    const [original] = await harness.repo.q.setsOfSession(session.id);
    fireEvent.pointerDown(rows()[0]!, { button: 0, pointerId: 1, clientX: 250, clientY: 100 });
    fireEvent.pointerUp(rows()[0]!, { pointerId: 1, clientX: 230, clientY: 220 });
    expect(rows()).toHaveLength(1);
    fireEvent.pointerDown(rows()[0]!, { button: 0, pointerId: 2, clientX: 250, clientY: 100 });
    fireEvent.pointerUp(rows()[0]!, { pointerId: 2, clientX: 100, clientY: 108 });
    await waitFor(() => expect(rows()).toHaveLength(0));
    expect(await harness.repo.q.setsOfSession(session.id)).toHaveLength(0);
    await userEvent.click(await screen.findByRole('button', { name: copy.undo }));
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect((await harness.repo.q.setsOfSession(session.id))[0]!.id).toBe(original!.id);
    expect(await harness.repo.q.isPending(original!.id)).toBe(true);
  });

  it('shows chalk ticks after acknowledgement and grey again while an edit is pending', async () => {
    await start();
    await log(1);
    harness.environment.setOnline(true);
    await act(() => harness.repo.sync.flushNow());
    await screen.findByLabelText(copy.sessionSynced);
    const session = (await harness.repo.q.openSession())!;
    const [row] = await harness.repo.q.setsOfSession(session.id);
    harness.environment.setOnline(false);
    harness.tick();
    await act(() => harness.repo.w.updateSet(row!.id, { reps: 6 }));
    await screen.findByLabelText(copy.sessionSaved);
  });

  it('finishes only after the full 600 ms hold; click, short hold and cancellation do not finish', async () => {
    await start();
    const finish = vi.spyOn(harness.repo.w, 'finishSession');
    const button = screen.getByRole('button', { name: copy.finish });
    vi.useFakeTimers();
    fireEvent.click(button);
    fireEvent.keyDown(button, { key: ' ' });
    act(() => vi.advanceTimersByTime(599));
    fireEvent.keyUp(button, { key: ' ' });
    act(() => vi.advanceTimersByTime(100));
    expect(finish).not.toHaveBeenCalled();
    fireEvent.keyDown(button, { key: ' ' });
    act(() => vi.advanceTimersByTime(599));
    expect(finish).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(finish).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
    await screen.findByText(copy.sessionFinished);
    expect(await harness.repo.q.openSession()).toBeUndefined();
  });

  it('resumes the existing session after a remount without creating another', async () => {
    await start();
    await log(1);
    const original = await harness.repo.q.openSession();
    cleanup();
    const startSession = vi.spyOn(harness.repo.w, 'startSession');
    harness.render(<SessionScreen />);
    await userEvent.click(await screen.findByRole('button', { name: copy.sessionResumeAction }));
    await screen.findByRole('button', { name: copy.logSet });
    expect(rows()).toHaveLength(1);
    expect(startSession).not.toHaveBeenCalled();
    expect((await harness.repo.q.openSession())!.id).toBe(original!.id);
  });

  it('prefills corresponding historical sets, repeats the last one and clears RPE', async () => {
    const exercise = await harness.exercise();
    const session = unwrap(await harness.repo.w.startSession({ kind: 'gym' }));
    for (const weight_kg of [60, 80]) {
      harness.tick();
      unwrap(await harness.repo.w.logSet({ session_id: session.id, exercise_id: exercise.id, weight_kg, reps: 8, rpe: 9 }));
    }
    unwrap(await harness.repo.w.finishSession(session.id));
    harness.tick();
    harness.render(<SessionScreen />);
    await userEvent.click(await screen.findByRole('button', { name: copy.start }));
    await screen.findByRole('button', { name: copy.logSet });
    expect((screen.getByRole('spinbutton', { name: copy.kg }) as HTMLInputElement).value).toBe('60');
    await log(3);
    const active = (await harness.repo.q.openSession())!;
    expect((await harness.repo.q.setsOfSession(active.id)).map((row) => [row.weight_kg, row.rpe])).toEqual([[60, null], [80, null], [80, null]]);
  });
});
