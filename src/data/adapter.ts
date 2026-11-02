// FROZEN CONTRACT (C1). Two seams:
//   Remote — the network edge. Two implementations: adapter.supabase.ts and adapter.mock.ts
//            (VITE_BACKEND=mock, in-memory, simulates crewmates). The outbox, sync and pull
//            code is identical for both, so the mock exercises the real offline path.
//   Repo   — everything the UI may call. UI never imports Dexie tables, the outbox or Supabase.
// Change only through a "Contract change request" in a PR, approved by the Lead.

import type { CrewRealtime, CrewRealtimeCallbacks, RepoDuo, SpotError } from './duo.contract.ts';
import type {
  BodyweightEntry,
  CardioEntry,
  Crew,
  CrewMember,
  ExportFormat,
  ExportTokenMeta,
  Exercise,
  Instant,
  LocalDate,
  MartialEntry,
  MinEntry,
  Profile,
  PulledTable,
  Readiness,
  Result,
  Session,
  SessionKind,
  SetRow,
  SyncFields,
  SyncedTable,
  Uuid,
} from '../core/types.ts';

export type Unsubscribe = () => void;

// ---------------------------------------------------------------- Remote

export type SendCodeError = 'rate_limited' | 'invalid_email' | 'network';
export type VerifyCodeError = 'bad_code' | 'expired' | 'network';
/** Values returned by the redeem_invite RPC (A3, approved contract change). */
export type RedeemError = 'code_dead' | 'crew_full' | 'slow_down' | 'already_in_crew' | 'network';

/** One row as stored on the server; tables share the SyncFields columns. */
export type RemoteRow = Record<string, unknown> & { id?: Uuid };

/** A server-side failure for one batch, classified for the flush loop (§4.6, E5.2). */
export type RemoteWriteError =
  | { kind: 'client'; status: number; message: string } // 4xx: bisect, then dead-letter
  | { kind: 'transient'; status: number | null; message: string }; // network/5xx: back off

export interface KeysetCursor {
  updated_at: Instant;
  id: string; // composite keys are serialised by the Remote
}

export interface Remote {
  readonly kind: 'supabase' | 'mock';
  /** L16: online-only, idempotent acknowledgement of live crewmate PRs. */
  markPrEventsSeen(ids: readonly Uuid[]): Promise<Result<void, 'network'>>;
  useSpot(weekStart: LocalDate): Promise<Result<Uuid, SpotError>>;
  subscribeCrew(crewId: Uuid, callbacks: CrewRealtimeCallbacks): Promise<CrewRealtime>;

  // auth (D4: 6-digit email code is primary)
  currentUserId(): Uuid | null;
  onAuthChange(cb: (userId: Uuid | null) => void): Unsubscribe;
  sendCode(email: string): Promise<Result<void, SendCodeError>>;
  verifyCode(email: string, code: string): Promise<Result<Uuid, VerifyCodeError>>;
  signOut(): Promise<void>;
  /** L11: online-only irreversible deletion; clears authentication on success. */
  deleteAccount(): Promise<Result<void, 'network'>>;

  /** Server clock for the per-launch offset (E5.4). */
  serverNow(): Promise<Instant>;

  /**
   * Upsert ≤100 rows by primary key and return the rows as the server now holds them (E5.1).
   * Rows dropped by lww_guard come back with the server's newer values.
   */
  upsert(table: SyncedTable, rows: RemoteRow[]): Promise<{ ok: true; value: RemoteRow[] } | { ok: false; error: RemoteWriteError }>;

  /** Keyset page ordered by (updated_at, id), strictly after `after` (E5.3). */
  pullPage(table: PulledTable, after: KeysetCursor | null, limit: number): Promise<Result<RemoteRow[], 'network'>>;

  /** Rows by id, for E5.1 "sent but not returned". */
  fetchByIds(table: SyncedTable, ids: Uuid[]): Promise<Result<RemoteRow[], 'network'>>;

  // RPCs (supabase/migrations/0003_rpc.sql)
  createCrew(name: string, tz: string): Promise<Result<Uuid, 'already_in_crew' | 'invalid_timezone' | 'network'>>;
  createInvite(crewId: Uuid): Promise<Result<string, 'not_crew_owner' | 'network'>>; // plain 10-char code
  redeemInvite(code: string): Promise<Result<Uuid, RedeemError>>;
  leaveCrew(crewId: Uuid): Promise<Result<void, 'network'>>;
  createExportToken(label: string): Promise<Result<string, 'token_limit' | 'network'>>; // plain spx_… once
  revokeExportToken(id: Uuid): Promise<Result<void, 'network'>>;
  listExportTokens(): Promise<Result<ExportTokenMeta[], 'network'>>;
}

