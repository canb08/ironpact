// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HoldButton, copy } from '../../../src/ui';

describe('HoldButton', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('fires once only after the complete 600 ms pointer hold', () => {
    const complete = vi.fn();
    render(<HoldButton onHoldComplete={complete}>{copy.finish}</HoldButton>);
    const button = screen.getByRole('button');
    fireEvent.pointerDown(button, { button: 0, pointerId: 1 });
    act(() => vi.advanceTimersByTime(599));
    expect(complete).not.toHaveBeenCalled();
    expect(screen.getByRole('progressbar').getAttribute('value')).not.toBe('0');
    act(() => vi.advanceTimersByTime(1));
    expect(complete).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(1200));
    expect(complete).toHaveBeenCalledTimes(1);
    fireEvent.pointerUp(button, { pointerId: 1 });
    expect(screen.getByRole('progressbar').getAttribute('value')).toBe('0');
  });

  it.each(['pointerUp', 'pointerLeave', 'pointerCancel', 'lostPointerCapture', 'blur'] as const)(
    'cancels on %s before completion',
    (event) => {
      const complete = vi.fn();
      render(<HoldButton onHoldComplete={complete}>{copy.finish}</HoldButton>);
      const button = screen.getByRole('button');
      fireEvent.pointerDown(button, { button: 0, pointerId: 1 });
      act(() => vi.advanceTimersByTime(300));
      fireEvent[event](button, { pointerId: 1 });
      act(() => vi.advanceTimersByTime(1000));
      expect(complete).not.toHaveBeenCalled();
    },
  );

  it.each([' ', 'Enter'])('supports holding %j without repeat or click bypass', (key) => {
    const complete = vi.fn();
    render(
      <HoldButton onHoldComplete={complete} holdMs={800}>
        {copy.finish}
      </HoldButton>,
    );
    const button = screen.getByRole('button');
    fireEvent.click(button);
    fireEvent.keyDown(button, { key });
    act(() => vi.advanceTimersByTime(799));
    expect(complete).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    fireEvent.keyDown(button, { key, repeat: true });
    act(() => vi.advanceTimersByTime(1000));
    expect(complete).toHaveBeenCalledTimes(1);
    fireEvent.keyUp(button, { key });
    fireEvent.keyDown(button, { key });
    act(() => vi.advanceTimersByTime(300));
    fireEvent.keyUp(button, { key });
    act(() => vi.advanceTimersByTime(1000));
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('cancels when disabled, window blurs, or unmounted', () => {
    const complete = vi.fn();
    const view = render(<HoldButton onHoldComplete={complete}>{copy.finish}</HoldButton>);
    fireEvent.keyDown(screen.getByRole('button'), { key: ' ' });
    act(() => vi.advanceTimersByTime(300));
    view.rerender(
      <HoldButton onHoldComplete={complete} disabled>
        {copy.finish}
      </HoldButton>,
    );
    act(() => vi.advanceTimersByTime(600));
    expect(complete).not.toHaveBeenCalled();
    view.rerender(<HoldButton onHoldComplete={complete}>{copy.finish}</HoldButton>);
    fireEvent.keyDown(screen.getByRole('button'), { key: ' ' });
    fireEvent(window, new Event('blur'));
    act(() => vi.advanceTimersByTime(600));
    expect(complete).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole('button'), { key: ' ' });
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
