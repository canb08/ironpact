// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { doMinPlan } from '../../../../src/core/readiness.ts';
import SessionScreen from '../../../../src/features/session/SessionScreen.tsx';
import { readReadinessGate } from '../../../../src/features/session/readinessGate.ts';
import { FRESH_UNDO_MS } from '../../../../src/features/session/sessionModel.ts';
import { skipRest } from '../../../../src/features/timer/useRestTimer.ts';
import { copy, fill } from '../../../../src/ui';
import { unwrap } from '../../data/harness.ts';
import { sessionHarness } from './harness.tsx';

HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };

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
    await userEvent.click(await screen.findByRole('button', { name: copy.start }));
    return screen.findByRole('region', { name: copy.readinessTitle });
  }

  async function scoreLow(readiness: HTMLElement) {
    for (const row of [copy.readinessSleep, copy.readinessSoreness, copy.readinessEnergy]) {
      await userEvent.click(within(readiness).getByRole('button', { name: fill(copy.readinessChoice, { row, level: copy.readinessLow }) }));
    }
  }

  const rows = () => within(screen.getByRole('region', { name: copy.sessionSets })).queryAllByRole('listitem');

  it('runs the phase 2 demo: readiness, 1-tap set, timer, PR card, delete, summary', async () => {
    const exercise = await seedBench(80, 9);
    const readiness = await openSession();
    await scoreLow(readiness);
    expect(readiness.textContent).toContain(copy.minDayStill);
    expect(readiness.textContent).toContain(copy.readinessMin);
    await userEvent.click(within(readiness).getByRole('button', { name: copy.fullSend }));
    await waitFor(() => expect(screen.queryByRole('region', { name: copy.readinessTitle })).toBeNull());
    const open = await harness.repo.q.openSession();
    expect(open?.readiness).toEqual({ sleep: 1, soreness: 1, energy: 1 });
    expect(open?.mode).toBe('full');
    expect(screen.getByRole('button', { name: exercise.name })).toBeTruthy();
    expect((screen.getByRole('spinbutton', { name: copy.kg }) as HTMLInputElement).value).toBe('80');
    expect((screen.getByRole('spinbutton', { name: copy.reps }) as HTMLInputElement).value).toBe('5');

    harness.tick();
    await userEvent.click(screen.getByRole('button', { name: copy.logSet }));
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(screen.getAllByRole('region', { name: copy.restTimerLabel }).length).toBeGreaterThan(0);
    expect((await harness.repo.q.setsOfSession(open!.id)).map((set) => [set.weight_kg, set.reps, set.rpe])).toEqual([[80, 5, null]]);

    harness.tick();
    await userEvent.click(screen.getByRole('button', { name: fill(copy.increase, { label: copy.kg }) }));
    await userEvent.click(screen.getByRole('button', { name: copy.logSet }));
    const card = await screen.findByRole('region', { name: copy.prCardLabel });
    expect(card.textContent).toContain(copy.prE1rm);
    expect(await harness.repo.q.prEvents({ sessionId: open!.id })).toHaveLength(1);

    const heavy = rows().find((row) => row.textContent?.includes('82.5'));
    expect(heavy).toBeTruthy();
    fireEvent.pointerDown(heavy!, { button: 0, pointerId: 1, clientX: 250, clientY: 100 });
    fireEvent.pointerUp(heavy!, { pointerId: 1, clientX: 100, clientY: 108 });
    await waitFor(() => expect(screen.queryByRole('region', { name: copy.prCardLabel })).toBeNull());
    await waitFor(async () => expect(await harness.repo.q.prEvents({ sessionId: open!.id })).toHaveLength(0));

    const skip = screen.queryByRole('button', { name: copy.skip });
    if (skip) await userEvent.click(skip);
    const rack = screen.getByRole('button', { name: copy.finish });
    expect(rack.className).toContain('ui-button--xl');
    expect(screen.getByRole('button', { name: copy.logSet }).className).toContain('ui-button--xl');
    vi.useFakeTimers();
    fireEvent.keyDown(rack, { key: ' ' });
    act(() => { vi.advanceTimersByTime(600); });
    vi.useRealTimers();
    await screen.findByText(copy.summaryDuration);
    const summary = screen.getByRole('region', { name: copy.summaryTitle });
    expect(summary.textContent).toContain(copy.summaryTonnes);
    expect(within(summary).getByText('0.4')).toBeTruthy();
    expect(summary.textContent).toContain(copy.summarySets);
    await screen.findByText(copy.sessionFinished);
    expect(await harness.repo.q.openSession()).toBeUndefined();
  });

  it('applies the progression chip only when tapped', async () => {
    await seedBench(80, 8);
    const readiness = await openSession();
    await userEvent.click(within(readiness).getByRole('button', { name: copy.skip }));
    const logSet = vi.spyOn(harness.repo.w, 'logSet');
    const chip = await screen.findByRole('button', { name: '+2.5 → 82.5' });
    expect(screen.getByText(copy.progressionNudge)).toBeTruthy();
    expect((screen.getByRole('spinbutton', { name: copy.kg }) as HTMLInputElement).value).toBe('80');
    expect(logSet).not.toHaveBeenCalled();
    await userEvent.click(chip);
    expect((screen.getByRole('spinbutton', { name: copy.kg }) as HTMLInputElement).value).toBe('82.5');
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
    const readiness = await openSession();
    await userEvent.click(within(readiness).getByRole('button', { name: copy.skip }));
    expect(await screen.findByRole('button', { name: '+5 → 85' })).toBeTruthy();
    expect(screen.getByText(copy.progressionBig)).toBeTruthy();
  });

  it('builds a Do MIN session at 90% and does not block a full send', async () => {
    const exercise = await seedBench(80, 9);
    const prior = await harness.repo.q.entriesBetween(exercise.owner_id ?? '', '0000-01-01', '9999-12-31');
    const me = unwrap(await harness.repo.w.upsertMyProfile({}));
    const plan = doMinPlan({
      sessions: prior.sessions, sets: prior.sets, exercises: [exercise], userId: me.id, barKg: me.bar_kg, platesKg: me.plates_kg,
    });
    const readiness = await openSession();
    await scoreLow(readiness);
    await userEvent.click(within(readiness).getByRole('button', { name: copy.doMin }));
    await waitFor(async () => expect((await harness.repo.q.openSession())?.mode).toBe('min'));
    await screen.findByRole('button', { name: copy.logSet });
    const open = await harness.repo.q.openSession();
    expect(open?.readiness).toEqual({ sleep: 1, soreness: 1, energy: 1 });
    expect((screen.getByRole('spinbutton', { name: copy.kg }) as HTMLInputElement).value).toBe(String(plan.blocks[0]!.sets[0]!.weight_kg));
  });

  it('blocks a second session and offers resume after a remount', async () => {
    await seedBench(80, 9);
    await openSession();
    cleanup();
    harness.render(<SessionScreen />);
    expect(await screen.findByText(copy.openSession)).toBeTruthy();
    expect(screen.getByText(/Resume session \(\d+ min\)\?/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: copy.start })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: copy.sessionResumeAction }));
    await screen.findByRole('button', { name: copy.logSet });
  });

  it('stops asking after three skips', async () => {
    await seedBench(80, 9);
    for (let time = 0; time < 3; time += 1) {
      const readiness = await openSession();
      await userEvent.click(within(readiness).getByRole('button', { name: copy.skip }));
      const open = await harness.repo.q.openSession();
      unwrap(await harness.repo.w.finishSession(open!.id));
      cleanup();
    }
    expect(readReadinessGate().auto).toBe(true);
    harness.render(<SessionScreen />);
    await userEvent.click(await screen.findByRole('button', { name: copy.start }));
    await screen.findByRole('button', { name: copy.logSet });
    expect(screen.queryByRole('region', { name: copy.readinessTitle })).toBeNull();
  });

  it('shows Undo on a new row for 8 seconds', async () => {
    await seedBench(80, 9);
    const readiness = await openSession();
    await userEvent.click(within(readiness).getByRole('button', { name: copy.skip }));
    const timeouts = vi.spyOn(window, 'setTimeout');
    harness.tick();
    await userEvent.click(await screen.findByRole('button', { name: copy.logSet }));
    const undo = await screen.findByRole('button', { name: copy.undo });
    expect(undo.className).toContain('ui-button--xl');
    expect(FRESH_UNDO_MS).toBe(8000);
    expect(timeouts.mock.calls.some((call) => call[1] === FRESH_UNDO_MS)).toBe(true);
  });

  it('keeps workout controls on the 64px token', () => {
    const tokens = readFileSync('src/ui/tokens.css', 'utf8');
    const session = readFileSync('src/features/session/session.css', 'utf8');
    expect(tokens).toContain('.ui-button--xl');
    expect(tokens).toMatch(/\.ui-button--xl \{[^}]*min-height: 64px/);
    expect(session).toContain('min-height: 72px');
    expect(session).toContain('min-height: 64px');
    expect(session).toContain('margin-top: auto');
  });
});