// ---------------------------------------------------------------- Sync status

export type SyncState = 'idle' | 'flushing' | 'offline' | 'server_asleep'; // server_asleep after 3 failed attempts

export interface DeadLetter {
  seq: number;
  table: SyncedTable;
  row_id: Uuid;
  last_error: string;
  created_at: Instant;
}

export interface SyncStatus {
  state: SyncState;
  pendingCount: number;
  deadCount: number;
  lastSyncedAt: Instant | null;
}

// ---------------------------------------------------------------- Repo (the UI's only door)

export type ValidationError = 'world_record'; // UI copy: "That's a world record. Check it."
export type WriteError = ValidationError | 'storage_full' | 'no_open_session' | 'session_already_open';

export interface StartSessionInput {
  kind: SessionKind;
  mode?: 'full' | 'min';
  readiness?: Readiness | null;
}

export interface LogSetInput {
  session_id: Uuid;
  exercise_id: Uuid;
  reps: number;
  weight_kg: number;
  rpe?: number | null;
  is_warmup?: boolean;
  note?: string | null;
}

export type SetPatch = Partial<Pick<SetRow, 'reps' | 'weight_kg' | 'rpe' | 'is_warmup' | 'note'>>;

export interface QuickRunInput {
  distance_m: number;
  duration_s: number;
  rpe?: number | null;
  note?: string | null;
}
export interface QuickMartialInput {
  discipline: string;
  duration_min: number;
  rounds?: number | null;
  rpe?: number | null;
  note?: string | null;
}

/** A partner's entry for the Crew feed (S12), newest first. */
export type FeedItem =
  | { type: 'set'; row: SetRow; exercise: Exercise }
  | { type: 'run'; row: CardioEntry }
  | { type: 'martial'; row: MartialEntry }
  | { type: 'min'; row: MinEntry }
  | { type: 'weight'; row: BodyweightEntry };

/** One of my sessions plus its live sets, ordered by `set_index` (S14, F4). */
export interface SessionWithSets {
  session: Session;
  sets: SetRow[];
}

/** `exercise_prefs` row. Big jumps is not stored here (`profiles.big_jumps`). */
export interface ExercisePref extends SyncFields {
  exercise_id: Uuid;
  rest_s: number; // 15–600
}

export type PrType = 'e1rm' | 'rep_max' | 'volume' | 'distance' | 'pace';

/** Columns of `pr_events`. Draft-only fields (`display`, `bucket_label`) are not stored. */
export interface PrEvent extends SyncFields {
  exercise_id: Uuid | null;
  source_id: Uuid;
  pr_type: PrType;
  reps: number | null;
  value: number;
  previous_value: number | null;
  pct_over_previous: number | null;
  seen_by: Uuid[];
}

/**
 * Shape produced by `core/prs.ts`. Extra draft fields are ignored.
 * `id`, `seen_by` and sync timestamps are filled by `recordPrEvents`.
 */
export interface PrEventDraftRow {
  exercise_id: Uuid | null;
  source_id: Uuid;
  pr_type: PrType;
  reps: number | null;
  value: number;
  previous_value: number | null;
  pct_over_previous: number | null;
  user_id: Uuid;
  local_date: LocalDate;
}

export interface PrEventFilter {
  exerciseId?: Uuid;
  sessionId?: Uuid;
  /** Inclusive `local_date` lower bound (YYYY-MM-DD). */
  since?: LocalDate;
}

/** L13: standing PRs after `recomputePrs`. `changed` is true when a row was tombstoned or inserted. */
export interface PrRecompute {
  changed: boolean;
}

/** Shown on S14/S15 after an edit. Absent means the write did not look. */
export interface EditNotice {
  prsChanged: boolean;
  barAdjusted: boolean;
}

export type NotedResult<T, E extends string> = Result<T, E> & { notice?: EditNotice };

export interface SessionPatch {
  started_at?: Instant;
  ended_at?: Instant | null;
  note?: string | null;
  readiness?: Readiness | null;
  local_date?: LocalDate;
}

