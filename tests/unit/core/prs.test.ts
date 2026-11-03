import { expect, it } from 'vitest';
import { detectRunPr, detectSessionVolumePrs, detectSetPr, paceBucketLabel, recomputePrs } from '../../../src/core/prs.ts';
import type { PrHistory } from '../../../src/core/prs.ts';
import { copy, fill } from '../../../src/ui/copy.ts';
import type { BodyweightEntry, CardioEntry, Exercise, Session, SetRow } from '../../../src/core/types.ts';
import { bodyweight, cardio, exercise, id, session, set } from './fixtures.ts';

const userId = set.user_id;

function gym(n: number, started: string, extra: Partial<Session> = {}): Session {
  const local = started.slice(0, 10);
  return { ...session, id: id(n), user_id: userId, kind: 'gym', started_at: started, local_date: local, client_updated_at: started, ...extra };
}
function runSession(n: number, started: string): Session {
  return { ...gym(n, started), kind: 'run' };
}
function lift(n: number, parent: Session, extra: Partial<SetRow> = {}): SetRow {
  return {
    ...set, id: id(n), user_id: userId, session_id: parent.id, exercise_id: exercise.id,
    local_date: parent.local_date, logged_at: parent.started_at, client_updated_at: parent.started_at,
    reps: 5, weight_kg: 80, rpe: null, is_warmup: false, set_index: 1, ...extra,
  };
}
function run(n: number, parent: Session, distanceM: number, durationS: number, extra: Partial<CardioEntry> = {}): CardioEntry {
  return {
    ...cardio, id: id(n), user_id: userId, session_id: parent.id, local_date: parent.local_date,
    logged_at: parent.started_at, client_updated_at: parent.started_at, distance_m: distanceM, duration_s: durationS, ...extra,
  };
}
function history(input: Partial<PrHistory> & Pick<PrHistory, 'sessions'>): PrHistory {
  return { sets: [], cardio: [], bodyweights: [], exercises: [exercise], ...input };
}

it('U-P1 first session sets baseline, no PR', () => {
  const first = gym(1, '2026-10-01T08:00:00.000Z');
  const sets = [lift(10, first), lift(11, first, { set_index: 2, weight_kg: 100, logged_at: '2026-10-01T08:10:00.000Z' })];
  const rows = history({ sessions: [first], sets });
  expect(detectSetPr(rows, sets[0]!.id)).toEqual({ kind: 'baseline' });
  expect(detectSetPr(rows, sets[1]!.id)).toEqual({ kind: 'none' });
  expect(recomputePrs(rows)).toEqual([]);
  expect(copy.firstSession).toBe('First sessions set your baseline. PRs start after 2.');
});

it('U-P2 rep-max PR', () => {
  const first = gym(1, '2026-10-01T08:00:00.000Z');
  const second = gym(2, '2026-10-08T08:00:00.000Z');
  const sets = [
    lift(10, first, { weight_kg: 100, reps: 5 }),
    lift(11, first, { weight_kg: 80, reps: 3, set_index: 2 }),
    lift(12, second, { weight_kg: 85, reps: 3 }),
  ];
  const rows = history({ sessions: [first, second], sets });
  const detected = detectSetPr(rows, sets[2]!.id);
  expect(detected.kind).toBe('pr');
  if (detected.kind !== 'pr') return;
  expect(detected.event.pr_type).toBe('rep_max');
  expect(detected.event.reps).toBe(3);
  expect(detected.event.value).toBe(85);
  expect(detected.event.previous_value).toBe(80);
  expect(detected.event.pct_over_previous).toBe(6.25);
  expect(detected.event.display).toBe('takeover');
  expect(fill(copy.prRepMax, { reps: detected.event.reps ?? 0 })).toBe("3-rep PR");
});

it('U-P3 e1RM PR outranks rep-max on same set', () => {
  const first = gym(1, '2026-10-01T08:00:00.000Z');
  const second = gym(2, '2026-10-08T08:00:00.000Z');
  const sets = [lift(10, first, { weight_kg: 80 }), lift(11, second, { weight_kg: 100 })];
  const rows = history({ sessions: [first, second], sets });
  const detected = detectSetPr(rows, sets[1]!.id);
  expect(detected.kind).toBe('pr');
  if (detected.kind !== 'pr') return;
  expect(detected.event.pr_type).toBe('e1rm');
  expect(detected.event.value).toBeCloseTo(116.6667, 3);
  expect(detected.event.previous_value).toBeCloseTo(93.3333, 3);
  expect(detected.event.pct_over_previous).toBe(25);
  expect(detected.event.display).toBe('takeover');
  expect(recomputePrs(rows).filter((event) => event.source_id === sets[1]!.id && event.pr_type !== 'volume').map((event) => event.pr_type)).toEqual(['e1rm']);
  expect(copy.prE1rm).toBe("Estimated 1-rep max PR");

  const third = lift(12, second, { weight_kg: 110, set_index: 2, logged_at: '2026-10-08T08:10:00.000Z' });
  const again = detectSetPr(history({ sessions: [first, second], sets: [...sets, third] }), third.id);
  expect(again.kind).toBe('pr');
  if (again.kind === 'pr') expect(again.event.display).toBe('toast');
});

