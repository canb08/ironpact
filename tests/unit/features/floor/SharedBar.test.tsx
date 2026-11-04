// @vitest-environment jsdom
import { StrictMode } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SharedBar } from '../../../../src/features/floor/SharedBar.tsx';

const me = { id: 'you', name: 'You', credits: 0, target: 3, minCount: 0, weekStart: '2026-11-02' };
const partner = { ...me, id: 'partner', name: 'Partner' };
vi.mock('../../../../src/ui/motion/AnimatedNumber', () => ({ AnimatedNumber: ({ value }: { value: number }) => <span>{value}</span> }));
vi.mock('../../../../src/ui/feel/feel', () => ({ feel: vi.fn() }));
import { feel } from '../../../../src/ui/feel/feel';
afterEach(() => { cleanup(); vi.useRealTimers(); localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function watchAnimation() {
  vi.useFakeTimers();
  const animate = vi.fn<(frames: Keyframe[], options: KeyframeAnimationOptions) => Animation>(() => ({ cancel: vi.fn() } as unknown as Animation));
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal('Animation', class {});
  Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: animate });
  return animate;
}

it('slides new full and thin plates on the correct sides once, keeping edits and an unseen week quiet', () => {
  const animate = watchAnimation();
  const view = render(<SharedBar me={me} partner={partner} reduced={false} />);
  act(() => vi.advanceTimersByTime(0));
  expect(animate).not.toHaveBeenCalled();
  view.rerender(<SharedBar me={{ ...me, credits: 1 }} partner={{ ...partner, credits: 0.5, minCount: 1 }} reduced={false} />);
  act(() => vi.advanceTimersByTime(0));
  expect(animate).toHaveBeenCalledTimes(2);
  expect(animate.mock.calls[0]?.[0]).toEqual([{ translate: '0 -72px', opacity: 0 }, { translate: '0 0', opacity: 1 }]);
  expect(animate.mock.calls[1]?.[0]).toEqual([{ translate: '0 -72px', opacity: 0 }, { translate: '0 0', opacity: 1 }]);
  view.rerender(<SharedBar me={me} partner={partner} reduced={false} />);
  act(() => vi.advanceTimersByTime(0));
  expect(animate).toHaveBeenCalledTimes(2);
  view.rerender(<SharedBar me={{ ...me, credits: 1, weekStart: '2026-11-09' }} reduced={false} />);
  act(() => vi.advanceTimersByTime(0));
  expect(animate).toHaveBeenCalledTimes(2);
});

it('remembers a partner increase across opens, including StrictMode, without replay on another open', () => {
  const animate = watchAnimation();
  const first = render(<SharedBar me={me} partner={partner} reduced={false} />);
  act(() => vi.advanceTimersByTime(0));
  first.unmount();
  const second = render(<StrictMode><SharedBar me={me} partner={{ ...partner, credits: 1 }} reduced={false} /></StrictMode>);
  act(() => vi.advanceTimersByTime(0));
  expect(animate).toHaveBeenCalledTimes(1);
  second.unmount();
  render(<SharedBar me={me} partner={{ ...partner, credits: 1 }} reduced={false} />);
  act(() => vi.advanceTimersByTime(0));
  expect(animate).toHaveBeenCalledTimes(1);
});

it('keeps OS and profile reduced motion instant and works with blocked storage', () => {
  const animate = watchAnimation();
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
  const view = render(<SharedBar me={me} reduced />);
  view.rerender(<SharedBar me={{ ...me, credits: 1 }} reduced />);
  expect(animate).not.toHaveBeenCalled();
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
  view.unmount();
  const os = render(<SharedBar me={me} reduced={false} />);
  os.rerender(<SharedBar me={{ ...me, credits: 1 }} reduced={false} />);
  act(() => vi.advanceTimersByTime(0));
  expect(animate).not.toHaveBeenCalled();
});

it('delivers partner plates one at a time, then locks once; historical weeks stay quiet', () => {
  watchAnimation();
  vi.mocked(feel).mockClear();
  const first = render(<SharedBar me={me} partner={partner} reduced={false} />);
  act(() => vi.advanceTimersByTime(0));
  first.rerender(<SharedBar me={{ ...me, credits: 3 }} partner={{ ...partner, credits: 3 }} reduced={false} />);
  act(() => vi.advanceTimersByTime(0));
  expect(vi.mocked(feel).mock.calls.map(([kind]) => kind)).toEqual(['plate', 'plate']);
  act(() => vi.advanceTimersByTime(180));
  expect(vi.mocked(feel).mock.calls.filter(([kind]) => kind === 'plate')).toHaveLength(4);
  act(() => vi.advanceTimersByTime(1500));
  expect(vi.mocked(feel).mock.calls.filter(([kind]) => kind === 'lockout')).toHaveLength(1);
  first.unmount();
  render(<StrictMode><SharedBar me={{ ...me, credits: 3 }} partner={{ ...partner, credits: 3 }} reduced={false} /></StrictMode>);
  act(() => vi.runAllTimers());
  expect(vi.mocked(feel).mock.calls.filter(([kind]) => kind === 'lockout')).toHaveLength(1);
  vi.mocked(feel).mockClear();
  render(<SharedBar me={{ ...me, credits: 3, weekStart: '2026-10-26' }} partner={{ ...partner, credits: 3 }} reduced={false} current={false} />);
  act(() => vi.runAllTimers());
  expect(feel).not.toHaveBeenCalled();
});
