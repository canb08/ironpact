import type { Table } from 'dexie';
import type { z } from 'zod';
import type { BodyweightEntry, CardioEntry, MartialEntry, MinEntry, Result, Session, SyncedTable, SyncFields } from '../core/types.ts';
import { bodyweightFormSchema, cardioFormSchema, disciplineInNamespaceSchema, exerciseSchema, martialFormSchema, minEntrySchema, profileFormSchema, sessionSchema, setFormSchema } from '../core/validate.ts';
import type { FeedItem, Repo, RepoQueries, RepoWrites, StartSessionInput, WriteError } from './adapter.ts';
import { compareInstant, createClock, localDateIn, type Clock } from './clock.ts';
import { asRemote, IronpactDB } from './db.ts';
import { defaultProfile } from './defaults.ts';
import { bodyweightId, newId } from './ids.ts';
import { enqueue, isPending, type Mutation } from './outbox.ts';
import type { Remote } from './adapter.ts';
import { browserEnvironment, SyncEngine, type SyncEnvironment } from './sync.ts';

export interface DataRepoOptions { db?: IronpactDB; clock?: Clock; environment?: SyncEnvironment; autoStart?: boolean }
export interface ManagedRepo extends Repo { ready: Promise<void>; close(): void }
class WriteFailure extends Error { constructor(readonly code: WriteError | 'label_taken') { super(code); } }
const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
const active = (row: { deleted_at?: string | null }) => !row.deleted_at;

export function createDataRepo(remote: Remote, options: DataRepoOptions = {}): ManagedRepo {
  const db = options.db ?? new IronpactDB();
  const clock = options.clock ?? createClock();
  const environment = options.environment ?? browserEnvironment();
  const engine = new SyncEngine(db, remote, clock, environment);
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
  };

  async function deletion(table: Parameters<RepoWrites['softDelete']>[0], id: string, deleted: boolean, user: string): Promise<void> {
    const row = await db.mirror(table).get(id);
    if (!row || row.user_id !== user) throw new WriteFailure('no_open_session');
    const now = clock.now();
    const mutations: Mutation[] = [{ table, row: { ...row, deleted_at: deleted ? now : null, client_updated_at: now } }];
    if ((table === 'sets' || table === 'cardio_entries') && deleted) {
      const prs = await db.mirror('pr_events').where('source_id').equals(id).toArray();
      mutations.push(...prs.filter((pr) => pr.user_id === user).map((pr) => ({ table: 'pr_events' as const, row: { ...pr, deleted_at: now, client_updated_at: typeof pr.client_updated_at === 'string' && compareInstant(pr.client_updated_at, now) > 0 ? pr.client_updated_at : now } })));
    }
    await enqueue(db, mutations, now);
    if (table === 'sessions' && deleted) await db.meta.delete('active_session_id');
  }
  const w: RepoWrites = {
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
    updateSet: (id, patch) => ordinary(async (user) => {
      const old = await db.sets.get(id);
      if (!old || old.user_id !== user || !active(old)) throw new WriteFailure('no_open_session');
      const exercise = await db.exercises.get(old.exercise_id);
      if (!exercise || !['lift', 'bw_lift'].includes(exercise.kind)) throw new WriteFailure('world_record');
      const row = validate(setFormSchema(exercise.kind === 'bw_lift' ? 'bw_lift' : 'lift'), { ...old, ...patch, id, user_id: user, client_updated_at: clock.now() });
      await save('sets', row); return row;
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
    softDelete: (table, id) => ordinary((user) => deletion(table, id, true, user)),
    restore: (table, id) => ordinary((user) => deletion(table, id, false, user)),
  };

  async function initialize(user: string | null, generation: number): Promise<void> {
    const offset = (await db.meta.get('clock_offset_ms'))?.value;
    if (typeof offset === 'number') clock.restoreOffset(offset);
    const previous = (await db.meta.get('my_user_id'))?.value;
    if (previous !== user) await db.clearAccount();
    if (closed || generation !== epoch) return;
    if (user) await db.meta.put({ key: 'my_user_id', value: user });
    await engine.pullNow();
    if (closed || generation !== epoch || !user) return;
    await db.transaction('rw', db.tables, async () => {
      const profile = await db.profiles.get(user);
      if (profile && profile.tz !== clock.timezone()) await save('profiles', { ...profile, tz: clock.timezone() });
      const session = await openSession(user);
      if (!session) return;
      const sets = await db.sets.where('session_id').equals(session.id).toArray();
      const last = sets.reduce((latest, set) => set.logged_at > latest ? set.logged_at : latest, session.started_at);
      if (Date.parse(clock.now()) - Date.parse(last) >= 3 * 60 * 60 * 1000) {
        await save('sessions', { ...session, ended_at: new Date(Date.parse(last) + 5 * 60 * 1000).toISOString(), client_updated_at: clock.now() });
        await db.meta.delete('active_session_id');
      } else await db.meta.put({ key: 'active_session_id', value: session.id });
    });
    await engine.refresh();
  }
  gate = initialize(remote.currentUserId(), epoch);
  const unsubscribeAuth = remote.onAuthChange((user) => {
    const generation = ++epoch; engine.invalidate();
    gate = gate.catch(() => {}).then(() => initialize(user, generation)).then(() => {
      if (!closed && generation === epoch) {
        for (const cb of authListeners) cb(user);
        if (options.autoStart !== false) engine.afterWrite();
      }
    });
  });
  const ready = gate.then(() => { if (!closed && options.autoStart !== false) engine.start(); });
  const repo: ManagedRepo = {
    backend: remote.kind, ready,
    close() { closed = true; epoch++; unsubscribeAuth(); engine.close(); authListeners.clear(); if (!options.db) db.close(); },
    auth: {
      userId: () => remote.currentUserId(),
      onChange(cb) { authListeners.add(cb); return () => { authListeners.delete(cb); }; },
      sendCode: (email) => remote.sendCode(email),
      async verifyCode(email, code) { const result = await remote.verifyCode(email, code); await gate; return result; },
      async signOut() { await remote.signOut(); await gate; },
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
