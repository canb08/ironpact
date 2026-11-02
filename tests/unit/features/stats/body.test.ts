import { expect, it } from 'vitest';
import type { BodyweightEntry } from '../../../../src/core/types.ts';
import { MOVING_AVERAGE_DAYS, movingAverage7 } from '../../../../src/features/stats/body.ts';
import { bodyweight, id } from '../../core/fixtures.ts';

const me = id(2);

function row(n: number, date: string, kg: number, patch: Partial<BodyweightEntry> = {}): BodyweightEntry {
  return {
    ...bodyweight,
    id: id(n),
    user_id: me,
    local_date: date,
    weight_kg: kg,
    measured_at: `${date}T08:00:00.000Z`,
    deleted_at: null,
    ...patch,
  };
}

it('uses a 7 calendar day window', () => {
  expect(MOVING_AVERAGE_DAYS).toBe(7);
});

it('averages the weigh-in day and the six days before it', () => {
  const points = movingAverage7([
    row(1, '2026-10-01', 70),
    row(2, '2026-10-02', 71),
    row(3, '2026-10-03', 72),
    row(4, '2026-10-04', 73),
    row(5, '2026-10-05', 74),
    row(6, '2026-10-06', 75),
    row(7, '2026-10-07', 76),
    row(8, '2026-10-08', 77),
  ], me);
  expect(points).toHaveLength(8);
  expect(points[0]).toMatchObject({ localDate: '2026-10-01', weightKg: 70, averageKg: 70, samples: 1 });
  expect(points[5]).toMatchObject({ localDate: '2026-10-06', samples: 6, averageKg: (70 + 75) / 2 });
  expect(points[6]).toMatchObject({ localDate: '2026-10-07', samples: 7, averageKg: 73 });
  expect(points[7]).toMatchObject({ localDate: '2026-10-08', samples: 7, averageKg: 74 });
});

it('includes a weigh-in six days back and drops one seven days back', () => {
  const inside = movingAverage7([
    row(1, '2026-10-01', 80),
    row(2, '2026-10-07', 90),
  ], me);
  expect(inside[1]).toMatchObject({ averageKg: 85, samples: 2 });
  const outside = movingAverage7([
    row(1, '2026-10-01', 80),
    row(2, '2026-10-08', 90),
  ], me);
  expect(outside[1]).toMatchObject({ averageKg: 90, samples: 1 });
  expect(outside.map((point) => point.localDate)).toEqual(['2026-10-01', '2026-10-08']);
});

it('does not invent a point for a day with no weigh-in', () => {
  const points = movingAverage7([
    row(1, '2026-10-01', 80),
    row(2, '2026-10-20', 82),
  ], me);
  expect(points).toHaveLength(2);
  expect(points[1]?.averageKg).toBe(82);
});

it('ignores deleted rows, other people, and non-positive weights', () => {
  const points = movingAverage7([
    row(1, '2026-10-01', 70),
    row(2, '2026-10-02', 200, { deleted_at: '2026-10-02T09:00:00.000Z' }),
    row(3, '2026-10-03', 210, { user_id: id(99) }),
    row(4, '2026-10-04', 0),
    row(5, '2026-10-05', 74),
  ], me);
  expect(points.map((point) => point.localDate)).toEqual(['2026-10-01', '2026-10-05']);
  expect(points[1]?.averageKg).toBe(72);
  expect(points[1]?.samples).toBe(2);
});

it('keeps the later weigh-in when a day is logged twice', () => {
  const points = movingAverage7([
    row(1, '2026-10-01', 70, { measured_at: '2026-10-01T07:00:00.000Z' }),
    row(4, '2026-10-01', 80, { measured_at: '2026-10-01T09:00:00.000Z' }),
    row(3, '2026-10-01', 65, { measured_at: '2026-10-01T09:00:00.000Z' }),
  ], me);
  expect(points).toHaveLength(1);
  expect(points[0]).toMatchObject({ weightKg: 80, averageKg: 80, samples: 1 });
});
