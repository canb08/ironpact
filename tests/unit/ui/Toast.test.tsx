// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Button, ToastProvider, copy, useToast } from '../../../src/ui';

function Example({ action }: { action: () => void }) {
  const { showToast } = useToast();
  return (
    <>
      <Button
        onClick={() =>
          showToast({
            message: copy.setLogged,
            timeoutMs: 2000,
            action: { label: copy.undo, onClick: action },
          })
        }
      >
        {copy.logSet}
      </Button>
      <Button onClick={() => showToast({ message: copy.minQuick, timeoutMs: 3000 })}>
        {copy.min}
      </Button>
    </>
  );
}

describe('Toast queue', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('announces politely, fires the optional action once and dismisses', () => {
    const action = vi.fn();
    render(
      <ToastProvider>
        <Example action={action} />
      </ToastProvider>,
    );
    expect(screen.getByRole('status').getAttribute('aria-live')).toBe('polite');
    fireEvent.click(screen.getByRole('button', { name: copy.logSet }));
    expect(screen.getByRole('status').textContent).toBe(copy.setLogged);
    fireEvent.click(screen.getByRole('button', { name: copy.undo }));
    expect(action).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status').textContent).toBe('');
    act(() => vi.advanceTimersByTime(2000));
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('auto-dismisses in FIFO order, starting each timeout when shown', () => {
    const action = vi.fn();
    const view = render(
      <ToastProvider>
        <Example action={action} />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: copy.logSet }));
    act(() => vi.advanceTimersByTime(1000));
    fireEvent.click(screen.getByRole('button', { name: copy.min }));
    act(() => vi.advanceTimersByTime(999));
    expect(screen.getByRole('status').textContent).toBe(copy.setLogged);
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole('status').textContent).toBe(copy.minQuick);
    expect(screen.queryByRole('button', { name: copy.undo })).toBeNull();
    act(() => vi.advanceTimersByTime(2999));
    expect(screen.getByRole('status').textContent).toBe(copy.minQuick);
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole('status').textContent).toBe('');
    expect(action).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: copy.logSet }));
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('supports explicit dismissal without invoking the action', () => {
    const action = vi.fn();
    render(
      <ToastProvider>
        <Example action={action} />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: copy.logSet }));
    fireEvent.click(screen.getByRole('button', { name: copy.dismiss }));
    expect(screen.getByRole('status').textContent).toBe('');
    expect(action).not.toHaveBeenCalled();
  });
});
