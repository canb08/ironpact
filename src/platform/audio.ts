/**
 * Web Audio synth, no files (§3.8). Off until `setSoundOn(true)` (`sound_on`).
 * The context is created and resumed on the first tap. `audioSession.type` is
 * set to `playback` only when that object exists. A missing API or a rejected
 * resume is a no-op: nothing breaks and nothing is shown.
 */
import { useEffect, useSyncExternalStore } from 'react';

export const SOUND_CUES = ['clank', '3-2-1', 'bell', 'pr-riser', 'ring-chord', 'plate'] as const;
export type SoundCue = (typeof SOUND_CUES)[number];

const listeners = new Set<() => void>();
let soundOn = false;
let context: AudioContext | null = null;
let onPointer: (() => void) | null = null;

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function soundEnabled(): boolean {
  return soundOn;
}

export function setSoundOn(on: boolean): void {
  if (soundOn === on) return;
  soundOn = on;
  emit();
}

export function audioUnlocked(): boolean {
  return context?.state === 'running';
}

type AudioSessionLike = { type: string };

function applyPlaybackSession(): void {
  if (typeof navigator === 'undefined') return;
  try {
    const session = (navigator as Navigator & { audioSession?: AudioSessionLike }).audioSession;
    if (!session || typeof session.type !== 'string') return;
    session.type = 'playback';
  } catch {
    /* Feature is optional. Silent-switch behaviour is unverified. */
  }
}

function audioContextCtor(): (new () => AudioContext) | null {
  if (typeof globalThis.AudioContext !== 'function') return null;
  return globalThis.AudioContext;
}

function ensureContext(): AudioContext | null {
  if (context) return context;
  const Ctor = audioContextCtor();
  if (!Ctor) return null;
  try {
    context = new Ctor();
    return context;
  } catch {
    return null;
  }
}

function disarm(): void {
  if (onPointer && typeof window !== 'undefined') {
    window.removeEventListener('pointerdown', onPointer, true);
  }
  onPointer = null;
}

/** Listen for the first tap of this launch. Safe to call more than once. */
export function armAudioUnlock(): void {
  if (onPointer || typeof window === 'undefined') return;
  if (context?.state === 'running') return;
  onPointer = () => {
    void unlockAudio();
  };
  window.addEventListener('pointerdown', onPointer, true);
}

/** Create and resume the context. Call from a user gesture (the first tap). */
export async function unlockAudio(): Promise<boolean> {
  applyPlaybackSession();
  try {
    const ctx = ensureContext();
    if (!ctx) return false;
    if (ctx.state !== 'running') await ctx.resume();
    if (ctx.state !== 'running') return false;
    disarm();
    return true;
  } catch {
    return false;
  }
}

function tone(ctx: AudioContext, freq: number, start: number, end: number, peak: number): void {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(peak, Math.min(start + 0.005, end));
  gain.gain.linearRampToValueAtTime(0, end);
  gain.connect(ctx.destination);
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, start);
  osc.connect(gain);
  osc.start(start);
  osc.stop(end);
}

function toneHeld(
  ctx: AudioContext,
  freq: number,
  start: number,
  attackAt: number,
  holdAt: number,
  end: number,
  peak: number,
): void {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(peak, attackAt);
  if (holdAt > attackAt) gain.gain.setValueAtTime(peak, holdAt);
  gain.gain.linearRampToValueAtTime(0, end);
  gain.connect(ctx.destination);
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, start);
  osc.connect(gain);
  osc.start(start);
  osc.stop(end);
}

function fillNoise(data: Float32Array): void {
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
}

function noiseBurst(
  ctx: AudioContext,
  start: number,
  seconds: number,
  frequency: number,
  q: number,
  peak: number,
): void {
  const frames = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  fillNoise(buffer.getChannelData(0));
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(frequency, start);
  filter.Q.setValueAtTime(q, start);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(peak, start + 0.002);
  gain.gain.linearRampToValueAtTime(0, start + seconds);
  filter.connect(gain);
  gain.connect(ctx.destination);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(filter);
  source.start(start);
  source.stop(start + seconds);
}

