import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import * as v from '../../../src/core/validate.ts';
import { bodyweight, cardio, crew, exercise, id, instant, martial, member, min, profile, session, set, sync } from './fixtures.ts';

const schemas = [
  [v.syncFieldsSchema, sync], [v.profileSchema, profile], [v.crewSchema, crew],
  [v.crewMemberSchema, member], [v.exerciseSchema, exercise], [v.sessionSchema, session],
  [v.setSchema, set], [v.cardioEntrySchema, cardio], [v.martialEntrySchema, martial],
  [v.minEntrySchema, min], [v.bodyweightEntrySchema, bodyweight],
] as const;

it('accepts every writable frozen row shape, with optional server fields absent or present', () => {
  for (const [schema, row] of schemas) {
    expect(schema.safeParse(row).success).toBe(true);
    expect(schema.safeParse({ ...row, updated_at: instant, created_at: instant, received_at: instant }).success).toBe(true);
    expect(schema.safeParse({ ...row, id: 'bad', user_id: 'bad', crew_id: 'bad' }).success).toBe(false);
  }
  expect(v.exerciseSchema.safeParse({ ...exercise, owner_id: id(2), equipment: 'bar', updated_at: instant, deleted_at: instant }).success).toBe(true);
  expect(v.sessionSchema.safeParse({ ...session, readiness: { sleep: 1, soreness: 2, energy: 3 }, together_id: id(3), ended_at: instant, note: '' }).success).toBe(true);
  expect(v.crewMemberSchema.safeParse({ ...member, role: 'member', left_at: instant }).success).toBe(true);
  expect(v.crewSchema.safeParse({ ...crew, created_by: id(2) }).success).toBe(true);
});

// Each explicit DB range is exercised at both ends and one step beyond.
const numericCases: [string, z.ZodType, object, string, number, number, number][] = [
  ['profile hue', v.profileSchema, profile, 'color_hue', 0, 359, 1],
  ['weekly target', v.profileSchema, profile, 'weekly_target', 1, 7, 1],
  ['bar numeric(5,2)', v.profileSchema, profile, 'bar_kg', -999.99, 999.99, 0.01],
  ['crew smallint', v.crewSchema, crew, 'max_members', -32768, 32767, 1],
  ['increment numeric(4,2)', v.exerciseSchema, exercise, 'increment_kg', -99.99, 99.99, 0.01],
  ['rep target', v.exerciseSchema, exercise, 'rep_target', 1, 100, 1],
  ['set index', v.setSchema, set, 'set_index', 1, 32767, 1],
  ['reps', v.setSchema, set, 'reps', 1, 100, 1],
  ['added kg DB', v.setSchema, set, 'weight_kg', -250, 500, 0.01],
  ['set RPE', v.setSchema, set, 'rpe', 5, 10, 0.5],
  ['run metres', v.cardioEntrySchema, cardio, 'distance_m', 100, 100000, 1],
  ['run seconds', v.cardioEntrySchema, cardio, 'duration_s', 1, 86400, 1],
  ['run RPE', v.cardioEntrySchema, cardio, 'rpe', 5, 10, 0.5],
  ['martial minutes', v.martialEntrySchema, martial, 'duration_min', 1, 480, 1],
  ['rounds', v.martialEntrySchema, martial, 'rounds', 1, 99, 1],
  ['martial RPE', v.martialEntrySchema, martial, 'rpe', 5, 10, 0.5],
  ['MIN minutes', v.minEntrySchema, min, 'duration_min', 1, 480, 1],
  ['bodyweight', v.bodyweightEntrySchema, bodyweight, 'weight_kg', 30, 300, 0.1],
];
it.each(numericCases)('%s mirrors the DB range', (_, schema, row, field, low, high, step) => {
  for (const value of [low, high]) expect(schema.safeParse({ ...row, [field]: value }).success).toBe(true);
  for (const value of [low - step, high + step, NaN, Infinity, -Infinity, '5']) {
    expect(schema.safeParse({ ...row, [field]: value }).success).toBe(false);
  }
});
const textCases: [string, z.ZodType, object, string, number, number][] = [
  ['display name', v.profileSchema, profile, 'display_name', 1, 20],
  ['initial', v.profileSchema, profile, 'initial', 1, 1],
  ['default MIN', v.profileSchema, profile, 'min_default_label', 1, 40],
  ['crew name', v.crewSchema, crew, 'name', 1, 24],
  ['exercise name', v.exerciseSchema, exercise, 'name', 1, 40],
  ['export label', v.exerciseSchema, exercise, 'export_label', 1, 24],
  ['session note', v.sessionSchema, session, 'note', 0, 200],
  ['set note', v.setSchema, set, 'note', 0, 120],
  ['run note', v.cardioEntrySchema, cardio, 'note', 0, 120],
  ['discipline', v.martialEntrySchema, martial, 'discipline', 1, 16],
  ['martial note', v.martialEntrySchema, martial, 'note', 0, 120],
  ['MIN description', v.minEntrySchema, min, 'description', 1, 40],
];
it.each(textCases)('%s mirrors DB character counts, including Unicode', (_, schema, row, field, low, high) => {
  for (const value of ['x'.repeat(low), 'x'.repeat(high), '𐐀'.repeat(high)]) expect(schema.safeParse({ ...row, [field]: value }).success).toBe(true);
  expect(schema.safeParse({ ...row, [field]: 'x'.repeat(high + 1) }).success).toBe(false);
  if (low > 0) expect(schema.safeParse({ ...row, [field]: '' }).success).toBe(false);
  expect(schema.safeParse({ ...row, [field]: 1 }).success).toBe(false);
});

