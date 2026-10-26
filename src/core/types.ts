// FROZEN CONTRACT (C1). Row shapes mirror supabase/migrations/0001_schema.sql.
// Change only through a "Contract change request" in a PR, approved by the Lead.

export type Uuid = string;
/** ISO-8601 instant, e.g. "2026-10-24T08:10:00.000Z". */
export type Instant = string;
/** Calendar date "YYYY-MM-DD" in the session's tz (D9, §10 E5.5). */
export type LocalDate = string;

/** Columns every synced user-owned row carries (§4.3 conventions, §4.6). */
export interface SyncFields {
  id: Uuid;
  user_id: Uuid;
  local_date: LocalDate;
  client_updated_at: Instant;
  updated_at?: Instant; // server-set; absent until the first pull/ack
  deleted_at: Instant | null;
  created_at?: Instant;
}

export type ExportFormat = 'lines' | 'json' | 'csv';
export type Theme = 'dark' | 'light' | 'system';

export interface NotifyPrefs {
  partner_start: boolean;
  partner_pr: boolean;
  nudge: boolean;
  recap: boolean;
  spot: boolean;
}

export interface Profile {
  id: Uuid;
  display_name: string; // UI caps at 16 (D14)
  initial: string;
  color_hue: number; // 0–359
  tz: string; // device tz, refreshed each launch (E5.5); pushes/quiet hours only
  weekly_target: number; // 1–7, default 3
  show_bodyweight: boolean;
  share_dots: boolean;
  sound_on: boolean;
  haptics_on: boolean;
  reduce_motion: boolean;
  battery_saver: boolean;
  big_jumps: boolean;
  theme: Theme;
  quiet_start: string; // "22:00"
  quiet_end: string; // "08:00"
  notify: NotifyPrefs;
  min_default_label: string; // "20m walk"
  gym_treat_url: string | null;
  bar_kg: number;
  plates_kg: number[];
  export_format: ExportFormat;
  updated_at?: Instant;
}

export interface Crew {
  id: Uuid;
  name: string;
  tz: string; // crew week timezone, default Europe/Amsterdam
  max_members: number;
  created_by: Uuid | null;
}

export interface CrewMember {
  crew_id: Uuid;
  user_id: Uuid;
  role: 'owner' | 'member';
  joined_at: Instant; // join order → pattern slot A/B/C (§4.0 D4)
  left_at: Instant | null;
}

export type ExerciseKind = 'lift' | 'bw_lift' | 'run' | 'martial';

export interface Exercise {
  id: Uuid;
  owner_id: Uuid | null; // null = global seed
  name: string;
  export_label: string; // ≤24, no "·", not Run/Weight/MIN
  aliases: string[];
  kind: ExerciseKind;
  category: 'compound' | 'isolation'; // rest default 120 s / 90 s
  lower_body: boolean;
  equipment: string | null;
  increment_kg: number;
  rep_target: number;
  client_updated_at: Instant;
  updated_at?: Instant;
  deleted_at: Instant | null;
}

export type SessionKind = 'gym' | 'run' | 'martial' | 'min';
export type SessionMode = 'full' | 'min';

/** Stored 1–3 per row (§10 E2.2); a low sum suggests MIN. */
export interface Readiness {
  sleep: 1 | 2 | 3;
  soreness: 1 | 2 | 3;
  energy: 1 | 2 | 3;
}

export interface Session extends SyncFields {
  kind: SessionKind;
  mode: SessionMode;
  started_at: Instant;
  ended_at: Instant | null;
  tz: string; // device tz at start; local_date is computed in it
  readiness: Readiness | null;
  together_id: Uuid | null;
  note: string | null; // ≤200
}

export interface SetRow extends SyncFields {
  session_id: Uuid;
  exercise_id: Uuid;
  set_index: number; // ≥1
  reps: number; // 1–100
  weight_kg: number; // bw_lift: ADDED load, may be negative
  rpe: number | null; // UI 6–10 step 0.5; DB 5–10
  is_warmup: boolean;
  note: string | null; // ≤120
  logged_at: Instant;
}

export interface CardioEntry extends SyncFields {
  session_id: Uuid;
  activity: 'Run';
  distance_m: number; // 100–100000
  duration_s: number;
  rpe: number | null;
  note: string | null;
  logged_at: Instant;
}

export interface MartialEntry extends SyncFields {
  session_id: Uuid;
  discipline: string; // D18 list or free text ≤16
  duration_min: number; // 1–480
  rounds: number | null;
  rpe: number | null;
  note: string | null;
  logged_at: Instant;
}

export interface MinEntry extends SyncFields {
  session_id: Uuid;
  description: string; // ≤40, default "20m walk"
  duration_min: number | null;
  logged_at: Instant;
}

/** id = uuidv5(`${user_id}:${local_date}`, NS_BODYWEIGHT): one row per day (§4.6). */
export interface BodyweightEntry extends SyncFields {
  weight_kg: number; // 30–300, 1 decimal
  measured_at: Instant;
}

export interface ExportTokenMeta {
  id: Uuid;
  label: string;
  created_at: Instant;
  last_used_at: Instant | null;
  revoked_at: Instant | null;
}

/** Tables the client writes through the outbox, in flush priority order (§4.6). */
export const SYNCED_TABLES = [
  'profiles',
  'exercises',
  'exercise_muscles',
  'exercise_prefs',
  'sessions',
  'sets',
  'cardio_entries',
  'martial_entries',
  'min_entries',
  'bodyweight_entries',
  'pr_events',
  'reactions',
  'goals',
  'challenges',
] as const;
export type SyncedTable = (typeof SYNCED_TABLES)[number];

/** Tables pulled from the server into the local mirror (adds server-written ones). */
export const PULLED_TABLES = [
  ...SYNCED_TABLES,
  'crews',
  'crew_members',
  'crew_weeks',
  'streak_tokens',
  'nudges',
  'challenge_participants',
] as const;
export type PulledTable = (typeof PULLED_TABLES)[number];

export type Result<T, E extends string> = { ok: true; value: T } | { ok: false; error: E };
