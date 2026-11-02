import type { Table } from 'dexie';
import type { z } from 'zod';
import { v5 } from 'uuid';
import type { BodyweightEntry, CardioEntry, MartialEntry, MinEntry, Result, Session, SetRow, SyncedTable, SyncFields } from '../core/types.ts';
import { recomputePrs as standingPrs, type PrEventDraft, type PrHistory } from '../core/prs.ts';
import { weekStartOf } from '../core/weeks.ts';
import { bodyweightFormSchema, cardioFormSchema, disciplineInNamespaceSchema, exercisePrefSchema, exerciseSchema, martialFormSchema, minEntrySchema, prEventSchema, profileFormSchema, sessionSchema, setFormSchema } from '../core/validate.ts';
import type { EditNotice, ExercisePref, FeedItem, PrEvent, Repo, RepoQueries, RepoWrites, SessionPatch, SessionWithSets, StartSessionInput, WriteError } from './adapter.ts';
import { createClock, localDateIn, type Clock } from './clock.ts';
import { asRemote, IronpactDB } from './db.ts';
import { defaultProfile } from './defaults.ts';
import { bodyweightId, newId } from './ids.ts';
import { enqueue, isPending, type Mutation } from './outbox.ts';
import type { Remote } from './adapter.ts';
import { browserEnvironment, SyncEngine, type SyncEnvironment } from './sync.ts';
import { createDuo } from './duo.ts';

/** E4.6 natural key. UUIDv5 of `ironpact.exercise_prefs` in the DNS namespace (L9). */
const NS_EXERCISE_PREF = 'bcd6de86-04e6-52f5-ae97-a0323dde2be5';
function exercisePrefId(userId: string, exerciseId: string): string {
  return v5(`${userId}:${exerciseId}`, NS_EXERCISE_PREF);
}
const SESSION_CHILDREN = ['sets', 'cardio_entries', 'martial_entries', 'min_entries'] as const;

export interface DataRepoOptions { db?: IronpactDB; clock?: Clock; environment?: SyncEnvironment; autoStart?: boolean; realtime?: boolean }
export interface ManagedRepo extends Repo { ready: Promise<void>; close(): void }
class WriteFailure extends Error { constructor(readonly code: WriteError | 'label_taken') { super(code); } }
const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
const active = (row: { deleted_at?: string | null }) => !row.deleted_at;

