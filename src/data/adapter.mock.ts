import { PULLED_TABLES, type ExportTokenMeta, type PulledTable, type Result, type SyncedTable } from '../core/types.ts';
import { bodyweightEntrySchema, cardioEntrySchema, exerciseSchema, martialEntrySchema, minEntrySchema, profileSchema, sessionSchema, setImportSchema, syncFieldsSchema } from '../core/validate.ts';
import type { KeysetCursor, Remote, RemoteRow, RemoteWriteError } from './adapter.ts';
import { rowKey, SNAPSHOT_TABLES, SNAPSHOT_TIMESTAMP } from './db.ts';
import { defaultProfile } from './defaults.ts';
import { newId } from './ids.ts';
import { compareInstant, localDateIn } from './clock.ts';
import { compareCursor, cursorFor } from './pull.ts';
import { createMockRealtime, mockUseSpot } from './realtime.mock.ts';

export const MOCK_USER_IDS = { alice: '00000000-0000-4000-8000-000000000001', bob: '00000000-0000-4000-8000-000000000002' } as const;
export const MOCK_EXERCISE_ID = '00000000-0000-4000-8000-000000000010';
export const MOCK_CREW_ID = '00000000-0000-4000-8000-000000000020';
interface Invitation { crew: string; expires: number; used: boolean; revoked: boolean }
interface Token { user: string; meta: ExportTokenMeta }
export interface MockOptions { now?: () => number; latencyMs?: number; userId?: string | null }
export interface MockRemote extends Remote {
  failNext(n: number, kind: 'client' | 'transient'): void;
  seed(table: PulledTable, rows: RemoteRow[]): void;
  inspect(table: PulledTable): RemoteRow[];
  simulateCrewmateActivity(): Promise<void>;
}
const success = <T>(value: T): Result<T, never> => ({ ok: true, value });
const lower = (value: unknown) => typeof value === 'string' ? value.toLowerCase() : '';