it('U-P4 volume PR', () => {
  const first = gym(1, '2026-10-01T08:00:00.000Z');
  const second = gym(2, '2026-10-08T08:00:00.000Z');
  const sets = [
    lift(10, first, { weight_kg: 100 }),
    lift(11, second, { weight_kg: 100 }),
    lift(12, second, { weight_kg: 100, set_index: 2, logged_at: '2026-10-08T08:10:00.000Z' }),
  ];
  const rows = history({ sessions: [first, second], sets });
  expect(detectSetPr(rows, sets[1]!.id)).toEqual({ kind: 'none' });
  expect(detectSetPr(rows, sets[2]!.id)).toEqual({ kind: 'none' });
  const badges = detectSessionVolumePrs(rows, second.id);
  expect(badges).toHaveLength(1);
  expect(badges[0]).toMatchObject({
    pr_type: 'volume', source_id: sets[2]!.id, value: 1000, previous_value: 500, display: 'badge', pct_over_previous: 100,
  });
  expect(copy.prVolume).toBe("Volume PR");
  expect(detectSessionVolumePrs(rows, first.id)).toEqual([]);
});

it('U-P5 warm-ups never PR', () => {
  const first = gym(1, '2026-10-01T08:00:00.000Z');
  const second = gym(2, '2026-10-08T08:00:00.000Z');
  const warmup = lift(11, second, { weight_kg: 200, reps: 1, is_warmup: true });
  const working = lift(12, second, { weight_kg: 90, reps: 1, set_index: 2 });
  const rows = history({
    sessions: [first, second],
    sets: [lift(10, first, { weight_kg: 80, reps: 1 }), warmup, working],
  });
  expect(detectSetPr(rows, warmup.id)).toEqual({ kind: 'none' });
  const detected = detectSetPr(rows, working.id);
  expect(detected.kind).toBe('pr');
  if (detected.kind === 'pr') expect(detected.event).toMatchObject({ pr_type: 'e1rm', value: 90, previous_value: 80 });
  expect(recomputePrs(rows).some((event) => event.source_id === warmup.id)).toBe(false);
});

it('U-P6 deleting the PR set removes its PR on recompute', () => {
  const first = gym(1, '2026-10-01T08:00:00.000Z');
  const second = gym(2, '2026-10-08T08:00:00.000Z');
  const record = lift(11, second, { weight_kg: 100 });
  const lesser = lift(12, second, { weight_kg: 90, set_index: 2, logged_at: '2026-10-08T08:10:00.000Z' });
  const sets = [lift(10, first, { weight_kg: 80 }), record, lesser];
  const before = recomputePrs(history({ sessions: [first, second], sets }));
  expect(before.some((event) => event.pr_type === 'e1rm' && event.source_id === record.id)).toBe(true);
  const after = recomputePrs(history({
    sessions: [first, second],
    sets: sets.map((row) => row.id === record.id ? { ...row, deleted_at: second.started_at } : row),
  }));
  expect(after.find((event) => event.pr_type === 'e1rm')?.source_id).toBe(lesser.id);
  expect(after.some((event) => event.source_id === record.id)).toBe(false);
  expect(detectSetPr(history({
    sessions: [first, second],
    sets: [{ ...record, deleted_at: second.started_at }],
  }), record.id)).toEqual({ kind: 'none' });
});