it('validates UUIDs, local dates, instants, enum values and nullable fields', () => {
  expect(v.localDateSchema.safeParse('2028-02-29').success).toBe(true);
  for (const date of ['2027-02-29', '2026-00-01', '2026-01-32', instant]) expect(v.localDateSchema.safeParse(date).success).toBe(false);
  for (const value of ['2026-10-25T23:30:00+01:00', instant]) expect(v.instantSchema.safeParse(value).success).toBe(true);
  for (const value of ['yesterday', '2026-10-25', '2026-10-25T23:30:00']) expect(v.instantSchema.safeParse(value).success).toBe(false);
  const enums: [z.ZodType, object, string, string[]][] = [
    [v.profileSchema, profile, 'theme', ['dark', 'light', 'system']],
    [v.profileSchema, profile, 'export_format', ['lines', 'json', 'csv']],
    [v.exerciseSchema, exercise, 'kind', ['lift', 'bw_lift', 'run', 'martial']],
    [v.exerciseSchema, exercise, 'category', ['compound', 'isolation']],
    [v.sessionSchema, session, 'kind', ['gym', 'run', 'martial', 'min']],
    [v.sessionSchema, session, 'mode', ['full', 'min']],
    [v.crewMemberSchema, member, 'role', ['owner', 'member']],
    [v.cardioEntrySchema, cardio, 'activity', ['Run']],
  ];
  for (const [schema, row, field, values] of enums) {
    for (const value of values) expect(schema.safeParse({ ...row, [field]: value }).success).toBe(true);
    expect(schema.safeParse({ ...row, [field]: 'other' }).success).toBe(false);
  }
  for (const [schema, row] of [[v.setSchema, set], [v.cardioEntrySchema, cardio], [v.martialEntrySchema, martial]] as const) {
    for (let rpe = 5; rpe <= 10; rpe += 0.5) expect(schema.safeParse({ ...row, rpe }).success).toBe(true);
    expect(schema.safeParse({ ...row, rpe: 7.25 }).success).toBe(false);
  }
  for (const [, schema, row, field, low] of numericCases.filter(([, , , key]) => ['reps', 'set_index', 'distance_m', 'rounds', 'duration_s', 'duration_min', 'weekly_target', 'color_hue', 'rep_target', 'max_members'].includes(key))) {
    expect(schema.safeParse({ ...row, [field]: low + 0.5 }).success).toBe(false);
  }
  expect(v.bodyweightEntrySchema.safeParse({ ...bodyweight, weight_kg: 78.01 }).success).toBe(false);
  expect(v.setSchema.safeParse({ ...set, is_warmup: 1 }).success).toBe(false);
  expect(v.profileSchema.safeParse({ ...profile, sound_on: 'false' }).success).toBe(false);
});

it('checks DB profile HTTPS prefix, separators and SQL time edges', () => {
  for (const value of ['https://example.test/treat', null]) expect(v.profileSchema.safeParse({ ...profile, gym_treat_url: value }).success).toBe(true);
  for (const value of ['http://example.test', 'HTTPS://example.test', '']) expect(v.profileSchema.safeParse({ ...profile, gym_treat_url: value }).success).toBe(false);
  expect(v.profileSchema.safeParse({ ...profile, display_name: 'A·B' }).success).toBe(false);
  for (const value of ['00:00', '23:59:59.999999', '24:00:00', '24:00:00.000000']) expect(v.profileSchema.safeParse({ ...profile, quiet_start: value }).success).toBe(true);
  for (const value of ['25:00', '24:00:01', '12:60', 'not a time']) expect(v.profileSchema.safeParse({ ...profile, quiet_end: value }).success).toBe(false);
});

describe('E2.2 readiness', () => {
  it('accepts 1–3 only; sum 5 suggests MIN, sum 6 does not, skip does not', () => {
    for (const value of [1, 2, 3]) expect(v.readinessSchema.safeParse({ sleep: value, soreness: value, energy: value }).success).toBe(true);
    for (const field of ['sleep', 'soreness', 'energy']) {
      for (const value of [0, 4, 1.5, null, '1']) expect(v.readinessSchema.safeParse({ sleep: 2, soreness: 2, energy: 2, [field]: value }).success).toBe(false);
    }
    expect(v.readinessSchema.safeParse({ sleep: 1 }).success).toBe(false);
    expect(v.suggestsMin({ sleep: 1, soreness: 1, energy: 3 })).toBe(true);
    expect(v.suggestsMin({ sleep: 2, soreness: 2, energy: 2 })).toBe(false);
    expect(v.suggestsMin(null)).toBe(false);
  });
});

