// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.resetModules();
  localStorage.clear();
});

describe('rest timer reload', () => {
  it('background for 60 s mid-timer uses the stored endsAt after a fresh load', async () => {
    const endsAt = 1_120_000;
    localStorage.setItem('ironpact.rest-timer', JSON.stringify({
      exerciseId: 'bench', endsAt, startedAt: 1_000_000, seconds: 120,
    }));
    const timer = await import('../../../src/features/timer/useRestTimer');
    expect(timer.getRestView(1_030_000).remainingSeconds).toBe(90);
    expect(timer.getRestView(1_030_000).label).toBe('1:30');
    expect(timer.getRestView(1_090_000).remainingSeconds).toBe(30);
    expect(timer.getRestView(1_090_000).label).toBe('0:30');
    expect(timer.getRestSnapshot().timer.endsAt).toBe(endsAt);
    expect(timer.getRestView(endsAt + 5_000).label).toBe('+0:05 over');
    timer.skipRest();
  });

  it('ignores a corrupt stored rest', async () => {
    localStorage.setItem('ironpact.rest-timer', '{not json');
    const timer = await import('../../../src/features/timer/useRestTimer');
    expect(timer.getRestView(0).phase).toBe('idle');
    timer.skipRest();
  });
});