it('U-P7 run longest distance; fastest pace within ±5% bucket', () => {
  const first = runSession(1, '2026-10-01T08:00:00.000Z');
  const second = runSession(2, '2026-10-08T08:00:00.000Z');
  const third = runSession(3, '2026-10-15T08:00:00.000Z');
  const base = run(10, first, 5000, 1500);
  const longest = run(11, second, 8000, 3000);
  const faster = run(12, third, 4800, 1200);
  const rows = history({ sessions: [first, second, third], cardio: [base, longest, faster] });
  expect(detectRunPr(rows, base.id)).toEqual({ kind: 'baseline' });
  const distance = detectRunPr(rows, longest.id);
  expect(distance.kind).toBe('pr');
  if (distance.kind === 'pr') {
    expect(distance.event).toMatchObject({ pr_type: 'distance', value: 8000, previous_value: 5000, display: 'takeover' });
  }
  const pace = detectRunPr(rows, faster.id);
  expect(pace.kind).toBe('pr');
  if (pace.kind === 'pr') {
    expect(pace.event.pr_type).toBe('pace');
    expect(pace.event.value).toBeCloseTo(1200 / 4.8, 5);
    expect(pace.event.bucket_label).toBe('5K');
    expect(pace.event.display).toBe('takeover');
    expect(pace.event.previous_value).toBeCloseTo(300, 5);
  }
  expect(copy.prLongestRun).toBe("Longest run");
  expect(fill(copy.prFastest, { bucket: '5K' })).toBe("Fastest 5K");
  expect(paceBucketLabel(10200)).toBe('10K');
  expect(paceBucketLabel(7000)).toBe('7K');
  expect(paceBucketLabel(21000)).toBe('HALF');

  const bothSession = runSession(4, '2026-10-08T08:00:00.000Z');
  const both = run(13, bothSession, 5200, 1400);
  const bothHistory = history({ sessions: [first, bothSession], cardio: [base, both] });
  const onlyDistance = detectRunPr(bothHistory, both.id);
  expect(onlyDistance.kind).toBe('pr');
  if (onlyDistance.kind === 'pr') expect(onlyDistance.event.pr_type).toBe('distance');
  expect(recomputePrs(bothHistory).filter((event) => event.source_id === both.id)).toHaveLength(1);

  const outside = run(14, third, 4700, 900);
  expect(detectRunPr(history({ sessions: [first, second, third], cardio: [base, longest, outside] }), outside.id)).toEqual({ kind: 'none' });
});

it('ignores reps above 12, ties, missing parents, and bodyweight gaps', () => {
  const first = gym(1, '2026-10-01T08:00:00.000Z');
  const second = gym(2, '2026-10-08T08:00:00.000Z');
  const heavy = lift(11, second, { weight_kg: 200, reps: 13 });
  const rows = history({ sessions: [first, second], sets: [lift(10, first, { weight_kg: 100 }), heavy] });
  expect(detectSetPr(rows, heavy.id)).toEqual({ kind: 'none' });
  expect(detectSessionVolumePrs(rows, second.id)[0]?.pr_type).toBe('volume');
  const same = lift(12, second, { weight_kg: 80 });
  expect(detectSetPr(history({ sessions: [first, second], sets: [lift(10, first, { weight_kg: 80 }), same] }), same.id)).toEqual({ kind: 'none' });

  const orphan = lift(13, second);
  expect(detectSetPr(history({ sessions: [], sets: [orphan] }), orphan.id)).toEqual({ kind: 'none' });
  const otherUser = lift(14, second, { user_id: id(99) });
  expect(detectSetPr(history({ sessions: [{ ...second, user_id: userId }], sets: [otherUser] }), otherUser.id)).toEqual({ kind: 'none' });

  const pull: Exercise = { ...exercise, id: id(70), kind: 'bw_lift', name: 'Pull-up' };
  const bw: BodyweightEntry = { ...bodyweight, id: id(71), user_id: userId, local_date: '2026-10-01', weight_kg: 78 };
  const laterBw: BodyweightEntry = { ...bw, id: id(72), local_date: '2026-10-08', weight_kg: 80, measured_at: '2026-10-08T07:00:00.000Z' };
  const withBw = history({
    sessions: [first, second],
    exercises: [pull],
    bodyweights: [bw, laterBw],
    sets: [
      lift(15, first, { exercise_id: pull.id, weight_kg: 0 }),
      lift(16, second, { exercise_id: pull.id, weight_kg: 10 }),
    ],
  });
  const bwPr = detectSetPr(withBw, id(16));
  expect(bwPr.kind).toBe('pr');
  if (bwPr.kind === 'pr') expect(bwPr.event.pr_type).toBe('e1rm');
  const addedOnly = history({
    sessions: [first, second], exercises: [pull],
    sets: [
      lift(17, first, { exercise_id: pull.id, weight_kg: 0 }),
      lift(18, second, { exercise_id: pull.id, weight_kg: 10 }),
    ],
  });
  const added = detectSetPr(addedOnly, id(18));
  expect(added.kind).toBe('pr');
  if (added.kind === 'pr') expect(added.event).toMatchObject({ pr_type: 'rep_max', value: 10, previous_value: 0 });

  const zero = run(19, runSession(5, '2026-10-20T08:00:00.000Z'), 5000, 0);
  expect(detectRunPr(history({ sessions: [runSession(5, '2026-10-20T08:00:00.000Z')], cardio: [zero] }), zero.id).kind).toBe('baseline');
  expect(detectRunPr(history({ sessions: [], cardio: [zero] }), zero.id)).toEqual({ kind: 'none' });
  expect(recomputePrs(history({ sessions: [] }))).toEqual([]);
});
