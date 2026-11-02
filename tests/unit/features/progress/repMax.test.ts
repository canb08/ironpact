import { expect, it } from 'vitest';
import { formatKgCell, repMaxTable } from '../../../../src/features/progress/repMax.ts';

it('records the heaviest working weight at each rep count and inverts the best e1RM', () => {
  const rows = repMaxTable([
    {
      localDate: '2026-10-20',
      sets: [
        { reps: 5, weight_kg: 70, is_warmup: true },
        { reps: 5, weight_kg: 80, is_warmup: false },
        { reps: 13, weight_kg: 200, is_warmup: false },
      ],
    },
    {
      localDate: '2026-10-24',
      sets: [
        { reps: 5, weight_kg: 80, is_warmup: false },
        { reps: 3, weight_kg: 90, is_warmup: false },
      ],
    },
  ], 'lift', () => null);

  expect(rows).toHaveLength(12);
  const five = rows[4];
  const three = rows[2];
  const one = rows[0];
  expect(five?.actualKg).toBe(80);
  expect(five?.date).toBe('2026-10-24');
  expect(three?.actualKg).toBe(90);
  expect(one?.actualKg).toBeNull();
  // 3×90 → 90 * (1 + 3/30) = 99. That beats 5×80 (93.3).
  expect(one?.derivedKg).toBeCloseTo(99, 5);
  expect(five?.derivedKg).toBeCloseTo(99 / (1 + 5 / 30), 5);
  expect(formatKgCell(80)).toBe('80');
  expect(formatKgCell(82.5)).toBe('82.5');
});

it('leaves the derived column empty for a bodyweight lift', () => {
  const rows = repMaxTable([
    { localDate: '2026-10-24', sets: [{ reps: 8, weight_kg: 10, is_warmup: false }] },
  ], 'bw_lift', () => 70);
  expect(rows[7]?.actualKg).toBe(10);
  expect(rows[7]?.derivedKg).toBeNull();
});
