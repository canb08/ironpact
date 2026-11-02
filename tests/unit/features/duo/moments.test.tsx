// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { DuoMoments } from '../../../../src/features/duo/DuoMoments';
import { ForgeFlame } from '../../../../src/features/duo/ForgeFlame';
import { PartnerShockwave } from '../../../../src/features/duo/PartnerShockwave';
import { flameBreath } from '../../../../src/features/duo/flame';
import { resetRingCloseForTests } from '../../../../src/features/duo/ringClose';
import { resetShockwaveForTests, type ShockwaveEvent } from '../../../../src/features/duo/shockwave';
import { resetTierMomentForTests, tierMomentDecision } from '../../../../src/features/duo/tierMoment';
import { copy } from '../../../../src/ui/copy';
import type { RingMember } from '../../../../src/ui/Ring';

const event: ShockwaveEvent = { id: 'pr-1', name: 'partner', exercise: 'Bench', detail: '85 kg × 5' };

const closed: RingMember[] = [
  { id: 'you', name: 'You', initial: 'Y', color: '#C6FF00', target: 1, credits: 1 },
  { id: 'partner', name: 'partner', initial: 'P', color: '#00D1FF', target: 1, credits: 1 },
];

afterEach(() => {
  cleanup();
  resetShockwaveForTests();
  resetRingCloseForTests();
  resetTierMomentForTests();
});

function tick(): Promise<void> {
  return new Promise((resolve) => { window.setTimeout(resolve, 30); });
}

it('plays the partner shockwave once and not on the next open', async () => {
  render(<PartnerShockwave events={[event]} inSession={false} reduced={false} />);
  const card = await screen.findByTestId('partner-shockwave');
  expect(card.textContent).toContain(copy.shockwaveStamp);
  expect(card.textContent).toContain('partner · Bench · 85 kg × 5');
  expect(card.querySelector('canvas')).toBeNull();
  cleanup();

  render(<PartnerShockwave events={[event]} inSession={false} reduced={false} />);
  await tick();
  expect(screen.queryByTestId('partner-shockwave')).toBeNull();
});

it('defers the shockwave during a session, then plays it once the session is gone', async () => {
  const view = render(<PartnerShockwave events={[event]} inSession reduced={false} />);
  await tick();
  expect(screen.queryByTestId('partner-shockwave')).toBeNull();
  view.rerender(<PartnerShockwave events={[event]} inSession={false} reduced={false} />);
  expect((await screen.findByTestId('partner-shockwave')).getAttribute('data-shockwave')).toBe('pr-1');
});

it('reduced motion keeps the flame static and canvas-free', () => {
  const { container } = render(<ForgeFlame plates={4} tier="Steel" reduced />);
  const flame = container.querySelector('.forge-flame');
  expect(flame?.getAttribute('data-motion')).toBe('static');
  expect(flame?.getAttribute('data-breath')).toBe('paused');
  expect(container.querySelector('canvas')).toBeNull();
  expect(flameBreath({ reduced: true, batterySaver: false, onScreen: true })).toBe('paused');
  expect(flameBreath({ reduced: false, batterySaver: true, onScreen: true })).toBe('paused');
  expect(flameBreath({ reduced: false, batterySaver: false, onScreen: false })).toBe('paused');
  expect(flameBreath({ reduced: false, batterySaver: false, onScreen: true })).toBe('running');
});

it('shows the co-op ring close once, static and without canvas when motion is reduced', async () => {
  const props = {
    screen: 'floor-test',
    crewId: 'crew-1',
    weekStart: '2026-10-19',
    members: closed,
    weekFull: true,
    plates: 0,
    tier: 'Iron' as const,
    reduced: true,
    archived: false,
    inSession: false,
  };
  const first = render(<DuoMoments {...props} />);
  const close = await screen.findByTestId('ring-close');
  expect(close.getAttribute('data-motion')).toBe('static');
  expect(close.textContent).toContain(copy.ringClosed);
  expect(close.querySelector('canvas')).toBeNull();
  expect(close.querySelector('[data-puff]')).toBeNull();
  first.unmount();

  render(<DuoMoments {...props} />);
  await tick();
  expect(screen.queryByTestId('ring-close')).toBeNull();
});

it('celebrates a bar tier-up once and keeps a drop quiet', () => {
  expect(tierMomentDecision(null, 'Iron')).toEqual({ store: 'Iron', celebrate: null });
  expect(tierMomentDecision('Iron', 'Steel')).toEqual({ store: 'Steel', celebrate: 'Steel' });
  expect(tierMomentDecision('Steel', 'Iron')).toEqual({ store: 'Iron', celebrate: null });
});

it('acknowledges each queued card only when it starts, including after session deferral', async () => {
  vi.useFakeTimers();
  try {
    const first = vi.fn();
    const second = vi.fn();
    const events = [{ ...event, onPlayed: first }, { ...event, id: 'pr-2', onPlayed: second }];
    const view = render(<PartnerShockwave events={events} inSession reduced />);
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
    view.rerender(<PartnerShockwave events={events} inSession={false} reduced />);
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
    expect(screen.getByTestId('partner-shockwave').getAttribute('data-shockwave')).toBe('pr-1');
    await act(() => vi.advanceTimersByTimeAsync(1500));
    expect(second).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('partner-shockwave').getAttribute('data-shockwave')).toBe('pr-2');
    await act(() => vi.advanceTimersByTimeAsync(1500));
    expect(screen.queryByTestId('partner-shockwave')).toBeNull();
  } finally { cleanup(); vi.useRealTimers(); }
});
