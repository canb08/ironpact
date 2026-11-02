// @vitest-environment jsdom
import { createElement } from 'react';
import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  armAudioUnlock,
  audioUnlocked,
  play,
  resetAudioForTests,
  setSoundOn,
  soundEnabled,
  unlockAudio,
  useSound,
} from '../../../src/platform/audio';

type Ramp = { value: number; time: number };

function makeParam() {
  const sets: Ramp[] = [];
  const linear: Ramp[] = [];
  const expo: Ramp[] = [];
  return {
    sets,
    linear,
    expo,
    setValueAtTime(value: number, time: number) {
      sets.push({ value, time });
    },
    linearRampToValueAtTime(value: number, time: number) {
      linear.push({ value, time });
    },
    exponentialRampToValueAtTime(value: number, time: number) {
      expo.push({ value, time });
    },
  };
}

type Osc = {
  type: OscillatorType;
  frequency: ReturnType<typeof makeParam>;
  dest: unknown;
  startAt: number | null;
  stopAt: number | null;
  connect(dest: unknown): void;
  start(when?: number): void;
  stop(when?: number): void;
};

type Gain = {
  gain: ReturnType<typeof makeParam>;
  dest: unknown;
  connect(dest: unknown): void;
};

type Filter = {
  type: BiquadFilterType;
  frequency: ReturnType<typeof makeParam>;
  Q: ReturnType<typeof makeParam>;
  dest: unknown;
  connect(dest: unknown): void;
};

type Source = {
  buffer: { length: number; data: Float32Array } | null;
  dest: unknown;
  startAt: number | null;
  stopAt: number | null;
  connect(dest: unknown): void;
  start(when?: number): void;
  stop(when?: number): void;
};

function makeOsc(): Osc {
  return {
    type: 'sine',
    frequency: makeParam(),
    dest: null,
    startAt: null,
    stopAt: null,
    connect(dest) {
      this.dest = dest;
    },
    start(when) {
      this.startAt = when ?? null;
    },
    stop(when) {
      this.stopAt = when ?? null;
    },
  };
}

function makeGain(): Gain {
  return {
    gain: makeParam(),
    dest: null,
    connect(dest) {
      this.dest = dest;
    },
  };
}

function makeFilter(): Filter {
  return {
    type: 'lowpass',
    frequency: makeParam(),
    Q: makeParam(),
    dest: null,
    connect(dest) {
      this.dest = dest;
    },
  };
}

function makeSource(): Source {
  return {
    buffer: null,
    dest: null,
    startAt: null,
    stopAt: null,
    connect(dest) {
      this.dest = dest;
    },
    start(when) {
      this.startAt = when ?? null;
    },
    stop(when) {
      this.stopAt = when ?? null;
    },
  };
}

function install() {
  const oscs: Osc[] = [];
  const gains: Gain[] = [];
  const filters: Filter[] = [];
  const sources: Source[] = [];
  const flags = { failResume: false, throwOnOsc: false };
  let constructed = 0;
  const destination = { name: 'dest' };

  class FakeAudioContext {
    state: AudioContextState = 'suspended';
    currentTime = 5;
    sampleRate = 1000;
    destination = destination;
    constructor() {
      constructed += 1;
    }
    resume = vi.fn(async () => {
      if (flags.failResume) throw new Error('blocked');
      this.state = 'running';
    });
    close = vi.fn(async () => {
      this.state = 'closed';
    });
    createOscillator() {
      if (flags.throwOnOsc) throw new Error('no osc');
      const node = makeOsc();
      oscs.push(node);
      return node;
    }
    createGain() {
      const node = makeGain();
      gains.push(node);
      return node;
    }
    createBiquadFilter() {
      const node = makeFilter();
      filters.push(node);
      return node;
    }
    createBuffer(_channels: number, length: number) {
      const data = new Float32Array(length);
      return {
        length,
        data,
        getChannelData() {
          return data;
        },
      };
    }
    createBufferSource() {
      const node = makeSource();
      sources.push(node);
      return node;
    }
  }

  vi.stubGlobal('AudioContext', FakeAudioContext);
  return {
    oscs,
    gains,
    filters,
    sources,
    destination,
    flags,
    FakeAudioContext,
    get constructed() {
      return constructed;
    },
  };
}