export function createMockRemote(options: MockOptions = {}): MockRemote {
  const now = options.now ?? Date.now;
  const instant = () => new Date(now()).toISOString();
  let userId = options.userId === undefined ? MOCK_USER_IDS.alice : options.userId;
  const authListeners = new Set<(user: string | null) => void>();
  const tables = new Map<PulledTable, Map<string, RemoteRow>>(PULLED_TABLES.map((table) => [table, new Map()]));
  const emails = new Map<string, string>([['alice@example.test', MOCK_USER_IDS.alice], ['bob@example.test', MOCK_USER_IDS.bob]]);
  const invitations = new Map<string, Invitation>();
  const attempts = new Map<string, number[]>();
  const tokens = new Map<string, Token>();
  let failures = 0;
  let failureKind: 'client' | 'transient' = 'transient';
  const map = (table: PulledTable) => tables.get(table)!;
  const rows = (table: PulledTable) => [...map(table).values()];
  const pause = async () => { if (options.latencyMs) await new Promise<void>((resolve) => setTimeout(resolve, options.latencyMs)); };
  const member = (actor: string, crew: unknown) => rows('crew_members').some((row) => row.user_id === actor && row.crew_id === crew && row.left_at === null);
  const crewmate = (actor: string, other: unknown) => rows('crew_members').some((row) => row.user_id === other && row.left_at === null && member(actor, row.crew_id));
  function visible(table: PulledTable, row: RemoteRow, actor: string | null): boolean {
    if (!actor) return false;
    if (table === 'profiles') return row.id === actor || crewmate(actor, row.id);
    if (table === 'exercises') return row.owner_id === null || row.owner_id === actor || crewmate(actor, row.owner_id);
    if (table === 'exercise_muscles') { const exercise = map('exercises').get(String(row.exercise_id)); return !!exercise && visible('exercises', exercise, actor); }
    if (table === 'bodyweight_entries') return row.user_id === actor || (crewmate(actor, row.user_id) && map('profiles').get(String(row.user_id))?.show_bodyweight === true);
    if (table === 'crews') return member(actor, row.id);
    if (['crew_members', 'crew_weeks', 'streak_tokens', 'challenges'].includes(table)) return member(actor, row.crew_id);
    if (table === 'challenge_participants') { const challenge = map('challenges').get(String(row.challenge_id)); return !!challenge && member(actor, challenge.crew_id); }
    if (table === 'reactions') return row.user_id === actor || row.to_user === actor;
    if (table === 'nudges') return row.from_user === actor || row.to_user === actor;
    return row.user_id === actor || crewmate(actor, row.user_id);
  }
  function projection(table: PulledTable, row: RemoteRow): RemoteRow {
    // Snapshot tables have no SQL updated_at. A7 must use this same stable cursor convention.
    return structuredClone(SNAPSHOT_TABLES.has(table) ? { ...row, updated_at: SNAPSHOT_TIMESTAMP } : row);
  }
  function seed(table: PulledTable, records: RemoteRow[]): void {
    for (const row of records) map(table).set(rowKey(table, row), structuredClone({ ...row, ...(SNAPSHOT_TABLES.has(table) ? {} : { updated_at: row.updated_at ?? instant() }) }));
  }
  for (const id of Object.values(MOCK_USER_IDS)) seed('profiles', [{ ...defaultProfile(id, 'Europe/Amsterdam'), ...(id === MOCK_USER_IDS.bob ? { initial: 'B', color_hue: 220 } : {}) }]);
  seed('crews', [{ id: MOCK_CREW_ID, name: 'Crew', tz: 'Europe/Amsterdam', max_members: 8, created_by: MOCK_USER_IDS.alice }]);
  seed('crew_members', Object.values(MOCK_USER_IDS).map((id) => ({ crew_id: MOCK_CREW_ID, user_id: id, role: id === MOCK_USER_IDS.alice ? 'owner' : 'member', joined_at: instant(), left_at: null })));
  seed('exercises', [{ id: MOCK_EXERCISE_ID, owner_id: null, name: 'Bench press', export_label: 'Bench', aliases: [], kind: 'lift', category: 'compound', lower_body: false, equipment: 'barbell', increment_kg: 2.5, rep_target: 5, client_updated_at: instant(), deleted_at: null }]);
  function client(message: string): { ok: false; error: RemoteWriteError } { return { ok: false, error: { kind: 'client', status: 400, message } }; }
  function validateWrite(table: SyncedTable, row: RemoteRow, actor: string): string | null {
    const existing = map(table).get(rowKey(table, row));
    const owner = table === 'profiles' ? row.id : table === 'exercises' ? row.owner_id : table === 'challenges' ? row.created_by : row.user_id;
    const previousOwner = !existing ? actor : table === 'profiles' ? existing.id : table === 'exercises' ? existing.owner_id : table === 'challenges' ? existing.created_by : existing.user_id;
    if (table === 'exercise_muscles') {
      if (map('exercises').get(String(row.exercise_id))?.owner_id !== actor || existing) return 'ownership';
      return typeof row.muscle === 'string' && ['chest','front_delts','side_delts','rear_delts','biceps','triceps','forearms','lats','upper_back','traps','lower_back','abs','obliques','glutes','quads','hamstrings','adductors','calves'].includes(row.muscle) && [0.5, 1].includes(Number(row.weight)) ? null : 'check';
    }
    if (owner !== actor || previousOwner !== actor) return 'ownership';
    if (['reactions', 'challenges'].includes(table) && existing) return 'immutable';
    if (table === 'profiles') return profileSchema.safeParse(row).success ? null : 'check';
    if (table === 'exercises') {
      if (!exerciseSchema.safeParse(row).success) return 'check';
      if (!row.deleted_at && rows('exercises').some((other) => other.id !== row.id && other.owner_id === actor && !other.deleted_at && lower(other.export_label) === lower(row.export_label))) return 'label_taken';
      if (!row.deleted_at && ['lift', 'bw_lift'].includes(String(row.kind)) && rows('martial_entries').some((entry) => entry.user_id === actor && !entry.deleted_at && lower(entry.discipline) === lower(row.export_label))) return 'label_taken';
      return null;
    }
    if (table === 'challenges') return member(actor, row.crew_id) && row.status === 'proposed' && ['e1rm_pct','sessions','run_km','season'].includes(String(row.kind)) && typeof row.starts_on === 'string' && new Date(`${row.starts_on}T00:00:00Z`).getUTCDay() === 1 && typeof row.ends_on === 'string' && (row.stake_text == null || (typeof row.stake_text === 'string' && Array.from(row.stake_text).length <= 80)) ? null : 'check';
    if (!syncFieldsSchema.safeParse(row).success) return 'check';
    if (['sets', 'cardio_entries', 'martial_entries', 'min_entries'].includes(table)) {
      const parent = map('sessions').get(String(row.session_id));
      if (!parent) return 'session_missing';
      if (parent.user_id !== row.user_id) return 'owner_mismatch';
      row.local_date = parent.local_date;
    }
    if (table === 'sessions') return sessionSchema.safeParse(row).success ? null : 'check';
    if (table === 'sets') {
      const exercise = map('exercises').get(String(row.exercise_id));
      if (!exercise || !visible('exercises', exercise, actor)) return 'exercise_missing';
      return setImportSchema(exercise.kind === 'bw_lift' ? 'bw_lift' : 'lift').safeParse(row).success ? null : 'check';
    }
    if (table === 'cardio_entries') return cardioEntrySchema.safeParse(row).success ? null : 'check';
    if (table === 'martial_entries') {
      if (!martialEntrySchema.safeParse(row).success) return 'check';
      return rows('exercises').some((exercise) => (exercise.owner_id === actor || exercise.owner_id === null) && ['lift', 'bw_lift'].includes(String(exercise.kind)) && !exercise.deleted_at && lower(exercise.export_label) === lower(row.discipline)) ? 'label_taken' : null;
    }
    if (table === 'min_entries') return minEntrySchema.safeParse(row).success ? null : 'check';
    if (table === 'bodyweight_entries') return bodyweightEntrySchema.safeParse(row).success ? null : 'check';
    if (table === 'exercise_prefs') return map('exercises').has(String(row.exercise_id)) && Number.isInteger(row.rest_s) && Number(row.rest_s) >= 15 && Number(row.rest_s) <= 600 && !rows(table).some((other) => other.id !== row.id && other.user_id === actor && other.exercise_id === row.exercise_id) ? null : 'check';
    if (table === 'pr_events') return ['e1rm','rep_max','volume','distance','pace'].includes(String(row.pr_type)) && typeof row.source_id === 'string' && typeof row.value === 'number' && Number.isFinite(row.value) && (row.exercise_id == null || map('exercises').has(String(row.exercise_id))) ? null : 'check';
    if (table === 'reactions') return member(actor, row.crew_id) && typeof row.to_user === 'string' && member(row.to_user, row.crew_id) && ['set','session','pr_event'].includes(String(row.target_type)) && ['light_weight','clean','again','chalk'].includes(String(row.kind)) && !rows(table).some((other) => other.user_id === actor && other.target_id === row.target_id && other.kind === row.kind) ? null : 'check';
    if (table === 'goals') return ['weekly_sessions','e1rm','bodyweight','run_distance'].includes(String(row.kind)) && typeof row.target_value === 'number' && Number.isFinite(row.target_value) && typeof row.unit === 'string' && typeof row.starts_on === 'string' && (row.exercise_id == null || map('exercises').has(String(row.exercise_id))) ? null : 'check';
    return null;
  }
  const remote: MockRemote = {
    async useSpot(weekStart) {
      const actor = userId; await pause();
      if (actor !== userId) return { ok: false, error: 'network' };
      return mockUseSpot(actor, weekStart, instant(), rows, seed);
    },
    async subscribeCrew(crewId, callbacks) {
      const actor = userId;
      if (!actor || !member(actor, crewId)) throw new Error('Realtime requires crew membership');
      return createMockRealtime(tables, crewId, callbacks, () => JSON.stringify(
        PULLED_TABLES.map((table) => rows(table).filter((row) => actor === userId && visible(table, row, actor)))));
    },
    kind: 'mock', currentUserId: () => userId,
    onAuthChange(cb) { authListeners.add(cb); return () => { authListeners.delete(cb); }; },
    async sendCode(email) { await pause(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? success(undefined) : { ok: false, error: 'invalid_email' }; },
    async verifyCode(email, code) {
      await pause(); if (!/^\d{6}$/.test(code) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'bad_code' };
      const normalized = email.trim().toLowerCase();
      let id = emails.get(normalized);
      if (!id) { id = newId(); emails.set(normalized, id); seed('profiles', [{ ...defaultProfile(id, 'Europe/Amsterdam') }]); }
      userId = id; for (const cb of authListeners) cb(userId); return success(userId);
    },
    async signOut() { userId = null; for (const cb of authListeners) cb(null); },
    async deleteAccount() {
      const actor = userId; await pause();
      if (!actor || actor !== userId) return { ok: false, error: 'network' };
      const ownedCrews = new Set(rows('crews').filter((row) => row.created_by === actor).map((row) => row.id));
      const exercises = new Set(rows('exercises').filter((row) => row.owner_id === actor).map((row) => row.id));
      const challenges = new Set(rows('challenges').filter((row) => row.created_by === actor).map((row) => row.id));
      for (const [table, records] of tables) for (const [key, row] of records) {
        if (row.user_id === actor || row.to_user === actor || row.from_user === actor
            || row.covers_user_id === actor || (table === 'profiles' && row.id === actor)
            || (table === 'challenges' && row.created_by === actor)
            || (table === 'challenge_participants' && challenges.has(String(row.challenge_id)))
            || (table === 'exercise_muscles' && exercises.has(String(row.exercise_id)))) {
          records.delete(key); continue;
        }
        if (table === 'crews' && row.created_by === actor) row.created_by = null;
        if (row.winner_user_id === actor) row.winner_user_id = null;
        if (Array.isArray(row.seen_by)) row.seen_by = row.seen_by.filter((id) => id !== actor);
        if (table === 'crew_weeks' && row.statuses && typeof row.statuses === 'object') {
          const statuses = row.statuses as Record<string, { spotted_by?: string | null }>;
          delete statuses[actor];
          for (const status of Object.values(statuses)) if (status.spotted_by === actor) status.spotted_by = null;
        }
      }
      for (const id of exercises) {
        const referenced = ['sets', 'pr_events', 'exercise_prefs', 'goals', 'challenges'].some((table) =>
          rows(table as PulledTable).some((row) => row.exercise_id === id));
        if (!referenced) map('exercises').delete(String(id));
        else {
          const row = map('exercises').get(String(id))!;
          Object.assign(row, { owner_id: null, name: 'Deleted exercise', export_label: 'Deleted exercise',
            aliases: [], equipment: null, deleted_at: instant(), updated_at: instant() });
        }
      }
      for (const [code, invitation] of invitations) if (ownedCrews.has(invitation.crew)) invitations.delete(code);
      for (const [id, token] of tokens) if (token.user === actor) tokens.delete(id);
      for (const [email, id] of emails) if (id === actor) emails.delete(email);
      attempts.delete(actor);
      userId = null;
      for (const cb of authListeners) cb(null);
      return success(undefined);
    },
    async serverNow() { await pause(); return instant(); },
    async upsert(table, input) {
      const actor = userId; await pause();
      if (!actor || userId !== actor) return client('unauthenticated');
      if (input.length > 100) return client('batch_limit');
      if (failures > 0) { failures--; return { ok: false, error: { kind: failureKind, status: failureKind === 'client' ? 400 : 503, message: 'simulated failure' } }; }
      const records = structuredClone(input);
      // Stage the entire statement, including uniqueness checks against earlier rows; rollback on error.
      const backup = structuredClone(map(table));
      const output: RemoteRow[] = [];
      try {
        for (const row of records) {
          const key = rowKey(table, row);
          const existing = map(table).get(key);
          if (existing && ['exercise_muscles', 'reactions', 'challenges'].includes(table)) {
            const owner = table === 'exercise_muscles' ? map('exercises').get(String(existing.exercise_id))?.owner_id : table === 'challenges' ? existing.created_by : existing.user_id;
            const fields = Object.keys(row).filter((field) => !['updated_at', 'created_at', 'received_at'].includes(field));
            if (owner === actor && fields.every((field) => JSON.stringify(existing[field]) === JSON.stringify(row[field]))) { output.push(projection(table, existing)); continue; }
            tables.set(table, backup); return client('immutable');
          }
          // SQL's LWW BEFORE trigger skips stale updates before row checks/child triggers.
          if (existing && typeof existing.client_updated_at === 'string' && typeof row.client_updated_at === 'string' && compareInstant(row.client_updated_at, existing.client_updated_at) < 0) {
            const ownerField = table === 'exercises' ? 'owner_id' : 'user_id';
            if (row[ownerField] !== actor || existing[ownerField] !== actor) { tables.set(table, backup); return client('ownership'); }
            output.push(projection(table, existing)); continue;
          }
          const error = validateWrite(table, row, actor);
          if (error) { tables.set(table, backup); return client(error); }
          const saved: RemoteRow = table === 'exercise_muscles' ? { exercise_id: row.exercise_id, muscle: row.muscle, weight: row.weight } : { ...row, updated_at: instant(), created_at: existing?.created_at ?? row.created_at ?? instant() };
          map(table).set(key, saved); output.push(projection(table, saved));
        }
      } catch { tables.set(table, backup); return client('invalid_row'); }
      for (const row of records) {
        const saved = map(table).get(rowKey(table, row));
        if (table === 'sessions' && saved) {
          for (const childTable of ['sets','cardio_entries','martial_entries','min_entries'] as const) for (const child of rows(childTable)) if (child.session_id === saved.id && child.local_date !== saved.local_date) seed(childTable, [{ ...child, local_date: saved.local_date, updated_at: instant() }]);
        }
        if ((table === 'sets' || table === 'cardio_entries') && saved?.deleted_at) for (const pr of rows('pr_events')) if (pr.source_id === saved.id && !pr.deleted_at) seed('pr_events', [{ ...pr, deleted_at: saved.deleted_at, client_updated_at: typeof pr.client_updated_at === 'string' && typeof saved.client_updated_at === 'string' && compareInstant(pr.client_updated_at, saved.client_updated_at) > 0 ? pr.client_updated_at : saved.client_updated_at, updated_at: instant() }]);
      }
      return success(output);
    },
    async pullPage(table, after: KeysetCursor | null, limit) {
      const actor = userId; await pause();
      if (actor !== userId) return { ok: false, error: 'network' };
      const page = rows(table).filter((row) => visible(table, row, actor)).map((row) => projection(table, row))
        .sort((a, b) => compareCursor(cursorFor(table, a), cursorFor(table, b)))
        .filter((row) => !after || compareCursor(cursorFor(table, row), after) > 0).slice(0, Math.max(0, Math.min(1000, limit)));
      return success(page);
    },
    async fetchByIds(table, ids) { const actor = userId; await pause(); if (actor !== userId) return { ok: false, error: 'network' }; return success(ids.flatMap((id) => { const row = map(table).get(id); return row && visible(table, row, actor) ? [projection(table, row)] : []; })); },
    async createCrew(name, tz) {
      const actor = userId; await pause(); if (!userId || actor !== userId) return { ok: false, error: 'network' };
      if (rows('crew_members').some((row) => row.user_id === userId && row.left_at === null)) return { ok: false, error: 'already_in_crew' };
      try { new Intl.DateTimeFormat('en', { timeZone: tz }).format(); } catch { return { ok: false, error: 'invalid_timezone' }; }
      if (!name.length || Array.from(name).length > 24) return { ok: false, error: 'network' };
      const id = newId(); seed('crews', [{ id, name, tz, max_members: 8, created_by: userId }]);
      seed('crew_members', [{ crew_id: id, user_id: userId, role: 'owner', joined_at: instant(), left_at: null }]); return success(id);
    },
    async createInvite(crewId) {
      const actor = userId; await pause(); if (actor !== userId) return { ok: false, error: 'network' };
      if (!userId || !rows('crew_members').some((row) => row.crew_id === crewId && row.user_id === userId && row.role === 'owner' && row.left_at === null)) return { ok: false, error: 'not_crew_owner' };
      for (const invite of invitations.values()) if (invite.crew === crewId && !invite.used) invite.revoked = true;
      const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
      const code = [...crypto.getRandomValues(new Uint8Array(10))].map((byte) => alphabet[byte & 31]).join('');
      invitations.set(code, { crew: crewId, expires: now() + 7 * 86400_000, used: false, revoked: false }); return success(code);
    },
    async redeemInvite(code) {
      const actor = userId; await pause(); if (!userId || actor !== userId) return { ok: false, error: 'network' };
      const recent = (attempts.get(userId) ?? []).filter((at) => at > now() - 3600_000);
      attempts.set(userId, recent); if (recent.length >= 10) return { ok: false, error: 'slow_down' };
      const normalized = code.toUpperCase().replace(/[- ]/g, '').replace(/[IL]/g, '1').replace(/O/g, '0');
      const invite = invitations.get(normalized);
      const fail = (error: 'code_dead' | 'already_in_crew' | 'crew_full') => { recent.push(now()); return { ok: false as const, error }; };
      if (!invite || invite.used || invite.revoked || invite.expires <= now()) return fail('code_dead');
      if (rows('crew_members').some((row) => row.user_id === userId && row.left_at === null)) return fail('already_in_crew');
      if (rows('crew_members').filter((row) => row.crew_id === invite.crew && row.left_at === null).length >= Number(map('crews').get(invite.crew)?.max_members ?? 0)) return fail('crew_full');
      const old = map('crew_members').get(JSON.stringify([invite.crew, userId]));
      seed('crew_members', [{ crew_id: invite.crew, user_id: userId, role: old?.role ?? 'member', joined_at: old?.joined_at ?? instant(), left_at: null }]); invite.used = true;
      return success(invite.crew);
    },
    async leaveCrew(crewId) { const actor = userId; await pause(); if (!userId || actor !== userId) return { ok: false, error: 'network' }; const key = JSON.stringify([crewId, userId]); const row = map('crew_members').get(key); if (row && row.left_at === null) seed('crew_members', [{ ...row, left_at: instant() }]); return success(undefined); },
    async createExportToken(label) {
      const actor = userId; await pause(); if (!userId || actor !== userId || Array.from(label).length > 32) return { ok: false, error: 'network' };
      if ([...tokens.values()].filter((token) => token.user === userId && token.meta.revoked_at === null).length >= 3) return { ok: false, error: 'token_limit' };
      const plain = 'spx_' + btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const id = newId(); tokens.set(id, { user: userId, meta: { id, label, created_at: instant(), last_used_at: null, revoked_at: null } }); return success(plain);
    },
    async revokeExportToken(id) { const actor = userId; await pause(); if (!userId || actor !== userId) return { ok: false, error: 'network' }; const token = tokens.get(id); if (token?.user === userId && !token.meta.revoked_at) token.meta.revoked_at = instant(); return success(undefined); },
    async listExportTokens() { const actor = userId; await pause(); if (!userId || actor !== userId) return { ok: false, error: 'network' }; return success(structuredClone([...tokens.values()].filter((token) => token.user === userId).map((token) => token.meta).sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id)))); },
    failNext(n, kind) { failures = Math.max(0, n); failureKind = kind; }, seed,
    inspect: (table) => structuredClone(rows(table)),
    async simulateCrewmateActivity() {
      const actor = userId;
      const partner = Object.values(MOCK_USER_IDS).find((id) => id !== actor && actor && crewmate(actor, id));
      if (!partner) return;
      const at = instant(); const date = localDateIn('Europe/Amsterdam', at); const sessionId = newId();
      const common = { user_id: partner, local_date: date, client_updated_at: at, updated_at: at, deleted_at: null };
      seed('sessions', [{ ...common, id: sessionId, kind: 'gym', mode: 'full', started_at: at, ended_at: at, tz: 'Europe/Amsterdam', readiness: null, together_id: null, note: null }]);
      seed('sets', [{ ...common, id: newId(), session_id: sessionId, exercise_id: MOCK_EXERCISE_ID, set_index: 1, reps: 5, weight_kg: 80, rpe: 8, is_warmup: false, note: null, logged_at: at }]);
    },
  };
  return remote;
}
