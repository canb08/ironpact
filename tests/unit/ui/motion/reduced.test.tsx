// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnimatedNumber } from '../../../../src/ui/motion/AnimatedNumber';
import { MotionProvider } from '../../../../src/ui/motion/MotionProvider';
import { motionIsReduced, useReducedMotion } from '../../../../src/ui/motion/reduced';
import { SetLoggedMotion } from '../../../../src/ui/motion/SetLogged';
import { MomentHost } from '../../../../src/ui/moments/MomentHost';
import { registerMomentView } from '../../../../src/ui/moments/registry';
import { createMomentQueue } from '../../../../src/ui/moments/queue';

vi.mock('@number-flow/react', () => ({
  default: ({ value }: { value: number }) => <span data-number-flow="">{value}</span>,
}));

function ReducedProbe({ profile = false }: { profile?: boolean }) {
  const reduced = useReducedMotion(profile);
  return <span data-reduced={reduced ? 'yes' : 'no'} />;
}

describe('reduced motion', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is on when the media query matches or the profile flag is set', () => {
    expect(motionIsReduced(false, false)).toBe(false);
    expect(motionIsReduced(true, false)).toBe(true);
    expect(motionIsReduced(false, true)).toBe(true);
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    render(<ReducedProbe />);
    expect(document.querySelector('[data-reduced]')?.getAttribute('data-reduced')).toBe('yes');
  });

  it('renders every motion component static', async () => {
    const queue = createMomentQueue();
    queue.register({ id: 'pr', tier: 1, kind: 'pr' });
    const unregister = registerMomentView('pr', () => <p>Takeover</p>);
    render(
      <MotionProvider reduced>
        <p>provider child</p>
        <SetLoggedMotion playKey={3} reduced>set card</SetLoggedMotion>
        <AnimatedNumber value={42} reduced />
        <MomentHost screen="floor" queue={queue} />
      </MotionProvider>,
    );
    act(() => {
      queue.trigger('pr', performance.now());
    });

    expect(document.querySelector('[data-motion="live"]')).toBeNull();
    const staticNodes = document.querySelectorAll('[data-motion="static"]');
    expect(staticNodes.length).toBeGreaterThanOrEqual(3);
    for (const node of staticNodes) expect((node as HTMLElement).style.transform).toBe('');
    expect(screen.getByText('provider child')).toBeTruthy();
    expect(screen.getByText('set card')).toBeTruthy();
    expect(screen.getByText('42')).toBeTruthy();
    expect(screen.queryByText('42')?.getAttribute('data-number-flow')).toBeNull();
    const host = document.querySelector('[data-moment="pr"]');
    expect(host?.getAttribute('data-motion')).toBe('static');
    expect(host?.className).toContain('moment-host--static');
    expect(screen.getByText('Takeover')).toBeTruthy();
    unregister();
  });
});
