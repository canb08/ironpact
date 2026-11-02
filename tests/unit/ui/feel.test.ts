// @vitest-environment jsdom
import { createElement, useState } from 'react';
import { fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HAPTIC_PATTERNS, setHapticsOn, setIosHapticsTrick, setPulseMs } from '../../../src/platform/haptics';
import { FEEL_KINDS, feel, useFeel, type FeelKind } from '../../../src/ui/feel/feel';

const audio = vi.hoisted(() => ({
  play: vi.fn<(cue: string, options?: { weightKg?: number }) => boolean>(() => true),
  soundOn: true,
}));

vi.mock('../../../src/platform/audio', () => ({
  play: audio.play,
  soundEnabled: () => audio.soundOn,
}));

const CUES: Record<FeelKind, string[]> = {
  tick: [],
  set: ['clank'],
  plate: ['plate'],
  round: ['bell'],
  pr: ['bell', 'pr-riser'],
  lockout: ['lockout'],
  error: ['thud'],
};

afterEach(() => {
  audio.play.mockClear();
  audio.soundOn = true;
  setHapticsOn(true);
  setIosHapticsTrick(false);
  delete document.documentElement.dataset.reducedMotion;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function vibrateSpy() {
  const vibrate = vi.fn(() => true);
  Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vibrate });
  return vibrate;
}

describe('feel', () => {
  it('fires the matching pattern and cue for every kind', () => {
    const vibrate = vibrateSpy();
    for (const kind of FEEL_KINDS) {
      audio.play.mockClear();
      vibrate.mockClear();
      const pulses: string[] = [];
      const weightKg = kind === 'set' ? 100 : undefined;
      const result = feel(kind, {
        weightKg,
        pulse: (pulse) => pulses.push(pulse.visual),
      });
      const expected = kind === 'set' ? [setPulseMs(100)] : [...patternFor(kind)];
      expect(vibrate.mock.calls).toEqual([[expected]]);
      expect(audio.play.mock.calls.map((call) => call[0])).toEqual(CUES[kind]);
      if (kind === 'set') expect(audio.play.mock.calls[0]?.[1]).toEqual({ weightKg: 100 });
      expect(result.haptic).toBe(true);
      expect(result.sound).toBe(kind !== 'tick');
      expect(pulses).toEqual([result.pulse.visual]);
      expect(result.pulse.instant).toBe(false);
      expect(result.pulse.shakePx).toBe(kind === 'error' ? 6 : 0);
    }
    expect(HAPTIC_PATTERNS.tick).toEqual([8]);
  });

  it('skips haptics and sound when each is disabled, and still reports the pulse', () => {
    const vibrate = vibrateSpy();
    setHapticsOn(false);
    const quiet = feel('set', { weightKg: 40 });
    expect(quiet.haptic).toBe(false);
    expect(vibrate).not.toHaveBeenCalled();
    expect(audio.play).toHaveBeenCalledWith('clank', { weightKg: 40 });

    audio.play.mockClear();
    audio.soundOn = false;
    setHapticsOn(true);
    const silent = feel('error');
    expect(silent.sound).toBe(false);
    expect(audio.play).not.toHaveBeenCalled();
    expect(vibrate).toHaveBeenCalledWith([10, 10, 10]);
    expect(silent.pulse.shakePx).toBe(6);
  });

  it('keeps the haptic and drops the shake when motion is reduced', () => {
    const vibrate = vibrateSpy();
    const explicit = feel('error', { reducedMotion: true });
    expect(explicit.haptic).toBe(true);
    expect(explicit.pulse.instant).toBe(true);
    expect(explicit.pulse.shakePx).toBe(0);
    expect(explicit.pulse.visual).toBe('shake');
    expect(vibrate).toHaveBeenCalledWith([10, 10, 10]);
    expect(audio.play).toHaveBeenCalledWith('thud', undefined);

    document.documentElement.dataset.reducedMotion = 'on';
    const flagged = feel('plate');
    expect(flagged.pulse.instant).toBe(true);
    expect(flagged.pulse.visual).toBe('plate-slide');
    expect(flagged.haptic).toBe(true);
  });

  it('useFeel returns a feel call', () => {
    vibrateSpy();
    function Probe() {
      const fire = useFeel();
      const [label, setLabel] = useState('ready');
      return createElement('button', {
        type: 'button',
        onClick: () => setLabel(String(fire('tick').pulse.visual)),
      }, label);
    }
    const view = render(createElement(Probe));
    fireEvent.click(view.getByRole('button'));
    expect(view.getByRole('button').textContent).toBe('none');
  });
});

function patternFor(kind: FeelKind): readonly number[] {
  switch (kind) {
    case 'tick':
      return HAPTIC_PATTERNS.tick;
    case 'set':
      return [setPulseMs()];
    case 'plate':
      return HAPTIC_PATTERNS.plate;
    case 'round':
      return HAPTIC_PATTERNS.round;
    case 'pr':
      return HAPTIC_PATTERNS.prRamp;
    case 'lockout':
      return HAPTIC_PATTERNS.lockout;
    case 'error':
      return HAPTIC_PATTERNS.error;
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}