function near(actual: number | null | undefined, expected: number) {
  expect(actual).toBeCloseTo(expected, 5);
}

function nearList(actual: Array<number | null | undefined>, expected: number[]) {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((value, index) => near(actual[index], value));
}

afterEach(() => {
  resetAudioForTests();
  if ('audioSession' in navigator) Reflect.deleteProperty(navigator, 'audioSession');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('audio', () => {
  it('is off by default and does not build a context until the first tap', () => {
    const world = install();
    expect(soundEnabled()).toBe(false);
    expect(play('bell')).toBe(false);
    expect(play('clank')).toBe(false);
    expect(world.constructed).toBe(0);
    expect(world.oscs).toHaveLength(0);
    setSoundOn(true);
    expect(play('bell')).toBe(false);
    expect(world.constructed).toBe(0);
  });

  it('unlocks on the first pointerdown and sets playback when audioSession exists', () => {
    const world = install();
    const session = { type: 'auto' };
    Object.defineProperty(navigator, 'audioSession', { configurable: true, value: session });
    armAudioUnlock();
    window.dispatchEvent(new Event('pointerdown'));
    expect(session.type).toBe('playback');
    expect(world.constructed).toBe(1);
    expect(audioUnlocked()).toBe(true);
    window.dispatchEvent(new Event('pointerdown'));
    expect(world.constructed).toBe(1);
  });

  it('still unlocks when audioSession is missing or rejects the assignment', async () => {
    install();
    expect(await unlockAudio()).toBe(true);
    resetAudioForTests();
    const session = {
      current: 'auto',
      get type() {
        return this.current;
      },
      set type(value: string) {
        if (value === 'playback') throw new Error('blocked');
        this.current = value;
      },
    };
    Object.defineProperty(navigator, 'audioSession', { configurable: true, value: session });
    expect(await unlockAudio()).toBe(true);
    expect(session.current).toBe('auto');
  });

  it('retries the next tap when AudioContext is missing, and swallows a rejected resume', async () => {
    const world = install();
    vi.stubGlobal('AudioContext', undefined);
    armAudioUnlock();
    window.dispatchEvent(new Event('pointerdown'));
    expect(audioUnlocked()).toBe(false);
    vi.stubGlobal('AudioContext', world.FakeAudioContext);
    window.dispatchEvent(new Event('pointerdown'));
    expect(audioUnlocked()).toBe(true);

    resetAudioForTests();
    const again = install();
    again.flags.failResume = true;
    expect(await unlockAudio()).toBe(false);
    expect(audioUnlocked()).toBe(false);
  });

  it('plays each cue only while sound is on, against a mocked AudioContext', async () => {
    const world = install();
    await unlockAudio();
    expect(play('bell')).toBe(false);
    setSoundOn(true);

    expect(play('clank')).toBe(true);
    const metal = world.gains.find((gain) => gain.gain.linear.some((ramp) => ramp.time === 5.175));
    expect(metal?.gain.sets).toEqual([{ value: 0, time: 5 }]);
    expect(metal?.gain.linear[0]?.value).toBeCloseTo(0.5, 5);
    near(metal?.gain.linear[0]?.time, 5.005);
    expect(metal?.gain.linear[1]?.value).toBe(0);
    near(metal?.gain.linear[1]?.time, 5.175);
    expect(world.oscs.map((osc) => osc.frequency.sets[0]?.value)).toEqual([110, 165]);
    expect(world.oscs.every((osc) => osc.type === 'sine' && osc.startAt === 5)).toBe(true);
    nearList(world.oscs.map((osc) => osc.stopAt), [5.18, 5.18]);
    const burst = world.filters[0];
    expect(burst?.type).toBe('bandpass');
    expect(burst?.frequency.sets).toEqual([{ value: 2500, time: 5 }]);
    expect(burst?.Q.sets).toEqual([{ value: 1.2, time: 5 }]);
    expect(world.sources[0]?.buffer?.length).toBe(40);
    expect(world.sources[0]?.startAt).toBe(5);
    expect(world.sources[0]?.stopAt).toBe(5.04);
    const samples = world.sources[0]?.buffer?.data ?? new Float32Array();
    expect(samples.length).toBe(40);
    for (const sample of samples) {
      expect(sample).toBeGreaterThanOrEqual(-1);
      expect(sample).toBeLessThanOrEqual(1);
    }

    world.oscs.length = 0;
    world.gains.length = 0;
    world.filters.length = 0;
    world.sources.length = 0;
    expect(play('3-2-1')).toBe(true);
    expect(world.oscs).toHaveLength(1);
    expect(world.oscs[0]?.frequency.sets).toEqual([{ value: 880, time: 5 }]);
    expect(world.oscs[0]?.startAt).toBe(5);
    near(world.oscs[0]?.stopAt, 5.06);
    expect(world.gains[0]?.gain.linear[0]?.value).toBeCloseTo(0.5, 5);
    near(world.gains[0]?.gain.linear[0]?.time, 5.005);
    expect(world.gains[0]?.gain.linear[1]?.value).toBe(0);
    near(world.gains[0]?.gain.linear[1]?.time, 5.06);

    world.oscs.length = 0;
    world.gains.length = 0;
    expect(play('bell')).toBe(true);
    expect(world.oscs.map((osc) => osc.frequency.sets[0]?.value)).toEqual([660, 990, 660, 990, 660, 990]);
    nearList(world.oscs.map((osc) => osc.startAt), [5, 5.14, 5.3, 5.44, 5.6, 5.74]);
    near(world.oscs[5]?.stopAt, 5.88);

    world.oscs.length = 0;
    world.filters.length = 0;
    world.sources.length = 0;
    world.gains.length = 0;
    expect(play('pr-riser')).toBe(true);
    expect(world.sources[0]?.buffer?.length).toBe(900);
    expect(world.sources[0]?.startAt).toBe(5);
    near(world.sources[0]?.stopAt, 5.9);
    expect(world.filters[0]?.type).toBe('bandpass');
    expect(world.filters[0]?.frequency.sets).toEqual([{ value: 400, time: 5 }]);
    expect(world.filters[0]?.frequency.expo[0]?.value).toBe(4000);
    near(world.filters[0]?.frequency.expo[0]?.time, 5.9);
    expect(world.filters[0]?.Q.sets).toEqual([{ value: 1, time: 5 }]);
    const impact = world.oscs[0];
    expect(impact?.frequency.sets[0]?.value).toBe(55);
    near(impact?.frequency.sets[0]?.time, 5.9);
    near(impact?.startAt, 5.9);
    near(impact?.stopAt, 6.1);

    world.oscs.length = 0;
    world.gains.length = 0;
    expect(play('ring-chord')).toBe(true);
    expect(world.oscs.map((osc) => osc.frequency.sets[0]?.value)).toEqual([110, 165, 220]);
    nearList(world.oscs.map((osc) => osc.startAt), [5, 5.18, 5.36]);
    nearList(world.oscs.map((osc) => osc.stopAt), [5.34, 5.52, 5.7]);
    expect(world.gains[0]?.gain.sets[0]).toEqual({ value: 0, time: 5 });
    expect(world.gains[0]?.gain.sets[1]?.value).toBeCloseTo(0.3, 5);
    near(world.gains[0]?.gain.sets[1]?.time, 5.18);
    expect(world.gains[0]?.gain.linear[0]?.value).toBeCloseTo(0.3, 5);
    near(world.gains[0]?.gain.linear[0]?.time, 5.01);
    expect(world.gains[0]?.gain.linear[1]?.value).toBe(0);
    near(world.gains[0]?.gain.linear[1]?.time, 5.34);

    world.oscs.length = 0;
    world.gains.length = 0;
    world.filters.length = 0;
    expect(play('plate')).toBe(true);
    const plate = world.gains.find((gain) =>
      gain.gain.linear.some((ramp) => ramp.value === 0.3 && Math.abs(ramp.time - 5.005) < 1e-6),
    );
    expect(plate?.gain.linear.some((ramp) => ramp.value === 0 && Math.abs(ramp.time - 5.12) < 1e-6)).toBe(true);
    expect(world.oscs.every((osc) => osc.stopAt !== null && Math.abs(osc.stopAt - 5.12) < 1e-6)).toBe(true);
    expect(world.filters[0]?.Q.sets).toEqual([{ value: 1.2, time: 5 }]);
  });

  it('does not throw when synthesis fails', async () => {
    const world = install();
    await unlockAudio();
    setSoundOn(true);
    world.flags.throwOnOsc = true;
    expect(play('clank')).toBe(false);
  });

  it('drops clank pitch as weight rises and plays thud and lockout', async () => {
    const world = install();
    await unlockAudio();
    setSoundOn(true);
    const drop = 1 / (1 + 100 / 180);
    expect(play('clank', { weightKg: 100 })).toBe(true);
    expect(world.oscs[0]?.frequency.sets[0]?.value).toBeCloseTo(110 * drop, 5);
    expect(world.oscs[1]?.frequency.sets[0]?.value).toBeCloseTo(165 * drop, 5);
    expect(world.filters[0]?.frequency.sets[0]?.value).toBeCloseTo(2500 * drop, 5);
    expect(play('clank')).toBe(true);
    expect(world.oscs[2]?.frequency.sets[0]?.value).toBe(110);
    expect(world.oscs[3]?.frequency.sets[0]?.value).toBe(165);

    world.oscs.length = 0;
    world.filters.length = 0;
    expect(play('thud')).toBe(true);
    expect(world.oscs[0]?.frequency.sets[0]?.value).toBe(90);
    expect(world.oscs[0]?.frequency.linear[0]?.value).toBe(50);
    near(world.oscs[0]?.frequency.linear[0]?.time, 5.09);
    near(world.oscs[0]?.stopAt, 5.1);
    expect(world.filters[0]?.frequency.sets).toEqual([{ value: 180, time: 5 }]);

    world.oscs.length = 0;
    world.filters.length = 0;
    expect(play('lockout')).toBe(true);
    expect(world.oscs[0]?.frequency.sets[0]?.value).toBe(48);
    near(world.oscs[0]?.stopAt, 5.3);
    expect(world.filters[0]?.frequency.sets).toEqual([{ value: 140, time: 5 }]);
    expect(world.filters[0]?.Q.sets).toEqual([{ value: 0.6, time: 5 }]);
  });

  it('useSound stays off until setSoundOn and then plays bell', async () => {
    install();
    let last = false;
    function Probe() {
      const sound = useSound();
      return createElement(
        'button',
        {
          type: 'button',
          onClick: () => {
            last = sound.play('bell');
          },
        },
        sound.enabled ? 'on' : 'off',
      );
    }
    const view = render(createElement(Probe));
    expect(view.getByRole('button').textContent).toBe('off');
    fireEvent.click(view.getByRole('button'));
    expect(last).toBe(false);
    await act(async () => {
      setSoundOn(true);
      await unlockAudio();
    });
    expect(view.getByRole('button').textContent).toBe('on');
    fireEvent.click(view.getByRole('button'));
    expect(last).toBe(true);
  });
});
