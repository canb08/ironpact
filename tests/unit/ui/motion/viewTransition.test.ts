// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { startViewTransition } from '../../../../src/ui/motion/viewTransition';

describe('startViewTransition', () => {
  it('runs the update inside the API when it exists', () => {
    const update = vi.fn();
    const start = vi.fn((callback: () => void) => callback());
    Object.defineProperty(document, 'startViewTransition', { configurable: true, value: start });
    expect(startViewTransition(update, false)).toBe('transition');
    expect(start).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledOnce();
    Reflect.deleteProperty(document, 'startViewTransition');
  });

  it('swaps instantly under reduced motion or when the API is missing', () => {
    const update = vi.fn();
    const start = vi.fn();
    Object.defineProperty(document, 'startViewTransition', { configurable: true, value: start });
    expect(startViewTransition(update, true)).toBe('instant');
    expect(start).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledOnce();
    Reflect.deleteProperty(document, 'startViewTransition');
    update.mockClear();
    expect(startViewTransition(update, false)).toBe('instant');
    expect(update).toHaveBeenCalledOnce();
  });
});
