// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { RestTimerOverlay } from '../../../../src/features/timer/RestTimerOverlay.tsx';
import { skipRest, startRest } from '../../../../src/features/timer/useRestTimer.ts';
import { releaseKeepAwake } from '../../../../src/platform/wakeLock.ts';

afterEach(() => { cleanup(); skipRest(); releaseKeepAwake(); vi.useRealTimers(); });

it('clears the single pulse when a clock jump advances overtime during its 300 ms lifetime', () => {
  vi.useFakeTimers();
  const start = Date.parse('2026-11-02T10:00:00Z');
  vi.setSystemTime(start);
  render(<RestTimerOverlay reduceMotion={false} />);
  act(() => startRest('bench', 15));
  expect(screen.getAllByText('0:15')).toHaveLength(1);
  act(() => {
    vi.setSystemTime(start + 15_000);
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(screen.getByTestId('rest-pulse')).toBeTruthy();
  act(() => {
    vi.setSystemTime(start + 20_000);
    document.dispatchEvent(new Event('visibilitychange'));
  });
  act(() => vi.advanceTimersByTime(300));
  expect(screen.queryByTestId('rest-pulse')).toBeNull();
  expect(screen.getAllByText('+0:05 over')).toHaveLength(1);
});