/** Two detuned sines plus a 40 ms bandpass noise burst. `peak` is the sine ceiling. */
function metal(ctx: AudioContext, t: number, peak: number, gainEnd: number, oscEnd: number): void {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(peak, t + 0.005);
  gain.gain.linearRampToValueAtTime(0, gainEnd);
  gain.connect(ctx.destination);
  for (const freq of [110, 165]) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    osc.connect(gain);
    osc.start(t);
    osc.stop(oscEnd);
  }
  noiseBurst(ctx, t, 0.04, 2500, 1.2, peak);
}

function bell(ctx: AudioContext, t: number): void {
  for (let i = 0; i < 3; i += 1) {
    const hit = t + i * 0.3;
    const mid = hit + 0.14;
    tone(ctx, 660, hit, mid, 0.5);
    tone(ctx, 990, mid, mid + 0.14, 0.5);
  }
}

function riser(ctx: AudioContext, t: number): void {
  const sweepEnd = t + 0.9;
  const frames = Math.max(1, Math.floor(ctx.sampleRate * 0.9));
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  fillNoise(buffer.getChannelData(0));
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(400, t);
  filter.frequency.exponentialRampToValueAtTime(4000, sweepEnd);
  // §3.8 names a Q only for the clank burst. 1 is the Web Audio default.
  filter.Q.setValueAtTime(1, t);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(0.5, t + 0.02);
  gain.gain.linearRampToValueAtTime(0, sweepEnd);
  filter.connect(gain);
  gain.connect(ctx.destination);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(filter);
  source.start(t);
  source.stop(sweepEnd);
  tone(ctx, 55, sweepEnd, t + 1.1, 0.5);
}

function chord(ctx: AudioContext, t: number): void {
  const notes = [110, 165, 220] as const;
  for (let i = 0; i < notes.length; i += 1) {
    const freq = notes[i];
    if (freq === undefined) continue;
    const start = t + i * 0.18;
    toneHeld(ctx, freq, start, start + 0.01, start + 0.18, start + 0.34, 0.3);
  }
}

function renderCue(ctx: AudioContext, cue: SoundCue): void {
  const t = ctx.currentTime;
  switch (cue) {
    case 'clank':
      metal(ctx, t, 0.5, t + 0.175, t + 0.18);
      return;
    case 'plate':
      metal(ctx, t, 0.3, t + 0.12, t + 0.12);
      return;
    case '3-2-1':
      tone(ctx, 880, t, t + 0.06, 0.5);
      return;
    case 'bell':
      bell(ctx, t);
      return;
    case 'pr-riser':
      riser(ctx, t);
      return;
    case 'ring-chord':
      chord(ctx, t);
      return;
    default: {
      const exhaustive: never = cue;
      return exhaustive;
    }
  }
}

/** False when sound is off, the context is not running, or synthesis throws. */
export function play(cue: SoundCue): boolean {
  if (!soundOn) return false;
  const ctx = context;
  if (!ctx || ctx.state !== 'running') return false;
  try {
    renderCue(ctx, cue);
    return true;
  } catch {
    return false;
  }
}

export function useSound(): { enabled: boolean; play: (cue: SoundCue) => boolean } {
  const enabled = useSyncExternalStore(subscribe, soundEnabled, soundEnabled);
  useEffect(() => {
    armAudioUnlock();
  }, []);
  return { enabled, play };
}

/** Drops the module context. Unit tests only. */
export function resetAudioForTests(): void {
  soundOn = false;
  emit();
  disarm();
  const current = context;
  context = null;
  if (!current) return;
  try {
    void current.close();
  } catch {
    /* A test double may not implement close. */
  }
}
