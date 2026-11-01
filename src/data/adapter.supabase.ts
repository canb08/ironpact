import type { SupabaseClient } from '@supabase/supabase-js';
import type { ExportTokenMeta, PulledTable, Result, SyncedTable } from '../core/types.ts';
import type { RedeemError, Remote, RemoteRow, RemoteWriteError } from './adapter.ts';
import { rowKey, SNAPSHOT_TABLES, SNAPSHOT_TIMESTAMP } from './db.ts';
import { compareInstant } from './clock.ts';
import { getSupabaseClient } from './supabase.ts';

const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
const network = { ok: false, error: 'network' } as const;
const immutable = new Set<SyncedTable>(['exercise_muscles', 'reactions', 'challenges']);
const snapshotKeys: Partial<Record<PulledTable, readonly string[]>> = {
  exercise_muscles: ['exercise_id', 'muscle'], crew_members: ['crew_id', 'user_id'],
  crew_weeks: ['crew_id', 'week_start'], challenge_participants: ['challenge_id', 'user_id'],
};
// PostgREST quoted values: cursor text must never introduce filter operators.
const quoted = (value: string) => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const project = (table: PulledTable, row: RemoteRow): RemoteRow => SNAPSHOT_TABLES.has(table)
  ? { ...row, updated_at: SNAPSHOT_TIMESTAMP } : row;