export interface CardioPatch {
  distance_m?: number;
  duration_s?: number;
  rpe?: number | null;
  note?: string | null;
  local_date?: LocalDate;
}
export interface MartialPatch {
  discipline?: string;
  duration_min?: number;
  rounds?: number | null;
  rpe?: number | null;
  note?: string | null;
  local_date?: LocalDate;
}
export interface MinPatch {
  description?: string;
  duration_min?: number | null;
  local_date?: LocalDate;
}
export interface BodyweightPatch {
  weight_kg?: number;
  measured_at?: Instant;
  local_date?: LocalDate;
}

export interface EntryPatchMap {
  cardio_entries: CardioPatch;
  martial_entries: MartialPatch;
  min_entries: MinPatch;
  bodyweight_entries: BodyweightPatch;
}
export interface EntryRowMap {
  cardio_entries: CardioEntry;
  martial_entries: MartialEntry;
  min_entries: MinEntry;
  bodyweight_entries: BodyweightEntry;
}

/** Same bundle as `entriesBetween`, scoped to one of my local dates (S15). */
export interface DayEntries {
  sessions: Session[];
  sets: SetRow[];
  cardio: CardioEntry[];
  martial: MartialEntry[];
  min: MinEntry[];
  bodyweight: BodyweightEntry[];
}

/**
 * Query functions read only the local mirror (Dexie) and are safe inside
 * `useLiveQuery(() => repo.q.x(...))` — they re-run when the mirror changes.
 * They never return soft-deleted rows.
 */
export interface RepoQueries {
  me(): Promise<Profile | undefined>;
  profiles(userIds: Uuid[]): Promise<Profile[]>;
  myCrew(): Promise<{ crew: Crew; members: CrewMember[] } | undefined>;
  exercises(): Promise<Exercise[]>; // global + mine + crewmates' custom
  recentExercises(limit: number): Promise<Exercise[]>; // S7 "recent 8"
  openSession(): Promise<Session | undefined>;
  session(id: Uuid): Promise<Session | undefined>;
  setsOfSession(sessionId: Uuid): Promise<SetRow[]>; // by set_index
  lastSessionSummary(userId: Uuid): Promise<{ session: Session; sets: SetRow[] } | undefined>;
  entriesBetween(userId: Uuid, from: LocalDate, to: LocalDate): Promise<{
    sessions: Session[];
    sets: SetRow[];
    cardio: CardioEntry[];
    martial: MartialEntry[];
    min: MinEntry[];
    bodyweight: BodyweightEntry[];
  }>;
  crewFeed(limit: number): Promise<FeedItem[]>; // partners only
  /** true while any pending outbox entry exists for the row: grey tick vs chalk tick. */
  isPending(rowId: Uuid): Promise<boolean>;
  deadLetters(): Promise<DeadLetter[]>;
  /** My sessions that contain this exercise, newest first, each with its live sets (S14, F4, F5). */
  exerciseHistory(exerciseId: Uuid, limitSessions: number): Promise<SessionWithSets[]>;
  /** My last N finished gym sessions with sets ordered by `set_index` (next-exercise guess, F4). */
  recentSessionsWithSets(limit: number): Promise<SessionWithSets[]>;
  /** My live (non-deleted) PR events. `sessionId` matches set and run sources. */
  prEvents(filter: PrEventFilter): Promise<PrEvent[]>;
  /** L16: live current crewmates’ PRs not yet seen by the viewer. */
  unseenPartnerPrs(): Promise<PrEvent[]>;
  /** My `exercise_prefs` row, or `undefined` when unset or soft-deleted. */
  exercisePref(exerciseId: Uuid): Promise<ExercisePref | undefined>;
  /** Every entry of mine on that local date (S15). */
  day(date: LocalDate): Promise<DayEntries>;
}

