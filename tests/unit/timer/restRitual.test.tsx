// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { RestTimerOverlay } from '../../../src/features/timer/RestTimerOverlay';
import { REST_TIMER_STORAGE_KEY, getRestSnapshot, skipRest, startRest } from '../../../src/features/timer/useRestTimer';
import { releaseKeepAwake } from '../../../src/platform/wakeLock';
import { copy, fill } from '../../../src/ui/copy';

beforeEach(() => {
  skipRest();
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-03T12:00:00Z'));
});
afterEach(() => { cleanup(); skipRest(); releaseKeepAwake(); vi.useRealTimers(); vi.restoreAllMocks(); });

it('fills from the persisted end timestamp across backgrounding and both adjustments', () => {
  const now = Date.now();
  render(<RestTimerOverlay reduceMotion />);
  act(() => startRest('bench', 120));
  const progress = screen.getByRole('progressbar', { name: copy.y4RestProgress });
  expect(progress.getAttribute('aria-valuenow')).toBe('0');
  act(() => { vi.setSystemTime(now + 60_000); document.dispatchEvent(new Event('visibilitychange')); });
  expect(progress.getAttribute('aria-valuenow')).toBe('50');
  expect(progress.firstElementChild?.getAttribute('style')).toContain('scaleX(0.5)');
  expect(getRestSnapshot().timer.endsAt).toBe(now + 120_000);
  fireEvent.click(screen.getByRole('button', { name: copy.restPlus15 }));
  expect(screen.getByText('1:15')).toBeTruthy();
  expect(progress.getAttribute('aria-valuenow')).toBe('44');
  expect(JSON.parse(localStorage.getItem(REST_TIMER_STORAGE_KEY)!).endsAt).toBe(now + 135_000);
  fireEvent.click(screen.getByRole('button', { name: copy.restMinus15 }));
  expect(screen.getByText('1:00')).toBeTruthy();
  expect(progress.getAttribute('aria-valuenow')).toBe('50');
});

it('shows the live next ghost set, traps focus, closes with Escape and restores focus', () => {
  const { rerender } = render(<RestTimerOverlay nextSet={{ exercise: 'Bench press', weightKg: 80, reps: 5 }} />);
  act(() => startRest('bench', 120));
  const expand = screen.getByRole('button', { name: fill(copy.x4TimerAction, { time: '2:00', action: copy.x4TimerExpand }) });
  expand.focus();
  fireEvent.click(expand);
  const dialog = screen.getByRole('dialog', { name: copy.y4Rest });
  expect(dialog.getAttribute('aria-modal')).toBe('true');
  expect(screen.getAllByText('2:00')).toHaveLength(1);
  expect(within(dialog).getByText('80 kg × 5')).toBeTruthy();
  expect(dialog.contains(document.activeElement)).toBe(true);
  rerender(<RestTimerOverlay nextSet={{ exercise: 'Bench press', weightKg: 82.5, reps: 6 }} />);
  expect(within(dialog).getByText('82.5 kg × 6')).toBeTruthy();
  const close = within(dialog).getByRole('button', { name: copy.close });
  close.focus();
  fireEvent.keyDown(document, { key: 'Tab' });
  expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: copy.restMinus15 }));
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(expand);
  expect(getRestSnapshot().timer.endsAt).not.toBeNull();
});

it('swipes up to expand and down to close; cancellation leaves the view unchanged', () => {
  vi.stubGlobal('PointerEvent', MouseEvent);
  render(<RestTimerOverlay />);
  act(() => startRest('bench', 120));
  const bar = screen.getByRole('button', { name: fill(copy.x4TimerAction, { time: '2:00', action: copy.x4TimerExpand }) });
  fireEvent.pointerDown(bar, { button: 0, clientY: 500 });
  fireEvent.pointerMove(bar, { clientY: 400 });
  fireEvent.pointerCancel(bar);
  fireEvent.pointerUp(bar, { clientY: 400 });
  expect(screen.queryByRole('dialog')).toBeNull();
  fireEvent.pointerDown(bar, { button: 0, clientY: 500 });
  fireEvent.pointerMove(bar, { clientY: 400 });
  fireEvent.pointerUp(bar, { clientY: 400 });
  const countdown = screen.getByRole('dialog').querySelector('.rest-full__readout')!;
  fireEvent.pointerDown(countdown, { button: 0, clientY: 200 });
  fireEvent.pointerMove(countdown, { clientY: 320 });
  fireEvent.pointerUp(countdown, { clientY: 320 });
  expect(screen.queryByRole('dialog')).toBeNull();
  vi.unstubAllGlobals();
});

it('adjusts the same timer in full screen and Skip closes it and clears persisted rest', () => {
  render(<RestTimerOverlay reduceMotion />);
  act(() => startRest('bench', 120));
  fireEvent.click(screen.getByRole('button', { name: fill(copy.x4TimerAction, { time: '2:00', action: copy.x4TimerExpand }) }));
  const dialog = screen.getByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: copy.restMinus15 }));
  expect(within(dialog).getByText('1:45')).toBeTruthy();
  fireEvent.click(within(dialog).getByRole('button', { name: copy.skip }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(localStorage.getItem(REST_TIMER_STORAGE_KEY)).toBeNull();
});
