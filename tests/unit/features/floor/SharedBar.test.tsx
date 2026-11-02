// @vitest-environment jsdom
import { StrictMode } from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SharedBar } from '../../../../src/features/floor/SharedBar.tsx';

const me = { id: 'you', name: 'You', credits: 0, target: 3, minCount: 0, weekStart: '2026-11-02' };
const partner = { ...me, id: 'partner', name: 'Partner' };
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function watchAnimation() {
  const animate = vi.fn<(frames: Keyframe[], options: KeyframeAnimationOptions) => Animation>(() => ({ cancel: vi.fn() } as unknown as Animation));
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal('Animation', class {});
  Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: animate });
  return animate;
}

it('slides new full and thin plates on the correct sides once, keeping edits and an unseen week quiet', () => {
  const animate = watchAnimation();
  const view = render(<SharedBar me={me} partner={partner} reduced={false} />);
  expect(animate).not.toHaveBeenCalled();
  view.rerender(<SharedBar me={{ ...me, credits: 1 }} partner={{ ...partner, credits: 0.5, minCount: 1 }} reduced={false} />);
  expect(animate).toHaveBeenCalledTimes(2);
  expect(animate.mock.calls[0]?.[0]).toEqual([{ translate: '-24px 0', opacity: 0 }, { translate: '0 0', opacity: 1 }]);
  expect(animate.mock.calls[1]?.[0]).toEqual([{ translate: '24px 0', opacity: 0 }, { translate: '0 0', opacity: 1 }]);
  view.rerender(<SharedBar me={me} partner={partner} reduced={false} />);
  expect(animate).toHaveBeenCalledTimes(2);
  view.rerender(<SharedBar me={{ ...me, credits: 1, weekStart: '2026-11-09' }} reduced={false} />);
  expect(animate).toHaveBeenCalledTimes(2);
});

it('remembers a partner increase across opens, including StrictMode, without replay on another open', () => {
  const animate = watchAnimation();
  const first = render(<SharedBar me={me} partner={partner} reduced={false} />);
  first.unmount();
  const second = render(<StrictMode><SharedBar me={me} partner={{ ...partner, credits: 1 }} reduced={false} /></StrictMode>);
  expect(animate).toHaveBeenCalledTimes(1);
  second.unmount();
  render(<SharedBar me={me} partner={{ ...partner, credits: 1 }} reduced={false} />);
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
  expect(animate).not.toHaveBeenCalled();
});
