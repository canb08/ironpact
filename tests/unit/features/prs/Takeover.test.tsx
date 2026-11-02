// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { useState } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectSetPr, type PrEventDraft, type PrHistory } from '../../../../src/core/prs.ts';
import type { Session, SetRow } from '../../../../src/core/types.ts';
import { firePrConfetti, PR_CHALK_COUNT, PR_CONFETTI_TOTAL, PR_SPARK_COUNT, setPrBurstForTests } from '../../../../src/features/prs/confetti.ts';
import { PrCard } from '../../../../src/features/prs/PrCard.tsx';
import { PR_FLASH_MS, prSequenceRespectsFlashCap } from '../../../../src/features/prs/sequence.ts';
import { Takeover } from '../../../../src/features/prs/Takeover.tsx';
import { getRestView, skipRest, startRest } from '../../../../src/features/timer/useRestTimer.ts';
import { RestTimerOverlay } from '../../../../src/features/timer/RestTimerOverlay.tsx';
import { copy } from '../../../../src/ui';
import { MotionProvider } from '../../../../src/ui/motion/MotionProvider.tsx';
import { MomentHost } from '../../../../src/ui/moments/MomentHost.tsx';
import { moments } from '../../../../src/ui/moments/queue.ts';
import { exercise, id, session, set } from '../../core/fixtures.ts';

function gym(n: number, started: string): Session {
  return {
    ...session,
    id: id(n),
    started_at: started,
    local_date: started.slice(0, 10),
    client_updated_at: started,
  };
}

function lift(n: number, parent: Session, extra: Partial<SetRow> = {}): SetRow {
  return {
    ...set,
    id: id(n),
    session_id: parent.id,
    exercise_id: exercise.id,
    local_date: parent.local_date,
    logged_at: parent.started_at,
    client_updated_at: parent.started_at,
    reps: 5,
    weight_kg: 80,
    ...extra,
  };
}

function heavierSet(): PrEventDraft {
  const first = gym(1, '2026-10-01T08:00:00.000Z');
  const second = gym(2, '2026-10-08T08:00:00.000Z');
  const sets = [lift(10, first, { weight_kg: 80 }), lift(11, second, { weight_kg: 100 })];
  const history: PrHistory = {
    sessions: [first, second],
    sets,
    cardio: [],
    bodyweights: [],
    exercises: [exercise],
  };
  const detected = detectSetPr(history, sets[1]!.id);
  if (detected.kind !== 'pr') throw new Error('expected a heavier set to be a PR');
  return detected.event;
}

function Demo({ event }: { event: PrEventDraft }) {
  const [open, setOpen] = useState(true);
  return (
    <MotionProvider>
      <MomentHost screen="demo-pr" />
      <RestTimerOverlay />
      {open && <PrCard event={event} onClose={() => setOpen(false)} />}
    </MotionProvider>
  );
}

describe('PR takeover', () => {
  afterEach(() => {
    cleanup();
    skipRest();
    moments.closeScreen();
    setPrBurstForTests(null);
    localStorage.clear();
  });

  it('demo: heavier set → takeover → Back to work → timer still counting', async () => {
    const event = heavierSet();
    expect(event.display).toBe('takeover');
    expect(event.pr_type).toBe('e1rm');
    expect(event.value).toBeGreaterThan(event.previous_value ?? 0);
    startRest('bench', 120);
    const before = getRestView().remainingSeconds;
    render(<Demo event={event} />);
    const card = await screen.findByRole('region', { name: copy.prCardLabel });
    expect(card.getAttribute('data-phase')).toBe('play');
    expect(card.textContent).toContain(copy.prE1rm);
    expect(card.textContent).toContain(copy.prDetail);
    expect(document.querySelector('canvas')).toBeNull();
    expect(screen.getByRole('region', { name: copy.restTimerLabel }).textContent).toMatch(/\d+:\d{2}/);

    await userEvent.click(screen.getByRole('button', { name: copy.backToWork }));
    expect(screen.queryByRole('region', { name: copy.prCardLabel })).toBeNull();
    const timer = screen.getByRole('region', { name: copy.restTimerLabel });
    expect(timer.textContent).toMatch(/\d+:\d{2}/);
    expect(getRestView().phase).toBe('running');
    expect(getRestView().remainingSeconds).toBeGreaterThan(90);
    expect(getRestView().remainingSeconds).toBeLessThanOrEqual(before);
  });

  it('tap skips to the final frame; Share is a stub', async () => {
    const onClose = vi.fn();
    const burst = vi.fn(async () => 0);
    setPrBurstForTests(burst);
    render(
      <MotionProvider>
        <Takeover event={heavierSet()} onClose={onClose} />
      </MotionProvider>,
    );
    const card = screen.getByRole('region', { name: copy.prCardLabel });
    expect(card.getAttribute('data-phase')).toBe('play');
    expect(card.querySelectorAll('[data-flash]')).toHaveLength(1);
    await userEvent.click(screen.getByText(copy.prDetail));
    expect(card.getAttribute('data-phase')).toBe('final');
    expect(card.querySelectorAll('[data-flash]')).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: copy.sharePr }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: copy.sharePr }).getAttribute('data-share')).toBe('stub');
    await new Promise((resolve) => setTimeout(resolve, 900));
    expect(burst).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: copy.backToWork }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('fires at most 120 particles and at most 3 flashes per second', async () => {
    expect(prSequenceRespectsFlashCap()).toBe(true);
    expect(PR_FLASH_MS.length).toBeLessThanOrEqual(3);
    const calls: { particleCount?: number; gravity?: number; colors?: string[]; disableForReducedMotion?: boolean }[] = [];
    const fire = Object.assign(async (options?: { particleCount?: number; gravity?: number; colors?: string[]; disableForReducedMotion?: boolean }) => {
      calls.push(options ?? {});
      return undefined;
    }, { shapeFromPath: () => ({ type: 'path' }), reset() {} });
    const total = await firePrConfetti(fire, 'circle');
    expect(total).toBe(PR_CONFETTI_TOTAL);
    expect(total).toBeLessThanOrEqual(120);
    expect(calls.reduce((sum, row) => sum + (row.particleCount ?? 0), 0)).toBe(PR_CHALK_COUNT + PR_SPARK_COUNT);
    expect(calls.every((row) => row.gravity === 0.4 && row.disableForReducedMotion === true)).toBe(true);
    expect(calls[0]?.colors).toEqual(['#F2F0EB']);
    expect(calls[1]?.colors).toEqual(['#FF4D00']);
    expect(calls[1]?.particleCount).toBe(PR_SPARK_COUNT);

    const burst = vi.fn(async () => PR_CONFETTI_TOTAL);
    setPrBurstForTests(burst);
    render(
      <MotionProvider>
        <Takeover event={heavierSet()} onClose={() => {}} />
      </MotionProvider>,
    );
    await new Promise((resolve) => setTimeout(resolve, 900));
    expect(burst).toHaveBeenCalledOnce();
    expect(document.querySelector('canvas')).toBeNull();
  });

  it('keeps motion and canvas-confetti out of the static card and the entry graph', () => {
    const card = readFileSync('src/features/prs/PrCard.tsx', 'utf8');
    const burst = readFileSync('src/features/prs/confetti.ts', 'utf8');
    expect(card).toContain("import('./arm.ts')");
    expect(card).not.toContain('canvas-confetti');
    expect(card).not.toContain('motion/react');
    expect(burst).toContain("import('canvas-confetti')");
    expect(burst).not.toMatch(/from\s+['"]canvas-confetti['"]/);
    expect(burst).not.toMatch(/import\s+['"]canvas-confetti['"]/);
  });
});