it('U-X22 / E4.9: rejects reserved labels in every casing, separators and namespace collisions', () => {
  for (const value of ['Run', 'RUN', 'rUn', 'Weight', 'wEiGhT', 'MIN', 'min', 'A·B', '']) {
    expect(v.exportLabelSchema.safeParse(value).success).toBe(false);
    expect(v.disciplineSchema.safeParse(value).success).toBe(false);
  }
  expect(v.exportLabelSchema.safeParse('x'.repeat(24)).success).toBe(true);
  expect(v.exportLabelSchema.safeParse('x'.repeat(25)).success).toBe(false);
  expect(v.disciplineSchema.safeParse('x'.repeat(16)).success).toBe(true);
  expect(v.disciplineSchema.safeParse('x'.repeat(17)).success).toBe(false);
  const schema = v.disciplineInNamespaceSchema(['Bench', 'Squat']);
  expect(schema.safeParse('BENCH').success).toBe(false);
  expect(schema.safeParse('BJJ').success).toBe(true);
});

const uiCases: [keyof typeof v.uiSchemas, number, number, number][] = [
  ['lift_kg', 0, 500, 0.25], ['added_kg', -100, 200, 0.25], ['reps', 1, 100, 1],
  ['rpe', 6, 10, 0.5], ['run_km', 0.1, 100, 0.01], ['distance_m', 100, 100000, 10],
  ['duration_s', 1, 86399, 1], ['duration_min', 1, 480, 1], ['bodyweight_kg', 30, 250, 0.1],
];
it.each(uiCases)('D14 UI %s edges and steps use the shared world-record check', (field, low, high, step) => {
  for (const value of [low, high, low + step]) expect(v.isWorldRecord(field, value)).toBe(false);
  for (const value of [low - step, high + step, low + step / 2, NaN, Infinity, '5', null]) expect(v.isWorldRecord(field, value)).toBe(true);
});
it('checks all UI text edges through the same helper', () => {
  for (const [field, low, high] of [['display_name', 1, 16], ['min_label', 1, 40], ['session_note', 0, 200], ['set_note', 0, 120]] as const) {
    expect(v.isWorldRecord(field, 'x'.repeat(low))).toBe(false);
    expect(v.isWorldRecord(field, 'x'.repeat(high))).toBe(false);
    expect(v.isWorldRecord(field, 'x'.repeat(high + 1))).toBe(true);
    if (low > 0) expect(v.isWorldRecord(field, '')).toBe(true);
  }
});

it('U-V1 / E2.3: form schemas ⊆ DB schemas, import schemas retain the wider safety nets', () => {
  expect(v.profileSchema.safeParse({ ...profile, display_name: 'x'.repeat(20) }).success).toBe(true);
  expect(v.profileFormSchema.safeParse({ ...profile, display_name: 'x'.repeat(17) }).success).toBe(false);
  expect(v.profileFormSchema.safeParse({ ...profile, display_name: 'x'.repeat(16) }).success).toBe(true);
  expect(v.bodyweightEntrySchema.safeParse({ ...bodyweight, weight_kg: 300 }).success).toBe(true);
  expect(v.bodyweightFormSchema.safeParse({ ...bodyweight, weight_kg: 250.1 }).success).toBe(false);
  expect(v.bodyweightFormSchema.safeParse({ ...bodyweight, weight_kg: 250 }).success).toBe(true);
  expect(v.setImportSchema('lift').safeParse({ ...set, weight_kg: -0.01 }).success).toBe(false);
  expect(v.setImportSchema('bw_lift').safeParse({ ...set, weight_kg: -250 }).success).toBe(true);
  const pairs: [z.ZodType, z.ZodType, object][] = [
    [v.setFormSchema('lift'), v.setImportSchema('lift'), set],
    [v.setFormSchema('bw_lift'), v.setImportSchema('bw_lift'), { ...set, weight_kg: -100 }],
    [v.cardioFormSchema, v.cardioEntrySchema, cardio],
    [v.martialFormSchema, v.martialEntrySchema, martial],
  ];
  for (const [form, imported, row] of pairs) {
    for (let rpe = 5; rpe <= 10; rpe += 0.25) {
      const candidate = { ...row, rpe };
      const accepted = form.safeParse(candidate).success;
      expect(accepted).toBe(rpe >= 6 && Number.isInteger(rpe * 2));
      if (accepted) expect(imported.safeParse(candidate).success).toBe(true);
    }
    expect(form.safeParse({ ...row, rpe: null }).success).toBe(true);
  }
  expect(v.cardioEntrySchema.safeParse({ ...cardio, duration_s: 86400 }).success).toBe(true);
  expect(v.cardioFormSchema.safeParse({ ...cardio, duration_s: 86400 }).success).toBe(false);
  expect(v.setFormSchema('lift').safeParse({ ...set, weight_kg: -0.25 }).success).toBe(false);
  expect(v.setFormSchema('bw_lift').safeParse({ ...set, weight_kg: 200.25 }).success).toBe(false);
});
