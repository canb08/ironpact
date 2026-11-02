/* global Deno */
declare global {
  interface ImportMeta { vitest?: { test: { skip(name: string, fn: () => void): void } } }
}

// Real Auth, Edge Function, SQL and export integration runs in CI's db job.
if (import.meta.vitest) {
  import.meta.vitest.test.skip('P5D Deno integration requires local Supabase', () => {});
} else {
  const sdkSpecifier = 'npm:@supabase/supabase-js@2.118.0';
  const { createClient } = await import(sdkSpecifier) as typeof import('npm:@supabase/supabase-js@2.118.0');
  const assert: (value: unknown, message: string) => asserts value = (value, message) => {
    if (!value) throw new Error(message);
  };
  const env = (name: string) => { const value = Deno.env.get(name); assert(value, `Missing ${name}`); return value; };
  const api = env('SUPABASE_URL');
  const database = new URL(env('DB_URL'));
  for (const url of [new URL(api), database]) {
    assert(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), 'Local stack required');
  }
  const service = env('SUPABASE_SERVICE_ROLE_KEY');
  const anon = env('SUPABASE_ANON_KEY');
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient(api, service, options);
  const sql = async (query: string): Promise<string> => {
    const child = new Deno.Command('psql', {
      args: ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], stdin: 'piped', stdout: 'piped', stderr: 'piped',
      env: { PGHOST: database.hostname, PGPORT: database.port, PGDATABASE: database.pathname.slice(1),
        PGUSER: decodeURIComponent(database.username), PGPASSWORD: decodeURIComponent(database.password) },
    }).spawn();
    const writer = child.stdin.getWriter();
    await writer.write(new TextEncoder().encode(query)); await writer.close();
    const result = await child.output();
    // Do not print SQL/driver errors that may contain credentials or fixture values.
    assert(result.success, 'Local SQL operation failed');
    return new TextDecoder().decode(result.stdout).trim();
  };
  const requireOk = <T extends { error: unknown }>(result: T): T => {
    assert(!result.error, 'Local Auth operation failed'); return result;
  };
  Deno.test('P5D deletion leaves zero user references and makes export token return 401', async () => {
    const users: string[] = [];
    const password = crypto.randomUUID() + crypto.randomUUID();
    const makeUser = async (email: string) => {
      const { data } = requireOk(await admin.auth.admin.createUser({ email, password, email_confirm: true }));
      assert(data.user, 'User created'); users.push(data.user.id);
      const client = createClient(api, anon, options);
      const signed = requireOk(await client.auth.signInWithPassword({ email, password }));
      assert(signed.data.session, 'Session created');
      return { id: data.user.id, jwt: signed.data.session.access_token, client };
    };
    const crew = crypto.randomUUID();
    const exercise = crypto.randomUUID();
    const privateExercise = crypto.randomUUID();
    const challenge = crypto.randomUUID();
    const sessionA = crypto.randomUUID(); const sessionB = crypto.randomUUID();
    const setA = crypto.randomUUID(); const setB = crypto.randomUUID();
    try {
      const a = await makeUser('alice@example.test'); const b = await makeUser('bob@example.test');
      const token: unknown = requireOk(await a.client.rpc('create_export_token', { label: 'Delete test' })).data;
      assert(typeof token === 'string', 'Export token created');
      const sync = `'${a.id}', current_date, now()`;
      await sql(`
        insert into public.profiles (id, display_name, initial, color_hue) values ('${a.id}', 'A', 'A', 125), ('${b.id}', 'B', 'B', 220);
        insert into public.crews (id, name, created_by) values ('${crew}', 'Delete test', '${a.id}');
        insert into public.crew_members (crew_id, user_id, role) values ('${crew}', '${a.id}', 'owner'), ('${crew}', '${b.id}', 'member');
        insert into public.crew_invites (crew_id, code_hash, created_by, used_by) values
          ('${crew}', '${crypto.randomUUID()}', '${a.id}', null), ('${crew}', '${crypto.randomUUID()}', '${b.id}', '${a.id}');
        insert into public.exercises (id, owner_id, name, export_label, kind, aliases, equipment) values
          ('${exercise}', '${a.id}', 'Private custom lift', 'Private lift', 'lift', '{private}', 'Private equipment'),
          ('${privateExercise}', '${a.id}', 'Unused lift', 'Unused lift', 'lift', '{}', null);
        insert into public.exercise_muscles (exercise_id, muscle, weight) values ('${exercise}', 'chest', 1);
        insert into public.sessions (id, user_id, local_date, client_updated_at, kind, started_at, tz) values
          ('${sessionA}', ${sync}, 'gym', now(), 'UTC'), ('${sessionB}', '${b.id}', current_date, now(), 'gym', now(), 'UTC');
        insert into public.sets (id, user_id, local_date, client_updated_at, session_id, exercise_id, set_index, reps, weight_kg, logged_at) values
          ('${setA}', ${sync}, '${sessionA}', '${exercise}', 1, 5, 80, now()),
          ('${setB}', '${b.id}', current_date, now(), '${sessionB}', '${exercise}', 1, 5, 80, now());
        insert into public.pr_events (id, user_id, local_date, client_updated_at, exercise_id, source_id, pr_type, value, seen_by) values
          (gen_random_uuid(), ${sync}, '${exercise}', '${setA}', 'e1rm', 80 * (1 + 5::numeric / 30), '{}'),
          (gen_random_uuid(), '${b.id}', current_date, now(), '${exercise}', '${setB}', 'e1rm', 80 * (1 + 5::numeric / 30), '{${a.id}}');
        insert into public.cardio_entries (id, user_id, local_date, client_updated_at, session_id, distance_m, duration_s, logged_at)
          values (gen_random_uuid(), ${sync}, '${sessionA}', 1000, 300, now());
        insert into public.martial_entries (id, user_id, local_date, client_updated_at, session_id, discipline, duration_min, logged_at)
          values (gen_random_uuid(), ${sync}, '${sessionA}', 'BJJ', 60, now());
        insert into public.min_entries (id, user_id, local_date, client_updated_at, session_id, description, logged_at)
          values (gen_random_uuid(), ${sync}, '${sessionA}', 'Walk', now());
        insert into public.bodyweight_entries (id, user_id, local_date, client_updated_at, weight_kg, measured_at)
          values (gen_random_uuid(), ${sync}, 80, now());
        insert into public.exercise_prefs (id, user_id, local_date, client_updated_at, exercise_id, rest_s)
          values (gen_random_uuid(), ${sync}, '${exercise}', 90);
        insert into public.goals (id, user_id, local_date, client_updated_at, exercise_id, kind, target_value, unit, starts_on)
          values (gen_random_uuid(), ${sync}, '${exercise}', 'e1rm', 80 * (1 + 5::numeric / 30), 'kg', current_date);
        insert into public.reactions (id, user_id, local_date, client_updated_at, crew_id, to_user, target_type, target_id, kind)
          values (gen_random_uuid(), '${b.id}', current_date, now(), '${crew}', '${a.id}', 'set', '${setA}', 'chalk');
        insert into public.nudges (id, crew_id, from_user, to_user, sent_on)
          values (gen_random_uuid(), '${crew}', '${a.id}', '${b.id}', current_date);
        insert into public.streak_tokens (id, user_id, local_date, client_updated_at, crew_id, kind, week_start, covers_user_id)
          values (gen_random_uuid(), '${b.id}', current_date, now(), '${crew}', 'spot', current_date, '${a.id}');
        insert into public.crew_weeks (crew_id, week_start, statuses, plate_delta, plates_after) values
          ('${crew}', current_date, '{"${a.id}":{"credits":3},"${b.id}":{"credits":4,"spotted_by":"${a.id}"}}', 1, 1);
        insert into public.challenges (id, crew_id, created_by, kind, starts_on, ends_on, status, winner_user_id)
          values ('${challenge}', '${crew}', '${b.id}', 'sessions', date_trunc('week', now())::date, current_date + 7, 'settled', '${a.id}');
        insert into public.challenge_participants (challenge_id, user_id) values ('${challenge}', '${a.id}'), ('${challenge}', '${b.id}');
        insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ('${a.id}', 'https://example.test/${a.id}', 'test', 'test');
        insert into public.push_log (user_id, sent_on) values ('${a.id}', current_date);
        insert into public.invite_attempts (user_id) values ('${a.id}');
      `);
      const exportCall = async () => {
        const response = await fetch(`${api}/functions/v1/export`, { headers: { Authorization: `Bearer ${token}` } });
        await response.body?.cancel(); return response.status;
      };
      assert(await exportCall() === 200, 'Export works before deletion');
      const remove = async (jwt?: string) => {
        const response = await fetch(`${api}/functions/v1/delete-account`, { method: 'POST',
          headers: { apikey: anon, 'Content-Type': 'application/json', ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}) },
          body: JSON.stringify({ user_id: b.id }), // must never select the deletion target
        });
        await response.body?.cancel(); return response.status;
      };
      assert(await remove() === 401, 'No caller is rejected');
      assert(await remove('invalid') === 401, 'Invalid caller is rejected');
      assert(await remove(a.jwt) === 200, 'Authenticated deletion succeeds');
      assert(await exportCall() === 401, 'Deleted export token returns 401');
      assert(await remove(a.jwt) === 401, 'Deleted session cannot delete again');
      const count = await sql(`
        create function pg_temp.remaining_user_rows() returns bigint language plpgsql as $$
        declare t record; n bigint; total bigint := 0;
        begin
          for t in select tablename from pg_tables where schemaname = 'public' loop
            execute format('select count(*) from public.%I r where strpos(to_jsonb(r)::text, %L) > 0', t.tablename, '${a.id}') into n;
            total := total + n;
          end loop;
          return total + (select count(*) from auth.users where id = '${a.id}');
        end; $$;
        select pg_temp.remaining_user_rows();
      `);
      assert(count === '0', 'SQL count across every public table and Auth must be zero');
      assert(await sql(`select count(*) from public.sets where id = '${setB}' and user_id = '${b.id}'`) === '1', 'Partner set retained');
      assert(await sql(`select count(*) from public.exercises where id = '${exercise}' and owner_id is null and name = 'Deleted exercise' and export_label = 'Deleted exercise' and aliases = '{}' and equipment is null and deleted_at is not null`) === '1', 'Shared exercise anonymised');
      assert(await sql(`select count(*) from public.exercises where id = '${privateExercise}'`) === '0', 'Unshared exercise removed');
      assert(await sql(`select count(*) from auth.users where id = '${b.id}'`) === '1', 'Body-supplied target untouched');
      requireOk(await b.client.auth.signOut());
    } finally {
      for (const id of users) await admin.auth.admin.deleteUser(id);
      await sql(`delete from public.crew_weeks where crew_id = '${crew}'; delete from public.crews where id = '${crew}'; delete from public.exercises where id in ('${exercise}', '${privateExercise}');`);
    }
  });
}

export {};
