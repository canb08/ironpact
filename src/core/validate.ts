import { z } from 'zod';
import type {
  BodyweightEntry, CardioEntry, Crew, CrewMember, Exercise, MartialEntry,
  MinEntry, Profile, Readiness, Session, SetRow, SyncFields,
} from './types.ts';

// E2.3: import schemas mirror DB checks; form schemas are their narrower subset.
// Count Unicode code points, like PostgreSQL char_length (not UTF-16 units).
const text = (min: number, max: number) => z.string().refine((s) => {
  const length = Array.from(s).length;
  return length >= min && length <= max;
});
const withoutSeparator = (min: number, max: number) => text(min, max).refine((s) => !s.includes('·'));
// E4.9: reserved export keywords are rejected without changing stored labels.
const label = (max: number) => withoutSeparator(1, max)
  .refine((s) => !['run', 'weight', 'min'].includes(s.toLowerCase()));
const smallint = z.int().min(-32768).max(32767);
export const localDateSchema = z.iso.date();
export const instantSchema = z.iso.datetime({ offset: true });
// PostgreSQL accepts every UUID version, including deterministic uuidv5 IDs.
const uuid = z.guid();
export const exportLabelSchema = label(24);
export const disciplineSchema = label(16);
export const dbRpeSchema = z.number().min(5).max(10).multipleOf(0.5);
const note = text(0, 120).nullable();
const syncShape = {
  id: uuid, user_id: uuid, local_date: localDateSchema,
  client_updated_at: instantSchema, updated_at: instantSchema.optional(),
  deleted_at: instantSchema.nullable(), created_at: instantSchema.optional(),
};
export const syncFieldsSchema = z.object(syncShape) satisfies z.ZodType<SyncFields>;
// E2.2: readiness rows store 1–3; sum ≤5 suggests MIN.
export const readinessSchema = z.object({
  sleep: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  soreness: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  energy: z.union([z.literal(1), z.literal(2), z.literal(3)]),
}) satisfies z.ZodType<Readiness>;
export function suggestsMin(readiness: Readiness | null): boolean {
  return readiness !== null && readiness.sleep + readiness.soreness + readiness.energy <= 5;
}