export function createDataRepo(remote: Remote, options: DataRepoOptions = {}): ManagedRepo {
  const db = options.db ?? new IronpactDB();
  const clock = options.clock ?? createClock();
  const environment = options.environment ?? browserEnvironment();
  const engine = new SyncEngine(db, remote, clock, environment);
  const duo = createDuo(db, remote, clock, environment, () => engine.pullNow());
  const realtimeEnabled = options.realtime ?? options.autoStart !== false;
  let closed = false;
  let epoch = 0;
  let gate: Promise<void> = Promise.resolve();
  const authListeners = new Set<(id: string | null) => void>();

  function requireUser(): string {
    const user = remote.currentUserId();
    if (!user || closed) throw new WriteFailure('no_open_session');
    return user;
  }
  function validate<T>(schema: z.ZodType<T>, row: unknown): T {
    const parsed = schema.safeParse(row);
    if (!parsed.success) throw new WriteFailure('world_record');
    return parsed.data;
  }
  function fields(user: string, now = clock.now(), date = localDateIn(clock.timezone(), now)): SyncFields {
    return { id: newId(), user_id: user, local_date: date, client_updated_at: now, deleted_at: null };
  }
  function sessionRow(user: string, input: StartSessionInput, ended = false): Session {
    const now = clock.now();
    return validate(sessionSchema, { ...fields(user, now), kind: input.kind, mode: input.mode ?? 'full', started_at: now,
      ended_at: ended ? now : null, tz: clock.timezone(), readiness: input.readiness ?? null, together_id: null, note: null });
  }
  async function save(table: SyncedTable, row: object): Promise<void> {
    await enqueue(db, [{ table, row: asRemote(row) }], clock.now());
  }
  async function write<T>(fn: (user: string) => Promise<T>): Promise<Result<T, WriteError | 'label_taken'>> {
    let currentGate;
    do { currentGate = gate; await currentGate; } while (currentGate !== gate);
    const generation = epoch;
    try {
      const user = requireUser();
      const value = await db.transaction('rw', db.tables, async () => {
        if (generation !== epoch || remote.currentUserId() !== user) throw new WriteFailure('no_open_session');
        const result = await fn(user);
        if (generation !== epoch || remote.currentUserId() !== user) throw new WriteFailure('no_open_session');
        return result;
      });
      engine.afterWrite(); return ok(value);
    } catch (error) {
      if (error instanceof WriteFailure) return { ok: false, error: error.code };
      if (error instanceof Error && (error.name === 'QuotaExceededError' || ('inner' in error && error.inner instanceof Error && error.inner.name === 'QuotaExceededError'))) return { ok: false, error: 'storage_full' };
      throw error;
    }
  }
  // label_taken is only emitted by createExercise; narrow other write results without a type cast.
  async function ordinary<T>(fn: (user: string) => Promise<T>): Promise<Result<T, WriteError>> {
    const result = await write(fn);
    if (result.ok) return result;
    return { ok: false, error: result.error === 'label_taken' ? 'world_record' : result.error };
  }
  async function noted<T>(fn: (user: string) => Promise<{ value: T; notice: EditNotice }>): Promise<Result<T, WriteError> & { notice?: EditNotice }> {
    const result = await write(fn);
    if (!result.ok) return { ok: false, error: result.error === 'label_taken' ? 'world_record' : result.error };
    return { ok: true, value: result.value.value, notice: result.value.notice };
  }
  async function ownedSession(id: string, user: string, open = false): Promise<Session> {
    const row = await db.sessions.get(id);
    if (!row || row.user_id !== user || !active(row) || (open && row.ended_at !== null)) throw new WriteFailure('no_open_session');
    return row;
  }
  async function openSession(user: string): Promise<Session | undefined> {
    return db.sessions.filter((row) => row.user_id === user && active(row) && row.ended_at === null).first();
  }
  async function visibleUsers(): Promise<Set<string>> {
    const user = remote.currentUserId();
    if (!user) return new Set();
    const memberships = await db.crew_members.toArray();
    const crews = new Set(memberships.filter((member) => member.user_id === user && member.left_at === null).map((member) => member.crew_id));
    return new Set([user, ...memberships.filter((member) => member.left_at === null && crews.has(member.crew_id)).map((member) => member.user_id)]);
  }
  async function read<T>(fn: () => Promise<T>): Promise<T> {
    for (;;) {
      const generation = epoch; const currentGate = gate;
      await currentGate;
      if (generation !== epoch || currentGate !== gate) continue;
      const result = await fn();
      if (generation === epoch) return result;
    }
  }
  async function rpc<T, E extends string>(fn: (valid: () => boolean) => Promise<Result<T, E>>): Promise<Result<T, E | 'network'>> {
    let currentGate;
    do { currentGate = gate; await currentGate; } while (currentGate !== gate);
    const generation = epoch; const user = remote.currentUserId();
    const valid = () => !closed && generation === epoch && user !== null && remote.currentUserId() === user;
    if (!valid()) return { ok: false, error: 'network' };
    const result = await fn(valid);
    return valid() ? result : { ok: false, error: 'network' };
  }
  async function range<T extends SyncFields>(table: Table<T, string>, user: string, from: string, to: string): Promise<T[]> {
    if (!(await visibleUsers()).has(user)) return [];
    return table.filter((row) => row.user_id === user && active(row) && row.local_date >= from && row.local_date <= to).toArray();
  }
  function cap(limit: number): number {
    return Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 0;
  }
  const q: RepoQueries = {
    me: () => read(async () => { const user = remote.currentUserId(); return user ? db.profiles.get(user) : undefined; }),
    profiles: (ids) => read(async () => { const users = await visibleUsers(); return (await db.profiles.bulkGet(ids.filter((id) => users.has(id)))).filter((row) => row !== undefined); }),
    myCrew: () => read(async () => {
      const membership = await db.crew_members.where('user_id').equals(remote.currentUserId() ?? '').filter((row) => row.left_at === null).first();
      if (!membership) return undefined;
      const crew = await db.crews.get(membership.crew_id);
      if (!crew) return undefined;
      const members = (await db.crew_members.filter((row) => row.crew_id === crew.id && row.left_at === null).toArray()).sort((a, b) => a.joined_at.localeCompare(b.joined_at));
      return { crew, members };
    }),
    exercises: () => read(async () => { const users = await visibleUsers(); return db.exercises.filter((row) => active(row) && (row.owner_id === null || users.has(row.owner_id))).sortBy('name'); }),
    recentExercises: (limit) => read(async () => {
      const rows = (await db.sets.filter((row) => row.user_id === remote.currentUserId() && active(row)).toArray()).sort((a, b) => b.logged_at.localeCompare(a.logged_at));
      const ids = [...new Set(rows.map((row) => row.exercise_id))].slice(0, Math.max(0, limit));
      const visible = new Map((await q.exercises()).map((row) => [row.id, row]));
      return ids.flatMap((id) => visible.has(id) ? [visible.get(id)!] : []);
    }),
    openSession: () => read(async () => { const user = remote.currentUserId(); return user ? openSession(user) : undefined; }),
    session: (id) => read(async () => { const row = await db.sessions.get(id); return row && active(row) && (await visibleUsers()).has(row.user_id) ? row : undefined; }),
    setsOfSession: (id) => read(async () => {
      if (!await q.session(id)) return [];
      return (await db.sets.where('session_id').equals(id).filter(active).toArray()).sort((a, b) => a.set_index - b.set_index);
    }),
    lastSessionSummary: (user) => read(async () => {
      if (!(await visibleUsers()).has(user)) return undefined;
      const session = (await db.sessions.filter((row) => row.user_id === user && active(row)).toArray()).sort((a, b) => b.started_at.localeCompare(a.started_at))[0];
      return session ? { session, sets: await q.setsOfSession(session.id) } : undefined;
    }),
    entriesBetween: (user, from, to) => read(async () => {
      const [sessions, sets, cardio, martial, min] = await Promise.all([
        range(db.sessions, user, from, to), range(db.sets, user, from, to), range(db.cardio_entries, user, from, to), range(db.martial_entries, user, from, to), range(db.min_entries, user, from, to),
      ]);
      const profile = await db.profiles.get(user);
      const bodyweight = user === remote.currentUserId() || profile?.show_bodyweight ? await range(db.bodyweight_entries, user, from, to) : [];
      return { sessions, sets, cardio, martial, min, bodyweight };
    }),
    crewFeed: (limit) => read(async () => {
      const users = await visibleUsers(); users.delete(remote.currentUserId() ?? '');
      const exercises = new Map((await q.exercises()).map((exercise) => [exercise.id, exercise]));
      const items: FeedItem[] = [];
      for (const user of users) {
        const entries = await q.entriesBetween(user, '0000-01-01', '9999-12-31');
        for (const row of entries.sets) { const exercise = exercises.get(row.exercise_id); if (exercise) items.push({ type: 'set', row, exercise }); }
        items.push(...entries.cardio.map((row) => ({ type: 'run' as const, row })), ...entries.martial.map((row) => ({ type: 'martial' as const, row })), ...entries.min.map((row) => ({ type: 'min' as const, row })), ...entries.bodyweight.map((row) => ({ type: 'weight' as const, row })));
      }
      const time = (item: FeedItem) => item.type === 'weight' ? item.row.measured_at : item.row.logged_at;
      return items.sort((a, b) => time(b).localeCompare(time(a))).slice(0, Math.max(0, limit));
    }),
    isPending: (id) => read(() => isPending(db, id)),
    deadLetters: () => read(async () => (await db.outbox.where('status').equals('dead').toArray()).flatMap((entry) => entry.seq === undefined ? [] : [{ seq: entry.seq, table: entry.table, row_id: entry.row_id, last_error: entry.last_error ?? '', created_at: entry.created_at }])),
    exerciseHistory: (exerciseId, limitSessions) => read(async () => {
      const user = remote.currentUserId();
      const limit = cap(limitSessions);
      if (!user || limit === 0) return [];
      const sets = await db.sets.filter((row) => row.user_id === user && row.exercise_id === exerciseId && active(row)).toArray();
      const bySession = new Map<string, SetRow[]>();
      for (const set of sets) {
        const list = bySession.get(set.session_id);
        if (list) list.push(set);
        else bySession.set(set.session_id, [set]);
      }
      const sessions = (await db.sessions.bulkGet([...bySession.keys()])).filter((row): row is Session => !!row && row.user_id === user && active(row));
      sessions.sort((a, b) => b.started_at.localeCompare(a.started_at) || b.id.localeCompare(a.id));
      return sessions.slice(0, limit).map((session): SessionWithSets => ({
        session,
        sets: (bySession.get(session.id) ?? []).sort((a, b) => a.set_index - b.set_index || a.id.localeCompare(b.id)),
      }));
    }),
    recentSessionsWithSets: (limit) => read(async () => {
      const user = remote.currentUserId();
      const count = cap(limit);
      if (!user || count === 0) return [];
      const sessions = (await db.sessions.filter((row) => row.user_id === user && active(row) && row.kind === 'gym' && row.ended_at !== null).toArray())
        .sort((a, b) => b.started_at.localeCompare(a.started_at) || b.id.localeCompare(a.id))
        .slice(0, count);
      const result: SessionWithSets[] = [];
      for (const session of sessions) {
        const sets = (await db.sets.where('session_id').equals(session.id).filter(active).toArray())
          .sort((a, b) => a.set_index - b.set_index || a.id.localeCompare(b.id));
        result.push({ session, sets });
      }
      return result;
    }),
    unseenPartnerPrs: () => read(async () => {
      const user = remote.currentUserId();
      if (!user) return [];
      const users = await visibleUsers();
      users.delete(user);
      const rows = await db.mirror('pr_events').filter((row) =>
        !row.deleted_at && users.has(String(row.user_id))).toArray();
      return rows.flatMap((row) => {
        const parsed = prEventSchema.safeParse(row);
        return parsed.success && !parsed.data.seen_by.includes(user) ? [parsed.data] : [];
      }).sort((a, b) => b.client_updated_at.localeCompare(a.client_updated_at) || b.id.localeCompare(a.id));
    }),
    prEvents: (filter) => read(async () => {
      const user = remote.currentUserId();
      if (!user) return [];
      let sourceIds: Set<string> | undefined;
      if (filter.sessionId) {
        const session = await db.sessions.get(filter.sessionId);
        if (!session || session.user_id !== user) return [];
        const [sets, cardio] = await Promise.all([
          db.sets.where('session_id').equals(filter.sessionId).toArray(),
          db.cardio_entries.where('session_id').equals(filter.sessionId).toArray(),
        ]);
        sourceIds = new Set([...sets, ...cardio].map((row) => row.id));
      }
      const rows = await db.mirror('pr_events').where('user_id').equals(user).filter((row) => {
        if (row.deleted_at) return false;
        if (filter.exerciseId && row.exercise_id !== filter.exerciseId) return false;
        if (filter.since && String(row.local_date) < filter.since) return false;
        if (sourceIds && !sourceIds.has(String(row.source_id))) return false;
        return true;
      }).toArray();
      const events: PrEvent[] = [];
      for (const row of rows) {
        const parsed = prEventSchema.safeParse({ seen_by: [], ...row });
        if (parsed.success) events.push(parsed.data);
      }
      events.sort((a, b) => b.local_date.localeCompare(a.local_date) || b.client_updated_at.localeCompare(a.client_updated_at) || b.id.localeCompare(a.id));
      return events;
    }),
    exercisePref: (exerciseId) => read(async () => {
      const user = remote.currentUserId();
      if (!user) return undefined;
      const row = await db.mirror('exercise_prefs').where('[user_id+exercise_id]').equals([user, exerciseId]).first();
      if (!row || row.deleted_at) return undefined;
      const parsed = exercisePrefSchema.safeParse(row);
      return parsed.success ? parsed.data : undefined;
    }),
    day: (date) => read(async () => {
      const user = remote.currentUserId();
      if (!user) return { sessions: [], sets: [], cardio: [], martial: [], min: [], bodyweight: [] };
      const entries = await q.entriesBetween(user, date, date);
      return {
        sessions: [...entries.sessions].sort((a, b) => a.started_at.localeCompare(b.started_at) || a.id.localeCompare(b.id)),
        sets: [...entries.sets].sort((a, b) => a.logged_at.localeCompare(b.logged_at) || a.set_index - b.set_index || a.id.localeCompare(b.id)),
        cardio: [...entries.cardio].sort((a, b) => a.logged_at.localeCompare(b.logged_at) || a.id.localeCompare(b.id)),
        martial: [...entries.martial].sort((a, b) => a.logged_at.localeCompare(b.logged_at) || a.id.localeCompare(b.id)),
        min: [...entries.min].sort((a, b) => a.logged_at.localeCompare(b.logged_at) || a.id.localeCompare(b.id)),
        bodyweight: [...entries.bodyweight].sort((a, b) => a.measured_at.localeCompare(b.measured_at) || a.id.localeCompare(b.id)),
      };
    }),
  };

  async function weekIsClosed(dates: readonly string[]): Promise<boolean> {
    const user = remote.currentUserId();
    if (!user) return false;
    const membership = await db.crew_members.where('user_id').equals(user).filter((row) => row.left_at === null).first();
    if (!membership) return false;
    for (const date of dates) {
      if (!date) continue;
      const row = await db.table('crew_weeks').get([membership.crew_id, weekStartOf(date)]);
      if (row) return true;
    }
    return false;
  }
  function noticeFor(prsChanged: boolean, dates: readonly string[]): Promise<EditNotice> {
    return weekIsClosed(dates).then((barAdjusted) => ({ prsChanged, barAdjusted }));
  }
  function overlay<T extends { id?: string }>(rows: readonly T[], pending: readonly Mutation[], table: SyncedTable): T[] {
    const map = new Map<string, T>();
    for (const row of rows) if (row.id) map.set(row.id, row);
    for (const mutation of pending) {
      if (mutation.table !== table || typeof mutation.row.id !== 'string') continue;
      const previous = map.get(mutation.row.id);
      map.set(mutation.row.id, { ...(previous ?? {}), ...mutation.row } as T);
    }
    return [...map.values()];
  }
  async function historyFor(user: string, pending: readonly Mutation[]): Promise<PrHistory> {
    const [sessions, sets, cardio, bodyweights, exercises] = await Promise.all([
      db.sessions.filter((row) => row.user_id === user).toArray(),
      db.sets.filter((row) => row.user_id === user).toArray(),
      db.cardio_entries.filter((row) => row.user_id === user).toArray(),
      db.bodyweight_entries.filter((row) => row.user_id === user).toArray(),
      db.exercises.toArray(),
    ]);
    return {
      sessions: overlay(sessions, pending, 'sessions'),
      sets: overlay(sets, pending, 'sets'),
      cardio: overlay(cardio, pending, 'cardio_entries'),
      bodyweights: overlay(bodyweights, pending, 'bodyweight_entries'),
      exercises,
    };
  }
  function sameNumber(left: number | null, right: number | null): boolean {
    if (left == null || right == null) return left === right;
    return Math.abs(left - right) <= 0.000001;
  }
  function holds(row: { [key: string]: unknown }, draft: PrEventDraft): boolean {
    const reps = row.reps == null ? null : Number(row.reps);
    const previous = row.previous_value == null ? null : Number(row.previous_value);
    const pct = row.pct_over_previous == null ? null : Number(row.pct_over_previous);
    return row.source_id === draft.source_id
      && row.pr_type === draft.pr_type
      && (row.exercise_id ?? null) === draft.exercise_id
      && reps === draft.reps
      && sameNumber(Number(row.value), draft.value)
      && sameNumber(previous, draft.previous_value)
      && sameNumber(pct, draft.pct_over_previous)
      && row.local_date === draft.local_date
      && row.user_id === draft.user_id;
  }
  function inPrScope(exercise: unknown, prType: unknown, exerciseId: string | null): boolean {
    if (exerciseId === null) return exercise == null && (prType === 'distance' || prType === 'pace');
    return exercise === exerciseId && (prType === 'e1rm' || prType === 'rep_max' || prType === 'volume');
  }
  /** Tombstones and inserts for one exercise, or for every run when `exerciseId` is null. */
  async function planPrs(user: string, exerciseId: string | null, now: string, pending: readonly Mutation[]): Promise<{ mutations: Mutation[]; changed: boolean }> {
    const history = await historyFor(user, pending);
    if (exerciseId === null) history.sets = [];
    else {
      history.sets = history.sets.filter((set) => set.exercise_id === exerciseId);
      history.cardio = [];
    }
    const drafts = standingPrs(history).filter((draft) => inPrScope(draft.exercise_id, draft.pr_type, exerciseId));
    const stored = overlay(await db.mirror('pr_events').where('user_id').equals(user).toArray(), pending, 'pr_events')
      .filter((row) => !row.deleted_at && row.user_id === user && inPrScope(row.exercise_id, row.pr_type, exerciseId));
    const used = new Set<string>();
    const fresh: PrEventDraft[] = [];
    for (const draft of drafts) {
      const match = stored.find((row) => typeof row.id === 'string' && !used.has(row.id) && holds(row, draft));
      if (match && typeof match.id === 'string') used.add(match.id);
      else fresh.push(draft);
    }
    const mutations: Mutation[] = [];
    let dropped = false;
    for (const row of stored) {
      if (typeof row.id !== 'string' || used.has(row.id)) continue;
      const queued = db.outbox.where('[table+row_id]').equals(['pr_events', row.id]);
      // Local inserts have no server-generated updated_at. Coalescing one into
      // a tombstone would INSERT an invalid claim against the edited source.
      if (row.updated_at == null && await queued.filter((entry) => entry.status === 'pending').count() > 0) {
        await db.outbox.where('[table+row_id]').equals(['pr_events', row.id]).delete();
        await db.mirror('pr_events').delete(row.id);
        dropped = true;
      } else {
        // 0007 accepts an unchanged claim on UPDATE, with only deleted_at set.
        mutations.push({ table: 'pr_events', row: { ...row, deleted_at: now } });
      }
    }
    for (const draft of fresh) {
      if (draft.user_id !== user) throw new WriteFailure('world_record');
      const row = validate(prEventSchema, {
        id: newId(), user_id: user, exercise_id: draft.exercise_id, source_id: draft.source_id,
        pr_type: draft.pr_type, reps: draft.reps, value: draft.value, previous_value: draft.previous_value,
        pct_over_previous: draft.pct_over_previous, seen_by: [], local_date: draft.local_date,
        client_updated_at: now, deleted_at: null,
      });
      mutations.push({ table: 'pr_events', row: asRemote(row) });
    }
    const already = pending.some((mutation) => mutation.table === 'pr_events' && inPrScope(mutation.row.exercise_id, mutation.row.pr_type, exerciseId));
    return { mutations, changed: dropped || already || mutations.length > 0 };
  }
  async function deletionMutations(table: Parameters<RepoWrites['softDelete']>[0], id: string, deleted: boolean, user: string): Promise<{ mutations: Mutation[]; now: string; localDate: string }> {
    const row = await db.mirror(table).get(id);
    if (!row || row.user_id !== user) throw new WriteFailure('no_open_session');
    const now = clock.now();
    const mutations: Mutation[] = [{ table, row: { ...row, deleted_at: deleted ? now : null, client_updated_at: now } }];
    return { mutations, now, localDate: typeof row.local_date === 'string' ? row.local_date : '' };
  }
  async function deletion(table: Parameters<RepoWrites['softDelete']>[0], id: string, deleted: boolean, user: string): Promise<void> {
    const built = await deletionMutations(table, id, deleted, user);
    await attachPrs(user, table, id, built.now, built.mutations);
    await enqueue(db, built.mutations, built.now);
    if (table === 'sessions' && deleted) await db.meta.delete('active_session_id');
  }
  async function recomputeInto(user: string, exerciseId: string | null, now: string, mutations: Mutation[]): Promise<boolean> {
    const plan = await planPrs(user, exerciseId, now, mutations);
    mutations.push(...plan.mutations);
    return plan.changed;
  }
  async function attachPrs(user: string, table: Parameters<RepoWrites['softDelete']>[0], id: string, now: string, mutations: Mutation[]): Promise<boolean> {
    if (table === 'cardio_entries') return recomputeInto(user, null, now, mutations);
    if (table !== 'sets') return false;
    const row = mutations.find((mutation) => mutation.table === 'sets' && mutation.row.id === id);
    return typeof row?.row.exercise_id === 'string' ? recomputeInto(user, row.row.exercise_id, now, mutations) : false;
  }
  async function syncActive(session: Session): Promise<void> {
    if (session.ended_at !== null) {
      const active = await db.meta.get('active_session_id');
      if (active?.value === session.id) await db.meta.delete('active_session_id');
      return;
    }
    await db.meta.put({ key: 'active_session_id', value: session.id });
  }
  /** Session edit plus child date moves. Children keep `client_updated_at` (propagate_session_local_date). */
  async function planSession(session: Session, patch: SessionPatch, user: string, now: string): Promise<{ next: Session; mutations: Mutation[] }> {
    const next = validate(sessionSchema, { ...session, ...patch, id: session.id, user_id: user, client_updated_at: now });
    if (next.ended_at === null && session.ended_at !== null) {
      const open = await openSession(user);
      if (open && open.id !== session.id) throw new WriteFailure('session_already_open');
    }
    const mutations: Mutation[] = [{ table: 'sessions', row: asRemote(next) }];
    if (next.local_date !== session.local_date) {
      for (const table of SESSION_CHILDREN) {
        const children = await db.mirror(table).where('session_id').equals(session.id).toArray();
        for (const child of children) {
          if (child.local_date === next.local_date) continue;
          mutations.push({ table, row: { ...child, local_date: next.local_date } });
        }
      }
    }
    return { next, mutations };
  }
  async function rewriteBodyweight(user: string, id: string, patch: { weight_kg?: number; measured_at?: string; local_date?: string }): Promise<BodyweightEntry> {
    const old = await db.bodyweight_entries.get(id);
    if (!old || old.user_id !== user || !active(old)) throw new WriteFailure('no_open_session');
    const now = clock.now();
    const date = patch.local_date ?? old.local_date;
    const nextId = bodyweightId(user, date);
    const measured = patch.measured_at ?? old.measured_at;
    const weight = patch.weight_kg ?? old.weight_kg;
    if (nextId === old.id) {
      const row = validate(bodyweightFormSchema, { ...old, id: old.id, user_id: user, weight_kg: weight, measured_at: measured, local_date: date, client_updated_at: now, deleted_at: null });
      await save('bodyweight_entries', row);
      return row;
    }
    const occupant = await db.bodyweight_entries.get(nextId);
    if (occupant && occupant.user_id !== user) throw new WriteFailure('world_record');
    const row = validate(bodyweightFormSchema, {
      ...(occupant ?? {}),
      id: nextId, user_id: user, local_date: date, weight_kg: weight, measured_at: measured, client_updated_at: now, deleted_at: null,
    });
    await enqueue(db, [
      { table: 'bodyweight_entries', row: asRemote({ ...old, deleted_at: now, client_updated_at: now }) },
      { table: 'bodyweight_entries', row: asRemote(row) },
    ], now);
    return row;
  }
  const w: RepoWrites = {
    markPrEventsSeen: (ids) => rpc(async (valid) => {
      if (!environment.online()) return { ok: false, error: 'network' as const };
      const user = remote.currentUserId()!;
      const result = await remote.markPrEventsSeen(ids);
      if (!result.ok || !valid()) return { ok: false, error: 'network' as const };
      // This metadata never enters the owner's outbox or changes their claim.
      await db.transaction('rw', db.mirror('pr_events'), db.crew_members, async () => {
        const users = await visibleUsers();
        for (const id of new Set(ids)) {
          if (!valid()) return;
          const row = await db.mirror('pr_events').get(id);
          const parsed = prEventSchema.safeParse(row);
          if (parsed.success && !parsed.data.deleted_at && parsed.data.user_id !== user
            && users.has(parsed.data.user_id) && !parsed.data.seen_by.includes(user)) {
            await db.mirror('pr_events').update(id, { seen_by: [...parsed.data.seen_by, user] });
          }
        }
      });
      return ok(undefined);
    }),
    upsertMyProfile: (patch) => ordinary(async (user) => {
      const row = validate(profileFormSchema, { ...(await db.profiles.get(user) ?? defaultProfile(user, clock.timezone())), ...patch, id: user });
      await save('profiles', row); return row;
    }),
    createExercise: (input) => write(async (user) => {
      const row = validate(exerciseSchema, { ...input, id: newId(), owner_id: user, aliases: [], equipment: null, increment_kg: 2.5, rep_target: 5, client_updated_at: clock.now(), deleted_at: null });
      if (await db.exercises.filter((exercise) => exercise.owner_id === user && active(exercise) && exercise.export_label.toLowerCase() === row.export_label.toLowerCase()).count()) throw new WriteFailure('label_taken');
      if (['lift', 'bw_lift'].includes(row.kind) && await db.martial_entries.filter((entry) => entry.user_id === user && active(entry) && entry.discipline.toLowerCase() === row.export_label.toLowerCase()).count()) throw new WriteFailure('label_taken');
      await save('exercises', row); return row;
    }),
    startSession: (input) => ordinary(async (user) => {
      if (await openSession(user)) throw new WriteFailure('session_already_open');
      const row = sessionRow(user, input); await save('sessions', row);
      await db.meta.put({ key: 'active_session_id', value: row.id }); return row;
    }),
    finishSession: (id, note) => ordinary(async (user) => {
      const row = validate(sessionSchema, { ...await ownedSession(id, user, true), ended_at: clock.now(), note: note ?? null, client_updated_at: clock.now() });
      await save('sessions', row); await db.meta.delete('active_session_id'); return row;
    }),
    discardSession: (id) => ordinary(async (user) => {
      await ownedSession(id, user);
      for (const table of ['sets', 'cardio_entries', 'martial_entries', 'min_entries'] as const) {
        for (const child of await db.mirror(table).where('session_id').equals(id).toArray()) if (child.id) await deletion(table, child.id, true, user);
      }
      await deletion('sessions', id, true, user);
    }),
    logSet: (input) => ordinary(async (user) => {
      const session = await ownedSession(input.session_id, user, true);
      const exercise = await db.exercises.get(input.exercise_id);
      if (!exercise || !active(exercise) || !['lift', 'bw_lift'].includes(exercise.kind)) throw new WriteFailure('world_record');
      const siblings = await db.sets.where('session_id').equals(session.id).toArray();
      const now = clock.now();
      const row = validate(setFormSchema(exercise.kind === 'bw_lift' ? 'bw_lift' : 'lift'), { ...fields(user, now, session.local_date), ...input,
        set_index: 1 + siblings.reduce((max, set) => Math.max(max, set.set_index), 0), rpe: input.rpe ?? null, note: input.note ?? null, is_warmup: input.is_warmup ?? false, logged_at: now });
      await save('sets', row); return row;
    }),
    updateSet: (id, patch) => noted(async (user) => {
      const old = await db.sets.get(id);
      if (!old || old.user_id !== user || !active(old)) throw new WriteFailure('no_open_session');
      const exercise = await db.exercises.get(old.exercise_id);
      if (!exercise || !['lift', 'bw_lift'].includes(exercise.kind)) throw new WriteFailure('world_record');
      const now = clock.now();
      const row = validate(setFormSchema(exercise.kind === 'bw_lift' ? 'bw_lift' : 'lift'), { ...old, ...patch, id, user_id: user, client_updated_at: now });
      const mutations: Mutation[] = [{ table: 'sets', row: asRemote(row) }];
      const prsChanged = await recomputeInto(user, old.exercise_id, now, mutations);
      await enqueue(db, mutations, now);
      return { value: row, notice: await noticeFor(prsChanged, [row.local_date]) };
    }),
    logRun: (input) => ordinary(async (user) => {
      const session = sessionRow(user, { kind: 'run' }, true);
      const row: CardioEntry = validate(cardioFormSchema, { ...fields(user, session.started_at, session.local_date), ...input, session_id: session.id, activity: 'Run', rpe: input.rpe ?? null, note: input.note ?? null, logged_at: session.started_at });
      await enqueue(db, [{ table: 'sessions', row: asRemote(session) }, { table: 'cardio_entries', row: asRemote(row) }], clock.now()); return row;
    }),
    logMartial: (input) => ordinary(async (user) => {
      const labels = (await db.exercises.filter((exercise) => (exercise.owner_id === user || exercise.owner_id === null) && ['lift', 'bw_lift'].includes(exercise.kind) && active(exercise)).toArray()).map((exercise) => exercise.export_label);
      validate(disciplineInNamespaceSchema(labels), input.discipline);
      const session = sessionRow(user, { kind: 'martial' }, true);
      const row: MartialEntry = validate(martialFormSchema, { ...fields(user, session.started_at, session.local_date), ...input, session_id: session.id, rpe: input.rpe ?? null, rounds: input.rounds ?? null, note: input.note ?? null, logged_at: session.started_at });
      await enqueue(db, [{ table: 'sessions', row: asRemote(session) }, { table: 'martial_entries', row: asRemote(row) }], clock.now()); return row;
    }),
    logMin: (description) => ordinary(async (user) => {
      const session = sessionRow(user, { kind: 'min', mode: 'min' }, true);
      const row: MinEntry = validate(minEntrySchema, { ...fields(user, session.started_at, session.local_date), session_id: session.id, description: description ?? (await db.profiles.get(user))?.min_default_label ?? '20m walk', duration_min: null, logged_at: session.started_at });
      await enqueue(db, [{ table: 'sessions', row: asRemote(session) }, { table: 'min_entries', row: asRemote(row) }], clock.now()); return row;
    }),
    logBodyweight: (kg) => ordinary(async (user) => {
      const now = clock.now(); const date = localDateIn(clock.timezone(), now);
      const row: BodyweightEntry = validate(bodyweightFormSchema, { ...fields(user, now, date), id: bodyweightId(user, date), weight_kg: kg, measured_at: now });
      await save('bodyweight_entries', row); return row;
    }),
    softDelete: (table, id) => noted(async (user) => {
      const built = await deletionMutations(table, id, true, user);
      const prsChanged = await attachPrs(user, table, id, built.now, built.mutations);
      await enqueue(db, built.mutations, built.now);
      if (table === 'sessions') await db.meta.delete('active_session_id');
      return { value: undefined, notice: await noticeFor(prsChanged, [built.localDate]) };
    }),
    restore: (table, id) => noted(async (user) => {
      const built = await deletionMutations(table, id, false, user);
      const prsChanged = await attachPrs(user, table, id, built.now, built.mutations);
      await enqueue(db, built.mutations, built.now);
      return { value: undefined, notice: await noticeFor(prsChanged, [built.localDate]) };
    }),
    recordPrEvents: (rows) => ordinary(async (user) => {
      const now = clock.now();
      const saved: PrEvent[] = [];
      const mutations: Mutation[] = [];
      for (const draft of rows) {
        if (draft.user_id !== user) throw new WriteFailure('world_record');
        if (draft.exercise_id) {
          const exercise = await db.exercises.get(draft.exercise_id);
          const users = await visibleUsers();
          if (!exercise || !active(exercise) || (exercise.owner_id !== null && !users.has(exercise.owner_id))) throw new WriteFailure('world_record');
        }
        const row = validate(prEventSchema, {
          id: newId(), user_id: user, exercise_id: draft.exercise_id, source_id: draft.source_id,
          pr_type: draft.pr_type, reps: draft.reps, value: draft.value, previous_value: draft.previous_value,
          pct_over_previous: draft.pct_over_previous, seen_by: [], local_date: draft.local_date,
          client_updated_at: now, deleted_at: null,
        });
        mutations.push({ table: 'pr_events', row: asRemote(row) });
        saved.push(row);
      }
      if (mutations.length > 0) await enqueue(db, mutations, now);
      return saved;
    }),
    recomputePrs: (exerciseId) => ordinary(async (user) => {
      const now = clock.now();
      const plan = await planPrs(user, exerciseId, now, []);
      if (plan.mutations.length > 0) await enqueue(db, plan.mutations, now);
      return { changed: plan.changed };
    }),
    setExercisePref: (exerciseId, patch) => ordinary(async (user) => {
      const exercise = await db.exercises.get(exerciseId);
      const users = await visibleUsers();
      if (!exercise || !active(exercise) || (exercise.owner_id !== null && !users.has(exercise.owner_id))) throw new WriteFailure('world_record');
      const now = clock.now();
      const existing = await db.mirror('exercise_prefs').where('[user_id+exercise_id]').equals([user, exerciseId]).first();
      const row: ExercisePref = validate(exercisePrefSchema, {
        ...(existing ?? {}),
        id: typeof existing?.id === 'string' ? existing.id : exercisePrefId(user, exerciseId),
        user_id: user, exercise_id: exerciseId, rest_s: patch.rest_s,
        local_date: localDateIn(clock.timezone(), now), client_updated_at: now, deleted_at: null,
      });
      await save('exercise_prefs', row);
      return row;
    }),
    updateSession: (id, patch) => noted(async (user) => {
      const session = await ownedSession(id, user);
      const now = clock.now();
      const planned = await planSession(session, patch, user, now);
      const mutations = planned.mutations;
      let prsChanged = false;
      if (planned.next.local_date !== session.local_date) {
        const exerciseIds = new Set((await db.sets.where('session_id').equals(session.id).toArray()).map((set) => set.exercise_id));
        const runs = (await db.cardio_entries.where('session_id').equals(session.id).filter(active).count()) > 0;
        for (const exerciseId of exerciseIds) prsChanged = await recomputeInto(user, exerciseId, now, mutations) || prsChanged;
        if (runs) prsChanged = await recomputeInto(user, null, now, mutations) || prsChanged;
      }
      await enqueue(db, mutations, now);
      await syncActive(planned.next);
      return { value: planned.next, notice: await noticeFor(prsChanged, [session.local_date, planned.next.local_date]) };
    }),
    updateEntry: (async (table, id, patch) => {
      if (table === 'bodyweight_entries') return noted(async (user) => {
        const before = await db.bodyweight_entries.get(id);
        const row = await rewriteBodyweight(user, id, patch);
        return { value: row, notice: await noticeFor(false, [before?.local_date ?? '', row.local_date]) };
      });
      return noted(async (user) => {
        const old = await db.mirror(table).get(id);
        if (!old || old.user_id !== user || !active(old as { deleted_at?: string | null })) throw new WriteFailure('no_open_session');
        const now = clock.now();
        const mutations: Mutation[] = [];
        let localDate = String(old.local_date);
        const nextDate = 'local_date' in patch ? patch.local_date : undefined;
        if (nextDate && nextDate !== localDate) {
          const session = await ownedSession(String(old.session_id), user);
          const planned = await planSession(session, { local_date: nextDate }, user, now);
          mutations.push(...planned.mutations);
          localDate = planned.next.local_date;
          await syncActive(planned.next);
        }
        const merged = { ...old, ...patch, id, user_id: user, local_date: localDate, client_updated_at: now, deleted_at: null };
        if (table === 'martial_entries') {
          const labels = (await db.exercises.filter((exercise) => (exercise.owner_id === user || exercise.owner_id === null) && ['lift', 'bw_lift'].includes(exercise.kind) && active(exercise)).toArray()).map((exercise) => exercise.export_label);
          validate(disciplineInNamespaceSchema(labels), String(merged.discipline));
        }
        const row = table === 'cardio_entries' ? validate(cardioFormSchema, merged)
          : table === 'martial_entries' ? validate(martialFormSchema, merged)
          : validate(minEntrySchema, merged);
        mutations.push({ table, row: asRemote(row) });
        const prsChanged = table === 'cardio_entries' ? await recomputeInto(user, null, now, mutations) : false;
        await enqueue(db, mutations, now);
        return { value: row, notice: await noticeFor(prsChanged, [String(old.local_date), localDate]) };
      });
    }) as RepoWrites['updateEntry'],
  };

  // Publish only after the local transaction commits. Presence failure must
  // never delay/reject an offline write or leave a session marked active.
  const startSession = w.startSession;
  w.startSession = async (input) => {
    const result = await startSession(input);
    if (result.ok) duo.activity(result.value.id);
    return result;
  };
  const logSet = w.logSet;
  w.logSet = async (input) => {
    const result = await logSet(input);
    if (result.ok) duo.activity(result.value.session_id, result.value.exercise_id);
    return result;
  };
  const finishSession = w.finishSession;
  w.finishSession = async (id, note) => {
    const result = await finishSession(id, note);
    if (result.ok) duo.finish(id);
    return result;
  };
  const discardSession = w.discardSession;
  w.discardSession = async (id) => {
    const result = await discardSession(id);
    if (result.ok) duo.finish(id);
    return result;
  };

  async function closeStaleSession(user: string, generation: number): Promise<void> {
    await db.transaction('rw', db.tables, async () => {
      if (closed || generation !== epoch) return;
      const session = await openSession(user);
      if (!session) return;
      const sets = await db.sets.where('session_id').equals(session.id).toArray();
      const last = sets.reduce((latest, set) => set.logged_at > latest ? set.logged_at : latest, session.started_at);
      if (Date.parse(clock.now()) - Date.parse(last) >= 3 * 60 * 60 * 1000) {
        await save('sessions', { ...session, ended_at: new Date(Date.parse(last) + 5 * 60 * 1000).toISOString(), client_updated_at: clock.now() });
        await db.meta.delete('active_session_id');
      } else await db.meta.put({ key: 'active_session_id', value: session.id });
    });
  }
  // Network bootstrap follows the local gate. Failures stay inside this task.
  async function bootstrapNetwork(user: string | null, generation: number): Promise<void> {
    try {
      if (closed || generation !== epoch) return;
      await engine.pullNow();
      if (closed || generation !== epoch || !user || remote.currentUserId() !== user) return;
      const profile = await db.profiles.get(user);
      if (!profile || profile.tz === clock.timezone()) return;
      await db.transaction('rw', db.tables, async () => {
        if (closed || generation !== epoch || remote.currentUserId() !== user) return;
        const current = await db.profiles.get(user);
        if (current && current.tz !== clock.timezone()) await save('profiles', { ...current, tz: clock.timezone() });
      });
    } catch {
      // A cold or hung server must not reject startup or leave an unhandled rejection.
    }
  }
  function armNetwork(user: string | null, generation: number, local: Promise<void>): void {
    void local.then(() => {
      if (!closed && generation === epoch) return bootstrapNetwork(user, generation);
    }).catch(() => {});
  }
  async function initialize(user: string | null, generation: number): Promise<void> {
    const offset = (await db.meta.get('clock_offset_ms'))?.value;
    if (typeof offset === 'number') clock.restoreOffset(offset);
    const previous = (await db.meta.get('my_user_id'))?.value;
    if (user !== null && previous != null && previous !== user) await db.clearAccount();
    if (closed || generation !== epoch) return;
    if (user) await db.meta.put({ key: 'my_user_id', value: user });
    if (closed || generation !== epoch) return;
    if (user) await closeStaleSession(user, generation);
    if (closed || generation !== epoch) return;
    await engine.refresh();
  }
  const initialUser = remote.currentUserId();
  const initialGeneration = epoch;
  gate = initialize(initialUser, initialGeneration);
  armNetwork(initialUser, initialGeneration, gate);
  const unsubscribeAuth = remote.onAuthChange((user) => {
    duo.stop();
    const generation = ++epoch; engine.invalidate();
    const local = gate.catch(() => {}).then(() => initialize(user, generation));
    gate = local.then(() => {
      if (!closed && generation === epoch) {
        if (realtimeEnabled) duo.start();
        for (const cb of authListeners) cb(user);
        if (options.autoStart !== false) engine.afterWrite();
      }
    });
    armNetwork(user, generation, local);
  });
  const ready = gate.then(() => { if (!closed) { if (realtimeEnabled) duo.start(); if (options.autoStart !== false) engine.start(); } });
  const repo: ManagedRepo = {
    backend: remote.kind, ready,
    duo: { ...duo.api, useSpot: (week) => rpc(async (valid) => {
      await engine.flushNow();
      return valid() ? duo.api.useSpot(week) : { ok: false, error: 'network' as const };
    }) },
    close() { closed = true; epoch++; duo.close(); unsubscribeAuth(); engine.close(); authListeners.clear(); if (!options.db) db.close(); },
    auth: {
      userId: () => remote.currentUserId(),
      onChange(cb) { authListeners.add(cb); return () => { authListeners.delete(cb); }; },
      sendCode: (email) => remote.sendCode(email),
      async verifyCode(email, code) { const result = await remote.verifyCode(email, code); await gate; return result; },
      async signOut() { await remote.signOut(); await gate; },
      async deleteAccount() {
        await gate;
        const actor = remote.currentUserId();
        if (closed || !actor || !environment.online()) return { ok: false, error: 'network' };
        const result = await remote.deleteAccount();
        if (!result.ok) return result;
        await gate;
        // Never erase a different account that signed in during deletion.
        if (remote.currentUserId() === null) {
          epoch++; engine.invalidate();
          await db.transaction('rw', db.tables, async () => {
            if (remote.currentUserId() === null && (await db.meta.get('my_user_id'))?.value === actor) {
              await db.clearAccount();
            }
          });
          await engine.refresh();
        }
        return result;
      },
    }, q, w,
    sync: {
      status: () => engine.status(), onStatus: (cb) => engine.onStatus(cb),
      async flushNow() { await gate; await engine.flushNow(); },
      async pullNow() { await gate; await engine.pullNow(); },
      async retryDead(seq) { await gate; await db.outbox.update(seq, { status: 'pending', last_error: null, revision: newId() }); engine.afterWrite(); },
      async discardDead(seq) { await gate; const row = await db.outbox.get(seq); if (row?.status === 'dead') await db.outbox.delete(seq); await engine.refresh(); },
    },
    crew: {
      create: (name) => rpc(async (valid) => {
        const result = await remote.createCrew(name, clock.timezone());
        if (!valid()) return { ok: false, error: 'network' as const };
        if (!result.ok) return { ok: false, error: result.error === 'invalid_timezone' ? 'network' : result.error };
        await engine.pullNow(); const crew = await db.crews.get(result.value); return crew ? ok(crew) : { ok: false, error: 'network' };
      }),
      createInvite: () => rpc(async (valid) => { const mine = await q.myCrew(); if (!valid()) return { ok: false, error: 'network' as const }; return mine ? remote.createInvite(mine.crew.id) : { ok: false, error: 'not_crew_owner' as const }; }),
      redeem: (code) => rpc(async (valid) => { const result = await remote.redeemInvite(code); if (!valid()) return { ok: false, error: 'network' as const }; if (!result.ok) return result; await engine.pullNow(); const crew = await db.crews.get(result.value); return crew ? ok(crew) : { ok: false, error: 'network' as const }; }),
      leave: () => rpc(async (valid) => {
        const user = remote.currentUserId()!;
        const mine = await q.myCrew(); if (!mine) return ok(undefined);
        if (!valid()) return { ok: false, error: 'network' as const };
        const result = await remote.leaveCrew(mine.crew.id);
        if (result.ok) await db.transaction('rw', db.crew_members, async () => {
          if (valid()) await db.crew_members.update([mine.crew.id, user], { left_at: clock.now() });
        });
        return result;
      }),
    },
    exportTokens: { createToken: (label) => rpc(() => remote.createExportToken(label)), revokeToken: (id) => rpc(() => remote.revokeExportToken(id)), listTokens: () => rpc(() => remote.listExportTokens()), setFormat: (format) => w.upsertMyProfile({ export_format: format }) },
  };
  return repo;
}
