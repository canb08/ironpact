import { expect, it } from 'vitest';
import { compareDuelScores, duelScore, fairComparison, rebaseToFirst } from '../../../src/core/duel.ts';
import type { BaselineWeek } from '../../../src/core/duel.ts';
import { copy } from '../../../src/ui/copy.ts';

const weeks = (bests: readonly (number | null)[], sessions: readonly number[]): BaselineWeek[] =>
  bests.map((bestE1rm, index) => ({ bestE1rm, sessions: sessions[index] ?? 0 }));

it("U-D1: % over own 4-week baseline", () => {
  const result = fairComparison({
    previousWeeks: weeks([100, 110, 90, 100], [1, 1, 1, 1]),
    currentE1rm: 110,
  });
  expect(result).toEqual({ state: 'ready', baseline: 100, current: 110, percent: 10 });
  const sparse = fairComparison({
    previousWeeks: weeks([80, null, 120, null], [1, 0, 1, 0]),
    currentE1rm: 120,
  });
  expect(sparse.baseline).toBe(100);
  expect(sparse.percent).toBe(20);
  expect(fairComparison({ previousWeeks: weeks([100, 100, 100, 100], [2, 0, 0, 0]), currentE1rm: null })).toEqual({
    state: 'ready', baseline: 100, current: null, percent: null,
  });
  expect(fairComparison({ previousWeeks: weeks([100, 100, 100, 100], [4, 0, 0, 0]), currentE1rm: 90 }).percent).toBe(-10);
  expect(fairComparison({ previousWeeks: weeks([100, 0, null, null], [2, 0, 0, 0]), currentE1rm: 0 })).toEqual({
    state: 'ready', baseline: 100, current: null, percent: null,
  });
});

it("U-D2: <2 sessions in baseline → 'Baseline building'", () => {
  expect(fairComparison({ previousWeeks: weeks([100, null, null, null], [1, 0, 0, 0]), currentE1rm: 100 })).toEqual({
    state: 'building', baseline: null, current: null, percent: null,
  });
  expect(fairComparison({ previousWeeks: weeks([null, null, null, null], [3, 0, 0, 0]), currentE1rm: 100 }).state).toBe('building');
  expect(copy.baselineBuilding).toBe("First sessions set your baseline. PRs start after 2.");
  expect(() => fairComparison({ previousWeeks: weeks([100], [2]), currentE1rm: 100 })).toThrow(RangeError);
});

it('U-D3: tie → half-segment both', () => {
  expect(compareDuelScores(10, 10.5)).toEqual({ result: 'tie', halfSegmentBoth: true });
  expect(compareDuelScores(4.2, 4.2)).toEqual({ result: 'tie', halfSegmentBoth: true });
  expect(compareDuelScores(10, 10.6)).toEqual({ result: 'b', halfSegmentBoth: false });
  expect(compareDuelScores(10.6, 10)).toEqual({ result: 'a', halfSegmentBoth: false });
  expect(copy.duelTie).toBe("Equal best");
  expect(copy.duelWon).toBe("New best");
  expect(copy.duelLost).not.toMatch(/LOST/);
  expect(() => compareDuelScores(Number.NaN, 1)).toThrow(RangeError);
});

it('rebases each partner line to % of that line’s own first value', () => {
  const line = rebaseToFirst([80, 88, null, 96]);
  expect(line[0]).toBe(100);
  expect(line[1]).toBeCloseTo(110);
  expect(line[2]).toBeNull();
  expect(line[3]).toBeCloseTo(120);
  expect(rebaseToFirst([50, 60])[0]).toBe(100);
  expect(rebaseToFirst([200, 100])[0]).toBe(100);
  expect(rebaseToFirst([null, 40, 20])).toEqual([null, 100, 50]);
  expect(rebaseToFirst([40, 0])).toEqual([100, 0]);
  expect(rebaseToFirst([null, 0, Number.NaN])).toEqual([null, null, null]);
  expect(rebaseToFirst([100, Number.POSITIVE_INFINITY])).toEqual([100, null]);
});

it('scores a lift as percent gain, sessions and km as percent of baseline', () => {
  expect(duelScore('lift', 110, 100)).toBe(10);
  expect(duelScore('sessions', 3, 3)).toBe(100);
  expect(duelScore('sessions', 4.5, 3)).toBe(150);
  expect(duelScore('km', 12, 10)).toBe(120);
  expect(duelScore('lift', 90, 0)).toBeNull();
  expect(duelScore('km', Number.NaN, 10)).toBeNull();
  expect(compareDuelScores(duelScore('lift', 110, 100) ?? 0, duelScore('lift', 110.4, 100) ?? 0).result).toBe('tie');
});