// PostgreSQL time allows seconds/fractions and 24:00:00 as the end of day.
const time = z.string().regex(/^(?:(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?|24:00(?::00(?:\.0{1,6})?)?)$/);
export const profileSchema = z.object({
  id: uuid, display_name: withoutSeparator(1, 20), initial: text(1, 1),
  color_hue: z.int().min(0).max(359), tz: z.string(), weekly_target: z.int().min(1).max(7),
  show_bodyweight: z.boolean(), share_dots: z.boolean(), sound_on: z.boolean(),
  haptics_on: z.boolean(), reduce_motion: z.boolean(), battery_saver: z.boolean(),
  big_jumps: z.boolean(), theme: z.enum(['dark', 'light', 'system']),
  quiet_start: time, quiet_end: time,
  notify: z.object({ partner_start: z.boolean(), partner_pr: z.boolean(), nudge: z.boolean(), recap: z.boolean(), spot: z.boolean() }),
  min_default_label: text(1, 40), gym_treat_url: z.string().startsWith('https://').nullable(),
  bar_kg: z.number().min(-999.99).max(999.99), plates_kg: z.array(z.number()),
  export_format: z.enum(['lines', 'json', 'csv']), updated_at: instantSchema.optional(),
}) satisfies z.ZodType<Profile>;
export const crewSchema = z.object({
  id: uuid, name: text(1, 24), tz: z.string(), max_members: smallint, created_by: uuid.nullable(),
}) satisfies z.ZodType<Crew>;
export const crewMemberSchema = z.object({
  crew_id: uuid, user_id: uuid, role: z.enum(['owner', 'member']),
  joined_at: instantSchema, left_at: instantSchema.nullable(),
}) satisfies z.ZodType<CrewMember>;
export const exerciseSchema = z.object({
  id: uuid, owner_id: uuid.nullable(), name: text(1, 40), export_label: exportLabelSchema,
  aliases: z.array(z.string()), kind: z.enum(['lift', 'bw_lift', 'run', 'martial']),
  category: z.enum(['compound', 'isolation']), lower_body: z.boolean(), equipment: z.string().nullable(),
  increment_kg: z.number().min(-99.99).max(99.99), rep_target: z.int().min(1).max(100),
  client_updated_at: instantSchema, updated_at: instantSchema.optional(), deleted_at: instantSchema.nullable(),
}) satisfies z.ZodType<Exercise>;
export const sessionSchema = z.object({
  ...syncShape, kind: z.enum(['gym', 'run', 'martial', 'min']), mode: z.enum(['full', 'min']),
  started_at: instantSchema, ended_at: instantSchema.nullable(), tz: z.string(),
  readiness: readinessSchema.nullable(), together_id: uuid.nullable(), note: text(0, 200).nullable(),
}) satisfies z.ZodType<Session>;
export const setSchema = z.object({
  ...syncShape, session_id: uuid, exercise_id: uuid, set_index: smallint.min(1),
  reps: z.int().min(1).max(100), weight_kg: z.number().min(-250).max(500),
  rpe: dbRpeSchema.nullable(), is_warmup: z.boolean(), note, logged_at: instantSchema,
}) satisfies z.ZodType<SetRow>;
export const cardioEntrySchema = z.object({
  ...syncShape, session_id: uuid, activity: z.literal('Run'), distance_m: z.int().min(100).max(100000),
  duration_s: z.int().min(1).max(86400), rpe: dbRpeSchema.nullable(), note, logged_at: instantSchema,
}) satisfies z.ZodType<CardioEntry>;
export const martialEntrySchema = z.object({
  ...syncShape, session_id: uuid, discipline: disciplineSchema, duration_min: z.int().min(1).max(480),
  rounds: z.int().min(1).max(99).nullable(), rpe: dbRpeSchema.nullable(), note, logged_at: instantSchema,
}) satisfies z.ZodType<MartialEntry>;
export const minEntrySchema = z.object({
  ...syncShape, session_id: uuid, description: text(1, 40), duration_min: z.int().min(1).max(480).nullable(),
  logged_at: instantSchema,
}) satisfies z.ZodType<MinEntry>;
export const bodyweightEntrySchema = z.object({
  ...syncShape, weight_kg: z.number().min(30).max(300).multipleOf(0.1), measured_at: instantSchema,
}) satisfies z.ZodType<BodyweightEntry>;
export const exercisePrefSchema = z.object({
  ...syncShape, exercise_id: uuid, rest_s: z.int().min(15).max(600),
});
export const prEventSchema = z.object({
  ...syncShape,
  exercise_id: uuid.nullable(),
  source_id: uuid,
  pr_type: z.enum(['e1rm', 'rep_max', 'volume', 'distance', 'pace']),
  reps: smallint.nullable(),
  value: z.number().finite(),
  previous_value: z.number().finite().nullable(),
  pct_over_previous: z.number().finite().nullable(),
  seen_by: z.array(uuid),
});

// §2.7, D14, E2.3: one source for form limits and the world-record predicate.
export const uiSchemas = {
  lift_kg: z.number().min(0).max(500).multipleOf(0.25),
  added_kg: z.number().min(-100).max(200).multipleOf(0.25),
  reps: z.int().min(1).max(100), rpe: z.number().min(6).max(10).multipleOf(0.5),
  run_km: z.number().min(0.1).max(100).multipleOf(0.01),
  distance_m: z.int().min(100).max(100000).multipleOf(10),
  duration_s: z.int().min(1).max(86399), duration_min: z.int().min(1).max(480),
  bodyweight_kg: z.number().min(30).max(250).multipleOf(0.1),
  display_name: withoutSeparator(1, 16), min_label: text(1, 40),
  session_note: text(0, 200), set_note: text(0, 120),
} as const;
export function isWorldRecord(field: keyof typeof uiSchemas, value: unknown): boolean {
  return !uiSchemas[field].safeParse(value).success;
}
export const profileFormSchema = profileSchema.extend({ display_name: uiSchemas.display_name });
export const bodyweightFormSchema = bodyweightEntrySchema.extend({ weight_kg: uiSchemas.bodyweight_kg });
export const cardioFormSchema = cardioEntrySchema.extend({
  distance_m: uiSchemas.distance_m, duration_s: uiSchemas.duration_s, rpe: uiSchemas.rpe.nullable(),
});
export const martialFormSchema = martialEntrySchema.extend({ rpe: uiSchemas.rpe.nullable() });
// DB trigger enforce_bw_negative needs exercise context, as does form weight selection.
export function setFormSchema(kind: 'lift' | 'bw_lift') {
  return setSchema.extend({
    weight_kg: kind === 'bw_lift' ? uiSchemas.added_kg : uiSchemas.lift_kg,
    rpe: uiSchemas.rpe.nullable(),
  });
}
export function setImportSchema(kind: 'lift' | 'bw_lift') {
  return setSchema.extend({ weight_kg: kind === 'bw_lift' ? setSchema.shape.weight_kg : z.number().min(0).max(500) });
}
// E4.9: callers provide the current owner's visible lift labels; DB remains authoritative.
export function disciplineInNamespaceSchema(liftLabels: readonly string[]) {
  const taken = new Set(liftLabels.map((s) => s.toLowerCase()));
  return disciplineSchema.refine((s) => !taken.has(s.toLowerCase()));
}