export interface RepoWrites {
  /** L16: RPC online, no outbox entry offline; retry on next open. */
  markPrEventsSeen(ids: readonly Uuid[]): Promise<Result<void, 'network'>>;
  upsertMyProfile(patch: Partial<Omit<Profile, 'id'>>): Promise<Result<Profile, WriteError>>;
  createExercise(input: Pick<Exercise, 'name' | 'export_label' | 'kind' | 'category' | 'lower_body'>): Promise<Result<Exercise, WriteError | 'label_taken'>>;
  startSession(input: StartSessionInput): Promise<Result<Session, WriteError>>;
  finishSession(id: Uuid, note?: string | null): Promise<Result<Session, WriteError>>;
  discardSession(id: Uuid): Promise<Result<void, WriteError>>;
  logSet(input: LogSetInput): Promise<Result<SetRow, WriteError>>;
  updateSet(id: Uuid, patch: SetPatch): Promise<NotedResult<SetRow, WriteError>>;
  /** Quick logs (S11) each create their own session + child row in one transaction. */
  logRun(input: QuickRunInput): Promise<Result<CardioEntry, WriteError>>;
  logMartial(input: QuickMartialInput): Promise<Result<MartialEntry, WriteError>>;
  logMin(description?: string): Promise<Result<MinEntry, WriteError>>; // Floor MIN = 1 tap, "20m walk"
  logBodyweight(kg: number): Promise<Result<BodyweightEntry, WriteError>>; // same-day replaces (uuidv5)
  /** Soft delete through the outbox; a set's PR events go in the same batch (§4.6). */
  softDelete(table: 'sessions' | 'sets' | 'cardio_entries' | 'martial_entries' | 'min_entries' | 'bodyweight_entries', id: Uuid): Promise<NotedResult<void, WriteError>>;
  restore(table: 'sessions' | 'sets' | 'cardio_entries' | 'martial_entries' | 'min_entries' | 'bodyweight_entries', id: Uuid): Promise<NotedResult<void, WriteError>>;
  /** Insert PR drafts from `core/prs.ts` in one outbox transaction. Non-columns are dropped. */
  recordPrEvents(rows: readonly PrEventDraftRow[]): Promise<Result<PrEvent[], WriteError>>;
  /**
   * Re-run `core/prs.ts` over my live history for this exercise, or for every run
   * when `exerciseId` is null. Tombstone `pr_events` that no longer hold and insert
   * the ones that now hold, in one outbox batch (L13).
   */
  recomputePrs(exerciseId: Uuid | null): Promise<Result<PrRecompute, WriteError>>;
  /** Rest seconds only. Big jumps is `profiles.big_jumps` via `q.me()` / `upsertMyProfile`. */
  setExercisePref(exerciseId: Uuid, patch: { rest_s: number }): Promise<Result<ExercisePref, WriteError>>;
  /** `local_date` moves children in the same batch (E5.5). */
  updateSession(id: Uuid, patch: SessionPatch): Promise<NotedResult<Session, WriteError>>;
  /**
   * Edit one quick-log or bodyweight row.
   * A `local_date` on a session child moves that session (and its other children).
   * A bodyweight date change soft-deletes the old id and writes the uuidv5 id for the new date (E4.6).
   */
  updateEntry<T extends keyof EntryPatchMap>(table: T, id: Uuid, patch: EntryPatchMap[T]): Promise<NotedResult<EntryRowMap[T], WriteError>>;
}

export interface RepoAuth {
  userId(): Uuid | null;
  onChange(cb: (userId: Uuid | null) => void): Unsubscribe;
  sendCode(email: string): Promise<Result<void, SendCodeError>>;
  verifyCode(email: string, code: string): Promise<Result<Uuid, VerifyCodeError>>;
  signOut(): Promise<void>; // also clears the local mirror
  /** L11: also erases the device mirror/outbox after server-confirmed deletion. */
  deleteAccount(): Promise<Result<void, 'network'>>;
}

export interface RepoCrew {
  create(name: string): Promise<Result<Crew, 'already_in_crew' | 'network'>>; // tz = device tz
  createInvite(): Promise<Result<string, 'not_crew_owner' | 'network'>>;
  redeem(code: string): Promise<Result<Crew, RedeemError>>;
  leave(): Promise<Result<void, 'network'>>;
}

export interface RepoExport {
  createToken(label: string): Promise<Result<string, 'token_limit' | 'network'>>;
  revokeToken(id: Uuid): Promise<Result<void, 'network'>>;
  listTokens(): Promise<Result<ExportTokenMeta[], 'network'>>;
  setFormat(format: ExportFormat): Promise<Result<Profile, WriteError>>;
}

export interface RepoSync {
  status(): SyncStatus;
  onStatus(cb: (s: SyncStatus) => void): Unsubscribe;
  flushNow(): Promise<void>; // single-flight
  pullNow(): Promise<void>;
  retryDead(seq: number): Promise<void>;
  discardDead(seq: number): Promise<void>;
}

export interface Repo {
  duo: RepoDuo;
  readonly backend: 'supabase' | 'mock';
  auth: RepoAuth;
  q: RepoQueries;
  w: RepoWrites;
  crew: RepoCrew;
  exportTokens: RepoExport;
  sync: RepoSync;
}
