import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2.118.0';
import type { ExportInput, ExportExercise } from '../_shared/export-format.ts';

export interface TokenRow {
  id: string;
  user_id: string;
  window_start: string;
  window_count: number;
}

export interface ExportStore {
  findToken(hash: string): Promise<TokenRow | null>;
  consumeToken(token: TokenRow, now: () => number): Promise<TokenRow | null>;
  loadExport(userId: string, since: string | null): Promise<{ input: ExportInput; format: unknown }>;
  markUsed(token: TokenRow, at: string): Promise<boolean>;
}

const TOKEN_COLUMNS = 'id,user_id,window_start,window_count';

function requireToken(row: TokenRow): TokenRow {
  if (!Number.isSafeInteger(row.window_count) || row.window_count < 0 || !Number.isFinite(Date.parse(row.window_start))) {
    throw new Error('Invalid rate window');
  }
  return row;
}

// Keyset pagination deliberately continues after short pages. This also works
// when the API's row limit is smaller than our requested page size.
async function readRows<Row extends { id: string }>(
  client: SupabaseClient, table: string, columns: string, userId: string, since: string | null,
): Promise<Row[]> {
  const rows: Row[] = [];
  let after: string | null = null;
  for (;;) {
    let query = client.from(table).select(columns).eq('user_id', userId).is('deleted_at', null)
      .order('id', { ascending: true }).range(0, 499);
    if (since !== null) query = query.gte('local_date', since);
    if (after !== null) query = query.gt('id', after);
    const { data, error } = await query.returns<Row[]>();
    if (error || data === null) throw new Error('Export query failed');
    if (data.length === 0) return rows;
    rows.push(...data);
    const last = data[data.length - 1]!;
    if (last.id === after) throw new Error('Pagination did not advance');
    after = last.id;
  }
}

export function createExportStore(url: string, key: string): ExportStore {
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  return {
    async findToken(hash) {
      const { data, error } = await client.from('export_tokens').select(TOKEN_COLUMNS)
        .eq('token_hash', hash).is('revoked_at', null).maybeSingle<TokenRow>();
      if (error) throw new Error('Token lookup failed');
      return data === null ? null : requireToken(data);
    },
    async consumeToken(token, now) {
      let current = requireToken(token);
      // Approved A5 exception: compare-and-swap substitutes for a new SQL RPC.
      // Both window fields are compared, including the original timestamp text
      // (no precision-losing Date round trip). Lost races re-read and retry.
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const at = now();
        const expired = Date.parse(current.window_start) < at - 3_600_000;
        const { data, error } = await client.from('export_tokens').update({
          window_start: expired ? new Date(at).toISOString() : current.window_start,
          window_count: expired ? 1 : current.window_count + 1,
        }).eq('id', token.id).eq('user_id', token.user_id).is('revoked_at', null)
          .eq('window_start', current.window_start).eq('window_count', current.window_count)
          .select(TOKEN_COLUMNS).maybeSingle<TokenRow>();
        if (error) throw new Error('Rate update failed');
        if (data !== null) return requireToken(data);
        const next = await client.from('export_tokens').select(TOKEN_COLUMNS)
          .eq('id', token.id).eq('user_id', token.user_id).is('revoked_at', null).maybeSingle<TokenRow>();
        if (next.error) throw new Error('Rate reload failed');
        if (next.data === null) return null;
        current = requireToken(next.data);
      }
      // Never serve an uncounted request after sustained contention.
      throw new Error('Rate update contention');
    },
    async loadExport(userId, since) {
      const profile = await client.from('profiles').select('tz,export_format').eq('id', userId)
        .maybeSingle<{ tz: string; export_format: unknown }>();
      if (profile.error) throw new Error('Profile query failed');
      const [sessions, sets, cardio, martial, bodyweight, min] = await Promise.all([
        readRows<ExportInput['sessions'][number]>(client, 'sessions', 'id,user_id,kind,mode,started_at,local_date,note', userId, since),
        readRows<NonNullable<ExportInput['sets']>[number]>(client, 'sets', 'id,user_id,session_id,exercise_id,set_index,reps,weight_kg,rpe,is_warmup,note,logged_at', userId, since),
        readRows<NonNullable<ExportInput['cardio_entries']>[number]>(client, 'cardio_entries', 'id,user_id,session_id,distance_m,duration_s,rpe,note,logged_at', userId, since),
        readRows<NonNullable<ExportInput['martial_entries']>[number]>(client, 'martial_entries', 'id,user_id,session_id,discipline,duration_min,rpe,note,logged_at', userId, since),
        readRows<NonNullable<ExportInput['bodyweight_entries']>[number]>(client, 'bodyweight_entries', 'id,user_id,weight_kg,measured_at,local_date', userId, since),
        readRows<NonNullable<ExportInput['min_entries']>[number]>(client, 'min_entries', 'id,user_id,session_id,local_date,description,logged_at', userId, since),
      ]);
      const ids = [...new Set(sets.map(row => row.exercise_id))];
      const exercises: ExportExercise[] = [];
      for (let start = 0; start < ids.length; start += 100) {
        // Include referenced soft-deleted exercises: labels remain meaningful.
        // Continue even after short pages under a lower server-side row cap.
        let after: string | null = null;
        for (;;) {
          let query = client.from('exercises').select('id,export_label,kind').in('id', ids.slice(start, start + 100))
            .order('id', { ascending: true }).range(0, 99);
          if (after !== null) query = query.gt('id', after);
          const { data, error } = await query.returns<ExportExercise[]>();
          if (error || data === null) throw new Error('Exercise query failed');
          if (data.length === 0) break;
          exercises.push(...data);
          after = data[data.length - 1]!.id;
        }
      }
      return {
        input: { user_id: userId, tz: profile.data?.tz ?? 'Europe/Amsterdam', exercises, sessions,
          sets, cardio_entries: cardio, martial_entries: martial, bodyweight_entries: bodyweight, min_entries: min },
        format: profile.data?.export_format ?? 'lines',
      };
    },
    async markUsed(token, at) {
      const { data, error } = await client.from('export_tokens').update({ last_used_at: at })
        .eq('id', token.id).eq('user_id', token.user_id).is('revoked_at', null).select('id').maybeSingle<{ id: string }>();
      if (error) throw new Error('Last-use update failed');
      return data !== null;
    },
  };
}