const clientError = (message: string, status = 409) => ({
  ok: false as const, error: { kind: 'client' as const, status, message },
});
function writeError(status: number | null, message: string): { ok: false; error: RemoteWriteError } {
  // 429 is retriable, never a permanently invalid outbox row.
  return { ok: false, error: status !== null && status >= 400 && status < 500 && status !== 429
    ? { kind: 'client', status, message } : { kind: 'transient', status, message } };
}
function sameValue(a: unknown, b: unknown): boolean {
  if (typeof a === 'string' && typeof b === 'string'
      && /^\d{4}-\d\d-\d\dT/.test(a) && /^\d{4}-\d\d-\d\dT/.test(b)) return compareInstant(a, b) === 0;
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Optional client injection isolates real-stack tests without a second browser singleton. */
export function createSupabaseRemote(suppliedClient?: SupabaseClient): Remote {
  let userId: string | null = null;
  const listeners = new Set<(id: string | null) => void>();
  const publish = (id: string | null) => {
    if (id === userId) return;
    userId = id;
    for (const listener of listeners) listener(id);
  };
  const ready = (async () => {
    const client = suppliedClient ?? await getSupabaseClient();
    let authChanged = false;
    // Never await another auth operation inside Supabase's auth callback/lock.
    client.auth.onAuthStateChange((_event, session) => {
      authChanged = true;
      publish(session?.user.id ?? null);
    });
    // An expired session may fail to refresh while offline. Keep the client
    // usable so a later auth event or sign-in can recover without a reload.
    const { data } = await client.auth.getSession();
    if (!authChanged) publish(data.session?.user.id ?? null);
    return client;
  })();
  // Auth restoration may fail while offline; public operations classify that failure.
  void ready.catch(() => {});

  async function rpc<T, E extends string>(name: string, args: Record<string, unknown>, errors: readonly E[]): Promise<Result<T, E | 'network'>> {
    try {
      const { data, error } = await (await ready).rpc(name, args).retry(false);
      if (error) return { ok: false, error: errors.find((value) => value === error.message) ?? 'network' };
      return ok(data as T);
    } catch { return network; }
  }

  async function fetchRows(table: SyncedTable, ids: string[]): Promise<Result<RemoteRow[], 'network'>> {
    try {
      const client = await ready;
      const output: RemoteRow[] = [];
      for (let start = 0; start < ids.length; start += 100) {
        const batch = ids.slice(start, start + 100);
        let query = client.from(table).select('*').retry(false);
        if (table === 'exercise_muscles') {
          const keys = batch.map((id) => JSON.parse(id) as unknown);
          if (keys.some((key) => !Array.isArray(key) || key.length !== 2 || key.some((part) => typeof part !== 'string'))) return network;
          query = query.or(keys.map((key) => {
            const [exercise, muscle] = key as string[];
            return `and(exercise_id.eq.${quoted(exercise!)},muscle.eq.${quoted(muscle!)})`;
          }).join(','));
        } else query = query.in('id', batch);
        const { data, error } = await query.returns<RemoteRow[]>();
        if (error || data === null) return network;
        output.push(...data.map((row) => project(table, row)));
      }
      return ok(output);
    } catch { return network; }
  }

  async function immutableOwner(client: SupabaseClient, table: SyncedTable, row: RemoteRow): Promise<boolean> {
    if (!userId) return false;
    if (table !== 'exercise_muscles') return row[table === 'challenges' ? 'created_by' : 'user_id'] === userId;
    const { data, error } = await client.from('exercises').select('owner_id').eq('id', row.exercise_id).retry(false).maybeSingle<{ owner_id: string | null }>();
    return !error && data?.owner_id === userId;
  }

  return {
    kind: 'supabase', currentUserId: () => userId,
    onAuthChange(cb) { listeners.add(cb); return () => { listeners.delete(cb); }; },
    async sendCode(email) {
      try {
        const { error } = await (await ready).auth.signInWithOtp({ email });
        if (!error) return ok(undefined);
        return { ok: false, error: error.status === 429 ? 'rate_limited'
          : error.code === 'email_address_invalid' || error.code === 'validation_failed' ? 'invalid_email' : 'network' };
      } catch { return network; }
    },
    async verifyCode(email, code) {
      if (!/^\d{6}$/.test(code)) return { ok: false, error: 'bad_code' };
      try {
        const { data, error } = await (await ready).auth.verifyOtp({ email, token: code, type: 'email' });
        if (error) return { ok: false, error: error.code === 'otp_expired' ? 'expired'
          : error.status !== undefined && error.status >= 400 && error.status < 500 && error.status !== 429 ? 'bad_code' : 'network' };
        if (!data.user || !data.session) return network;
        publish(data.user.id);
        return ok(data.user.id);
      } catch { return network; }
    },
    async signOut() {
      const { error } = await (await ready).auth.signOut();
      if (error) throw new Error('Sign-out failed');
      publish(null);
    },
    async serverNow() {
      const result = await rpc<string, never>('server_now', {}, []);
      if (!result.ok || !Number.isFinite(Date.parse(result.value))) throw new Error('Server clock unavailable');
      return result.value;
    },
    async upsert(table, input) {
      if (!input.length) return ok([]);
      if (input.length > 100) return clientError('Batch exceeds 100 rows', 400);
      try {
        const client = await ready;
        // Virtual snapshot metadata is never a SQL column.
        const rows = input.map((row) => {
          const copy = { ...row };
          if (SNAPSHOT_TABLES.has(table)) { delete copy.updated_at; delete copy.id; }
          return copy;
        });
        if (!immutable.has(table)) {
          const { data, error, status } = await client.from(table)
            .upsert(rows, { onConflict: 'id', ignoreDuplicates: false }).select('*').retry(false).returns<RemoteRow[]>();
          if (error) return writeError(status || null, error.message);
          return data === null ? writeError(null, 'Missing write acknowledgement') : ok(data);
        }
        const ids = rows.map((row) => rowKey(table, row));
        const before = await fetchRows(table, ids);
        if (!before.ok) return writeError(null, 'Canonical read failed');
        const canonical = new Map(before.value.map((row) => [rowKey(table, row), row]));
        const matches = async (row: RemoteRow, existing: RemoteRow) => await immutableOwner(client, table, existing)
          && Object.entries(row).every(([key, value]) => ['updated_at', 'created_at', 'received_at'].includes(key) || sameValue(value, existing[key]));
        for (const row of rows) {
          const existing = canonical.get(rowKey(table, row));
          if (existing && !await matches(row, existing)) return clientError('Immutable row differs or is not owned');
        }
        const missing = rows.filter((row) => !canonical.has(rowKey(table, row)));
        if (missing.length) {
          const { error, status } = await client.from(table).upsert(missing, {
            onConflict: table === 'exercise_muscles' ? 'exercise_id,muscle' : 'id', ignoreDuplicates: true,
          }).retry(false);
          if (error) return writeError(status || null, error.message);
        }
        // A concurrent insert may have won. Never acknowledge an invisible,
        // foreign-owned or different row merely because ON CONFLICT ignored it.
        const fetched = await fetchRows(table, ids);
        if (!fetched.ok) return writeError(null, 'Canonical read failed');
        const saved = new Map(fetched.value.map((row) => [rowKey(table, row), row]));
        for (const row of rows) {
          const existing = saved.get(rowKey(table, row));
          if (!existing || !await matches(row, existing)) return clientError('Immutable row differs or is not owned');
        }
        return ok(fetched.value);
      } catch { return writeError(null, 'Write unavailable'); }
    },
    async pullPage(table, after, limit) {
      const size = Math.max(0, Math.min(1000, Math.floor(limit)));
      if (!size) return ok([]);
      try {
        const client = await ready;
        if (!SNAPSHOT_TABLES.has(table)) {
          let query = client.from(table).select('*').order('updated_at').order('id').limit(size).retry(false);
          if (after) query = after.id === '' ? query.gte('updated_at', after.updated_at)
            : query.or(`updated_at.gt.${quoted(after.updated_at)},and(updated_at.eq.${quoted(after.updated_at)},id.gt.${quoted(after.id)})`);
          const { data, error } = await query.returns<RemoteRow[]>();
          return error || data === null ? network : ok(data);
        }
        // SQL enum order (muscle_t) differs from the JSON identity order used
        // by A6. Scan the complete snapshot by SQL keys, then project/sort it.
        // Continue through short pages too: the API may impose a lower row cap.
        const columns = snapshotKeys[table] ?? ['id'];
        const all: RemoteRow[] = [];
        let last: RemoteRow | undefined;
        for (;;) {
          let query = client.from(table).select('*').limit(1000).retry(false);
          for (const column of columns) query = query.order(column);
          if (last) {
            const previous = last;
            query = query.or(columns.map((column, index) => {
              const terms = columns.slice(0, index).map((key) => `${key}.eq.${quoted(String(previous[key]))}`);
              terms.push(`${column}.gt.${quoted(String(previous[column]))}`);
              return terms.length === 1 ? terms[0]! : `and(${terms.join(',')})`;
            }).join(','));
          }
          const { data, error } = await query.returns<RemoteRow[]>();
          if (error || data === null) return network;
          if (!data.length) break;
          const end = data[data.length - 1]!;
          if (last && rowKey(table, last) === rowKey(table, end)) return network;
          all.push(...data);
          last = end;
        }
        const keyed = all.map((row) => ({ row, id: rowKey(table, row) }));
        keyed.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
        return ok(keyed.filter(({ id }) => !after || after.updated_at < SNAPSHOT_TIMESTAMP
          || (after.updated_at === SNAPSHOT_TIMESTAMP && id > after.id)).slice(0, size).map(({ row }) => project(table, row)));
      } catch { return network; }
    },
    fetchByIds: fetchRows,
    createCrew: (name, tz) => rpc('create_crew', { name, tz }, ['already_in_crew', 'invalid_timezone']),
    createInvite: (crewId) => rpc('create_invite', { crew_id: crewId }, ['not_crew_owner']),
    async redeemInvite(code) {
      const result = await rpc<{ crew_id: string | null; error: string | null }, never>('redeem_invite', { code }, []);
      if (!result.ok || !result.value) return network;
      const { crew_id, error } = result.value;
      const errors: readonly RedeemError[] = ['code_dead', 'crew_full', 'slow_down', 'already_in_crew'];
      if (error !== null) return { ok: false, error: errors.find((value) => value === error) ?? 'network' };
      return typeof crew_id === 'string' ? ok(crew_id) : network;
    },
    leaveCrew: (crewId) => rpc('leave_crew', { crew_id: crewId }, []).then((result) => result.ok ? ok(undefined) : result),
    createExportToken: (label) => rpc('create_export_token', { label }, ['token_limit']),
    revokeExportToken: (id) => rpc('revoke_export_token', { id }, []).then((result) => result.ok ? ok(undefined) : result),
    listExportTokens: () => rpc<ExportTokenMeta[], never>('list_export_tokens', {}, []),
  };
}
