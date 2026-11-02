import { useCallback } from 'react';
import { play, soundEnabled, type SoundCue } from '../../platform/audio';
import {
  hapticsEnabled,
  setPulseMs,
  vibrate,
  HAPTIC_PATTERNS,
} from '../../platform/haptics';
import { useMotionReduced } from '../motion/reduced-context';
import { motionIsReduced, useReducedMotion } from '../motion/reduced';

export const FEEL_KINDS = ['tick', 'set', 'plate', 'round', 'pr', 'lockout', 'error'] as const;
export type FeelKind = (typeof FEEL_KINDS)[number];

export type FeelVisual = 'none' | 'dock-flash' | 'plate-slide' | 'ring-pulse' | 'pr-takeover' | 'lockout' | 'shake';

export type FeelPulse = {
  kind: FeelKind;
  visual: FeelVisual;
  /** 6 on `error` when motion is allowed. 0 otherwise, including reduced motion. */
  shakePx: number;
  /** Reduced motion: snap to the end state. Do not animate. */
  instant: boolean;
};

export type FeelOptions = {
  weightKg?: number;
  reducedMotion?: boolean;
  pulse?: (pulse: FeelPulse) => void;
};

export type FeelResult = {
  kind: FeelKind;
  haptic: boolean;
  sound: boolean;
  pulse: FeelPulse;
};

const VISUAL: Record<FeelKind, FeelVisual> = {
  tick: 'none',
  set: 'dock-flash',
  plate: 'plate-slide',
  round: 'ring-pulse',
  pr: 'pr-takeover',
  lockout: 'lockout',
  error: 'shake',
};

const CUES: Record<FeelKind, readonly SoundCue[]> = {
  tick: [],
  set: ['clank'],
  plate: ['plate'],
  round: ['bell'],
  pr: ['bell', 'pr-riser'],
  lockout: ['lockout'],
  error: ['thud'],
};

/** Vibration pattern for one feel kind. `set` lengthens with `weightKg`. */
export function feelHapticPattern(kind: FeelKind, weightKg?: number): readonly number[] {
  switch (kind) {
    case 'tick':
      return HAPTIC_PATTERNS.tick;
    case 'set':
      return [setPulseMs(weightKg)];
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

function documentReduced(): boolean {
  return typeof document !== 'undefined' && document.documentElement.dataset.reducedMotion === 'on';
}

function motionReduced(opts?: FeelOptions): boolean {
  const flagged = documentReduced() || motionIsReduced(false);
  if (opts?.reducedMotion !== undefined) return opts.reducedMotion || flagged;
  return flagged;
}

/**
 * One call for haptic, sound and an optional visual pulse (FEEL §3).
 * Does not touch the DOM. Callers paint the pulse. Nothing here blocks input.
 */
export function feel(kind: FeelKind, opts?: FeelOptions): FeelResult {
  const reduced = motionReduced(opts);
  const pulse: FeelPulse = {
    kind,
    visual: VISUAL[kind],
    shakePx: kind === 'error' && !reduced ? 6 : 0,
    instant: reduced,
  };
  const didHaptic = hapticsEnabled() ? vibrate(feelHapticPattern(kind, opts?.weightKg)) : false;
  let didSound = false;
  if (soundEnabled()) {
    for (const cue of CUES[kind]) {
      const played = play(cue, kind === 'set' ? { weightKg: opts?.weightKg } : undefined);
      didSound = didSound || played;
    }
  }
  opts?.pulse?.(pulse);
  return { kind, haptic: didHaptic, sound: didSound, pulse };
}

/** `feel` bound to the current reduced-motion flags. */
export function useFeel(onPulse?: (pulse: FeelPulse) => void) {
  const mediaReduced = useReducedMotion();
  const profileReduced = useMotionReduced();
  const reduced = mediaReduced || profileReduced;
  return useCallback((kind: FeelKind, opts?: FeelOptions) => feel(kind, {
    weightKg: opts?.weightKg,
    reducedMotion: opts?.reducedMotion ?? reduced,
    pulse: opts?.pulse ?? onPulse,
  }), [onPulse, reduced]);
}
