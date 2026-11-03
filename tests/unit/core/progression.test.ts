import { expect, it } from 'vitest';
import { formatNudgeChip, nudgeCopyKey, progressionForExercise, progressionNudge } from '../../../src/core/progression.ts';
import { copy, fill } from '../../../src/ui/copy.ts';
import type { Exercise, Session, SetRow } from '../../../src/core/types.ts';
import { exercise, id, session, set } from './fixtures.ts';

const today = '2026-10-20';
const recent = '2026-10-10';

function working(over: Partial<SetRow> = {}, n = 20): SetRow {
  return { ...set, id: id(n), local_date: recent, reps: 5, weight_kg: 80, rpe: 8, is_warmup: false, ...over };
}

it('U-N1 all reps at RPE ≤8 → +2.5', () => {
  const nudge = progressionNudge({
    exercise, sets: [working({ set_index: 2, weight_kg: 90 }, 21), working()],
    lastLocalDate: recent, today, bigJumps: false,
  });
  expect(nudge).toEqual({ incrementKg: 2.5, fromKg: 80, nextKg: 82.5, reason: 'rpe' });
  expect(nudge && formatNudgeChip(nudge)).toBe('+2.5 → 82.5');
  expect(nudge && nudgeCopyKey(nudge)).toBe('progressionNudge');
  expect(copy.progressionNudge).toBe("All reps at RPE 8. Add 2.5 kg.");
  expect(fill(copy.nudgeChipValue, { increment: '2.5', next: '82.5' })).toBe(copy.nudgeChip);
  expect(progressionNudge({
    exercise, sets: [working({ rpe: 8.5 })], lastLocalDate: recent, today, bigJumps: false,
  })).toBeNull();
  expect(progressionNudge({
    exercise, sets: [working({ rpe: null }), working({ id: id(21), set_index: 2, rpe: 8 })],
    lastLocalDate: recent, today, bigJumps: false,
  })?.reason).toBe('rpe');
});

it('U-N2 RPE missing and all reps hit → +2.5', () => {
  const nudge = progressionNudge({
    exercise, sets: [working({ rpe: null }), working({ id: id(21), set_index: 2, rpe: null, is_warmup: true, reps: 1 })],
    lastLocalDate: recent, today, bigJumps: false,
  });
  expect(nudge?.reason).toBe('reps');
  expect(nudge?.incrementKg).toBe(2.5);
  expect(nudge && nudgeCopyKey(nudge)).toBe('progressionNoRpe');
  expect(copy.progressionNoRpe).toBe("All reps complete. Add 2.5 kg.");
});

it('U-N3 one set short → no nudge', () => {
  expect(progressionNudge({
    exercise, sets: [working(), working({ id: id(21), set_index: 2, reps: 4 })],
    lastLocalDate: recent, today, bigJumps: false,
  })).toBeNull();
  expect(progressionNudge({
    exercise, sets: [working({ is_warmup: true })], lastLocalDate: recent, today, bigJumps: false,
  })).toBeNull();
  expect(progressionNudge({
    exercise: { ...exercise, increment_kg: 0 }, sets: [working()], lastLocalDate: recent, today, bigJumps: false,
  })).toBeNull();
});

it('U-N4 lower_body + big_jumps → +5', () => {
  const squat: Exercise = { ...exercise, id: id(40), lower_body: true, category: 'compound', name: 'Squat' };
  const on = progressionNudge({
    exercise: squat, sets: [working()], lastLocalDate: recent, today, bigJumps: true,
  });
  expect(on).toMatchObject({ incrementKg: 5, fromKg: 80, nextKg: 85, reason: 'rpe' });
  expect(on && formatNudgeChip(on)).toBe('+5 → 85');
  expect(on && nudgeCopyKey(on)).toBe('progressionBig');
  expect(copy.progressionBig).toBe("All reps at RPE 8. Add 5 kg.");
  const noRpe = progressionNudge({
    exercise: squat, sets: [working({ rpe: null })], lastLocalDate: recent, today, bigJumps: true,
  });
  expect(noRpe && nudgeCopyKey(noRpe)).toBe('progressionBigNoRpe');
  expect(copy.progressionBigNoRpe).toBe("All reps complete. Add 5 kg.");
  expect(progressionNudge({
    exercise: squat, sets: [working()], lastLocalDate: recent, today, bigJumps: false,
  })?.incrementKg).toBe(2.5);
  expect(progressionNudge({
    exercise, sets: [working()], lastLocalDate: recent, today, bigJumps: true,
  })?.incrementKg).toBe(2.5);
  const isolation: Exercise = { ...squat, category: 'isolation', increment_kg: 1.25 };
  const small = progressionNudge({
    exercise: isolation, sets: [working()], lastLocalDate: recent, today, bigJumps: true,
  });
  expect(small).toMatchObject({ incrementKg: 1.25, nextKg: 81.25 });
  expect(small && nudgeCopyKey(small)).toBe('progressionAdd');
  expect(fill(copy.progressionAdd, { increment: '1.25' })).toBe("All reps at RPE 8. Add 1.25 kg.");
  const noRpeSmall = progressionNudge({
    exercise: { ...isolation, increment_kg: 1.25 }, sets: [working({ rpe: null })],
    lastLocalDate: recent, today, bigJumps: false,
  });
  expect(noRpeSmall && nudgeCopyKey(noRpeSmall)).toBe('progressionAddNoRpe');
  expect(fill(copy.progressionAddNoRpe, { increment: '1.25' })).toBe("All reps complete. Add 1.25 kg.");
  expect(progressionNudge({
    exercise: { ...squat, increment_kg: 0 }, sets: [working()], lastLocalDate: recent, today, bigJumps: true,
  })?.incrementKg).toBe(5);
});

it('U-N5 gap >14 days → no nudge', () => {
  expect(progressionNudge({
    exercise, sets: [working()], lastLocalDate: '2026-10-06', today: '2026-10-20', bigJumps: false,
  })).toMatchObject({ incrementKg: 2.5 });
  expect(progressionNudge({
    exercise, sets: [working()], lastLocalDate: '2026-10-05', today: '2026-10-20', bigJumps: false,
  })).toBeNull();
});

it('uses the last working session and ignores the open one', () => {
  const older: Session = { ...session, id: id(50), started_at: '2026-10-01T08:00:00.000Z', local_date: '2026-10-01' };
  const newer: Session = { ...session, id: id(51), started_at: '2026-10-18T08:00:00.000Z', local_date: '2026-10-18' };
  const open: Session = { ...session, id: id(52), started_at: '2026-10-20T08:00:00.000Z', local_date: today };
  const sets: SetRow[] = [
    working({ id: id(60), session_id: older.id, reps: 1 }),
    working({ id: id(61), session_id: newer.id }),
    working({ id: id(62), session_id: open.id, reps: 1 }),
  ];
  expect(progressionForExercise({
    exercise, sessions: [older, newer, open], sets, userId: set.user_id, today, bigJumps: false, excludeSessionId: open.id,
  })).toMatchObject({ incrementKg: 2.5, fromKg: 80 });
  expect(progressionForExercise({
    exercise, sessions: [{ ...newer, deleted_at: instant() }], sets, userId: set.user_id, today, bigJumps: false,
  })).toBeNull();
});

function instant(): string {
  return '2026-10-25T22:30:00.000Z';
}
