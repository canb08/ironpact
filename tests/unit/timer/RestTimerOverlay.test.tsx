// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copy } from '../../../src/ui/copy';
import { setHapticsOn } from '../../../src/platform/haptics';
import { releaseKeepAwake } from '../../../src/platform/wakeLock';
import { RestTimerOverlay } from '../../../src/features/timer/RestTimerOverlay';
import { startRest, skipRest } from '../../../src/features/timer/useRestTimer';

beforeEach(() => {
  localStorage.clear();
  skipRest();
  releaseKeepAwake();
  setHapticsOn(true);
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-02T00:00:00.000Z'));
});

afterEach(() => {
  skipRest();
  releaseKeepAwake();
  setHapticsOn(true);
  vi.useRealTimers();
  document.querySelectorAll('video').forEach((node) => node.remove());
});

function showAt(to: number) {
  vi.setSystemTime(to);
  act(() => { document.dispatchEvent(new Event('visibilitychange')); });
}

describe('RestTimerOverlay', () => {
  it('shows the header chip, announces at 10 s and 0, and pulses once for 300 ms', () => {
    const t0 = Date.now();
    render(<RestTimerOverlay reduceMotion={false} />);
    expect(screen.queryByRole('region', { name: copy.restTimerLabel })).toBeNull();
    act(() => { startRest('bench', 120); });
    expect(screen.getAllByText('2:00').length).toBeGreaterThan(0);
    expect(screen.getByRole('status').textContent).toBe('');
    expect(screen.getByRole('status').getAttribute('aria-live')).toBe('polite');

    showAt(t0 + 110_000);
    expect(screen.getByRole('status').textContent).toBe(copy.restTenSeconds);
    expect(screen.getAllByText('0:10').length).toBeGreaterThan(0);

    showAt(t0 + 120_000);
    expect(screen.getByRole('status').textContent).toBe(copy.restOverAnnounce);
    expect(screen.getByText(copy.restComplete)).toBeTruthy();
    expect(screen.getByText('+0:00 over')).toBeTruthy();
    expect(screen.getByTestId('rest-pulse')).toBeTruthy();

    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.queryByTestId('rest-pulse')).toBeNull();

    showAt(t0 + 125_000);
    expect(screen.getByText('+0:05 over')).toBeTruthy();
    expect(screen.queryByTestId('rest-pulse')).toBeNull();
  });

  it('does not pulse under reduced motion', () => {
    const t0 = Date.now();
    render(<RestTimerOverlay reduceMotion />);
    act(() => { startRest('bench', 15); });
    showAt(t0 + 15_000);
    expect(screen.queryByTestId('rest-pulse')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe(copy.restOverAnnounce);
  });

  it('adjusts by 15 s and skip hides the timer', () => {
    render(<RestTimerOverlay reduceMotion />);
    act(() => { startRest('bench', 120); });
    fireEvent.click(screen.getByRole('button', { name: copy.restMinus15 }));
    expect(screen.getAllByText('1:45').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: copy.restPlus15 }));
    expect(screen.getAllByText('2:00').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: copy.skip }));
    expect(screen.queryByText('2:00')).toBeNull();
  });

  it('finishes on a 600 ms hold and skips on a short press', () => {
    const hold = vi.fn();
    const { unmount } = render(<RestTimerOverlay reduceMotion onSkipHold={hold} />);
    act(() => { startRest('bench', 40); });
    fireEvent.pointerDown(screen.getByRole('button', { name: copy.skip }));
    act(() => { vi.advanceTimersByTime(599); });
    expect(hold).not.toHaveBeenCalled();
    fireEvent.pointerUp(screen.getByRole('button', { name: copy.skip }));
    expect(hold).not.toHaveBeenCalled();
    expect(screen.queryByText('0:40')).toBeNull();

    unmount();
    render(<RestTimerOverlay reduceMotion onSkipHold={hold} />);
    act(() => { startRest('bench', 40); });
    fireEvent.pointerDown(screen.getByRole('button', { name: copy.skip }));
    act(() => { vi.advanceTimersByTime(600); });
    expect(hold).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('0:40')).toBeNull();
  });
});
