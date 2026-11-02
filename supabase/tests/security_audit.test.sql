begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- H3: catalogue proofs for §4.4 / D-1 / D-16 / D-20 / D-23. Migrations are not changed.
-- invite_attempts (E4.3) is included because it arrived with the security model;
-- the pg_class scan also covers any public table added after A3.

select is((select count(*) from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity),
  0::bigint, 'H3: RLS enabled on every public table');
select ok(c.relrowsecurity, 'H3: RLS on ' || c.relname)
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'p');

select is((select count(*) from pg_policies
  where schemaname = 'public' and (qual = 'true' or with_check = 'true')),
  0::bigint, 'H3: no public policy is unconditionally true');
select is((select count(*) from pg_policies
  where schemaname = 'public' and ('anon' = any(roles) or 'public' = any(roles))),
  0::bigint, 'H3: no policy is granted to anon or public');
select is((select count(*) from pg_policies
  where schemaname = 'public'
    and tablename in ('crew_invites', 'export_tokens', 'invite_attempts', 'push_log')),
  0::bigint, 'H3: secret tables have no client policies');
select is((select count(*) from pg_policies
  where schemaname = 'public' and tablename = 'push_subscriptions'
    and cmd in ('ALL', 'INSERT', 'UPDATE')),
  0::bigint, 'H3: push subscriptions have no direct insert or update policy');

select ok(
  not has_table_privilege('anon', format('public.%I', tablename), 'SELECT')
  and not has_table_privilege('anon', format('public.%I', tablename), 'INSERT')
  and not has_table_privilege('anon', format('public.%I', tablename), 'UPDATE')
  and not has_table_privilege('anon', format('public.%I', tablename), 'DELETE')
  and not has_table_privilege('anon', format('public.%I', tablename), 'TRUNCATE'),
  'H3: anon has no DML on ' || tablename)
from pg_tables where schemaname = 'public';

select ok(
  not has_table_privilege('authenticated', format('public.%I', t), 'SELECT')
  and not has_table_privilege('authenticated', format('public.%I', t), 'INSERT')
  and not has_table_privilege('authenticated', format('public.%I', t), 'UPDATE')
  and not has_table_privilege('authenticated', format('public.%I', t), 'DELETE')
  and not has_table_privilege('authenticated', format('public.%I', t), 'TRUNCATE'),
  'H3: authenticated has no DML on secret table ' || t)
from unnest(array['crew_invites', 'export_tokens', 'invite_attempts', 'push_log']) as t;

select ok(not has_table_privilege('authenticated', format('public.%I', t), 'DELETE'),
  'H3: no client delete on ' || t)
from unnest(array[
  'profiles', 'exercises', 'exercise_muscles', 'exercise_prefs', 'sessions', 'sets',
  'cardio_entries', 'martial_entries', 'min_entries', 'bodyweight_entries', 'goals',
  'pr_events', 'reactions', 'nudges', 'streak_tokens', 'crew_weeks', 'crews',
  'crew_members', 'challenges', 'challenge_participants'
]) as t;
select ok(not has_table_privilege('authenticated', 'public.push_subscriptions', 'INSERT'),
  'H3: authenticated cannot insert push subscriptions');
select ok(not has_table_privilege('authenticated', 'public.push_subscriptions', 'UPDATE'),
  'H3: authenticated cannot update push subscriptions');

select ok(not has_column_privilege('anon', 'public.export_tokens', 'token_hash', 'SELECT'),
  'H3: anon cannot select export token hashes');
select ok(not has_column_privilege('authenticated', 'public.export_tokens', 'token_hash', 'SELECT'),
  'H3: authenticated cannot select export token hashes');

select ok(not has_function_privilege('anon', p.oid, 'EXECUTE'),
  'H3: anon cannot execute ' || p.proname)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public';

select ok(coalesce('search_path=""' = any(p.proconfig), false),
  'H3: ' || p.proname || ' security definer search_path is empty')
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef;

select ok(not has_function_privilege('authenticated', p.oid, 'EXECUTE'),
  'H3: authenticated cannot execute ' || p.proname)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in (
  'close_week', 'close_due_weeks', 'purge_deleted_rows', 'delete_account_cleanup',
  'use_spot_at', 'set_updated_at', 'lww_guard', 'enforce_owner', 'enforce_bw_negative',
  'cascade_pr_delete', 'enforce_export_namespace', 'check_pr_event',
  'propagate_session_local_date'
);

-- These RPCs are named by §4.4 / E4.7 and are not in the database. The missing
-- function is the gap; client grants above already show there is no direct write.
select todo(1, 'H3-G1 send_nudge is not implemented');
select has_function('public', 'send_nudge', 'H3-G1 send_nudge exists');
select todo(1, 'H3-G2 settle_challenge is not implemented');
select has_function('public', 'settle_challenge', 'H3-G2 settle_challenge exists');
select todo(1, 'H3-G3 save_push_subscription is not implemented');
select has_function('public', 'save_push_subscription', 'H3-G3 save_push_subscription exists');
select has_function('public', 'mark_pr_events_seen', array['uuid[]'],
  'H3-G4 partner PR receipts shipped in P4H');

-- H5: inspect explicit defaults, including PUBLIC (OID 0), then exercise the
-- effective defaults on new postgres-owned objects. pg_default_acl alone misses
-- built-in PUBLIC EXECUTE when the global ACL has no row.
select ok(not exists (
  select 1 from pg_default_acl d
  cross join lateral aclexplode(d.defaclacl) a
  where d.defaclrole = 'postgres'::regrole
    and (d.defaclnamespace = 'public'::regnamespace or d.defaclnamespace = 0)
    and d.defaclobjtype in ('r', 'S', 'f')
    and a.grantee in (0, 'anon'::regrole::oid, 'authenticated'::regrole::oid)
), 'H3-G7 default privileges do not grant anon, authenticated or PUBLIC');

set local role postgres;
create table public.h5_default_privileges_probe (id integer);
create sequence public.h5_default_privileges_probe_seq;
create function public.h5_default_privileges_probe_fn() returns integer
language sql as 'select 1';
reset role;

select ok(not has_table_privilege(r, 'public.h5_default_privileges_probe',
  'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),
  'H3-G7 future table is closed to ' || r)
from unnest(array['anon', 'authenticated']) as r;
select ok(not has_sequence_privilege(r, 'public.h5_default_privileges_probe_seq',
  'USAGE,SELECT,UPDATE'), 'H3-G7 future sequence is closed to ' || r)
from unnest(array['anon', 'authenticated']) as r;
select ok(not has_function_privilege(r, 'public.h5_default_privileges_probe_fn()', 'EXECUTE'),
  'H3-G7 future function is closed to ' || r)
from unnest(array['anon', 'authenticated']) as r;

drop function public.h5_default_privileges_probe_fn();
drop sequence public.h5_default_privileges_probe_seq;
drop table public.h5_default_privileges_probe;

set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated"}';
select throws_ok(
  $$select public.use_spot('2026-10-19')$$,
  'P0001', 'unauthenticated',
  'H3: use_spot rejects a caller with no auth.uid()');
reset role;

insert into auth.users (id, email) values
  ('a3000000-0000-4000-8000-000000000001', 'alice@example.test'),
  ('a3000000-0000-4000-8000-000000000002', 'bob@example.test');
insert into public.profiles (id, display_name, initial, color_hue) values
  ('a3000000-0000-4000-8000-000000000001', 'A', 'A', 125),
  ('a3000000-0000-4000-8000-000000000002', 'B', 'B', 220);
insert into public.crews (id, name, created_by) values
  ('a3000000-0000-4000-8000-000000000010', 'Audit crew', 'a3000000-0000-4000-8000-000000000001');
insert into public.crew_members (crew_id, user_id, role) values
  ('a3000000-0000-4000-8000-000000000010', 'a3000000-0000-4000-8000-000000000001', 'owner'),
  ('a3000000-0000-4000-8000-000000000010', 'a3000000-0000-4000-8000-000000000002', 'member');
insert into public.crew_invites (crew_id, code_hash, created_by, used_by) values
  ('a3000000-0000-4000-8000-000000000010', repeat('a', 64), 'a3000000-0000-4000-8000-000000000001', null),
  ('a3000000-0000-4000-8000-000000000010', repeat('b', 64), 'a3000000-0000-4000-8000-000000000002',
    'a3000000-0000-4000-8000-000000000001');
insert into public.exercises (id, owner_id, name, export_label, kind) values
  ('a3000000-0000-4000-8000-000000000021', 'a3000000-0000-4000-8000-000000000001', 'Shared lift', 'Shared lift', 'lift'),
  ('a3000000-0000-4000-8000-000000000022', 'a3000000-0000-4000-8000-000000000001', 'Unused lift', 'Unused lift', 'lift');
insert into public.exercise_muscles (exercise_id, muscle, weight) values
  ('a3000000-0000-4000-8000-000000000021', 'chest', 1);
insert into public.sessions (id, kind, started_at, tz, user_id, local_date, client_updated_at) values
  ('a3000000-0000-4000-8000-000000000031', 'gym', now(), 'Europe/Amsterdam',
    'a3000000-0000-4000-8000-000000000001', '2026-10-24', now()),
  ('a3000000-0000-4000-8000-000000000032', 'gym', now(), 'Europe/Amsterdam',
    'a3000000-0000-4000-8000-000000000002', '2026-10-24', now());
insert into public.sets (id, session_id, exercise_id, set_index, reps, weight_kg, logged_at,
  user_id, local_date, client_updated_at) values
  ('a3000000-0000-4000-8000-000000000041', 'a3000000-0000-4000-8000-000000000031',
    'a3000000-0000-4000-8000-000000000021', 1, 5, 80, now(),
    'a3000000-0000-4000-8000-000000000001', '2026-10-24', now()),
  ('a3000000-0000-4000-8000-000000000042', 'a3000000-0000-4000-8000-000000000032',
    'a3000000-0000-4000-8000-000000000021', 1, 5, 80, now(),
    'a3000000-0000-4000-8000-000000000002', '2026-10-24', now());
insert into public.pr_events (id, exercise_id, source_id, pr_type, reps, value, seen_by,
  user_id, local_date, client_updated_at) values
  ('a3000000-0000-4000-8000-000000000051', 'a3000000-0000-4000-8000-000000000021',
    'a3000000-0000-4000-8000-000000000041', 'e1rm', 5, 80 * (1 + 5::numeric / 30), '{}',
    'a3000000-0000-4000-8000-000000000001', '2026-10-24', now()),
  ('a3000000-0000-4000-8000-000000000052', 'a3000000-0000-4000-8000-000000000021',
    'a3000000-0000-4000-8000-000000000042', 'e1rm', 5, 80 * (1 + 5::numeric / 30),
    array['a3000000-0000-4000-8000-000000000001']::uuid[],
    'a3000000-0000-4000-8000-000000000002', '2026-10-24', now());
insert into public.cardio_entries (id, session_id, distance_m, duration_s, logged_at,
  user_id, local_date, client_updated_at) values
  ('a3000000-0000-4000-8000-000000000061', 'a3000000-0000-4000-8000-000000000031', 1000, 300, now(),
    'a3000000-0000-4000-8000-000000000001', '2026-10-24', now());
insert into public.martial_entries (id, session_id, discipline, duration_min, logged_at,
  user_id, local_date, client_updated_at) values
  ('a3000000-0000-4000-8000-000000000062', 'a3000000-0000-4000-8000-000000000031', 'Grappling', 60, now(),
    'a3000000-0000-4000-8000-000000000001', '2026-10-24', now());
insert into public.min_entries (id, session_id, description, duration_min, logged_at,
  user_id, local_date, client_updated_at) values
  ('a3000000-0000-4000-8000-000000000063', 'a3000000-0000-4000-8000-000000000031', 'Walk', 20, now(),
    'a3000000-0000-4000-8000-000000000001', '2026-10-24', now());
insert into public.bodyweight_entries (id, weight_kg, measured_at, user_id, local_date, client_updated_at) values
  ('a3000000-0000-4000-8000-000000000064', 80, now(),
    'a3000000-0000-4000-8000-000000000001', '2026-10-24', now());
insert into public.exercise_prefs (id, exercise_id, rest_s, user_id, local_date, client_updated_at) values
  ('a3000000-0000-4000-8000-000000000065', 'a3000000-0000-4000-8000-000000000021', 90,
    'a3000000-0000-4000-8000-000000000001', '2026-10-24', now());
insert into public.goals (id, kind, exercise_id, target_value, unit, starts_on,
  user_id, local_date, client_updated_at) values
  ('a3000000-0000-4000-8000-000000000066', 'e1rm', 'a3000000-0000-4000-8000-000000000021', 100, 'kg',
    '2026-10-19', 'a3000000-0000-4000-8000-000000000001', '2026-10-24', now());
insert into public.reactions (id, crew_id, to_user, target_type, target_id, kind,
  user_id, local_date, client_updated_at) values
  ('a3000000-0000-4000-8000-000000000067', 'a3000000-0000-4000-8000-000000000010',
    'a3000000-0000-4000-8000-000000000001', 'set', 'a3000000-0000-4000-8000-000000000041', 'chalk',
    'a3000000-0000-4000-8000-000000000002', '2026-10-24', now());
insert into public.nudges (id, crew_id, from_user, to_user, sent_on) values
  ('a3000000-0000-4000-8000-000000000069', 'a3000000-0000-4000-8000-000000000010',
    'a3000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000002', '2026-10-24');
insert into public.streak_tokens (id, crew_id, kind, week_start, covers_user_id,
  user_id, local_date, client_updated_at) values
  ('a3000000-0000-4000-8000-000000000068', 'a3000000-0000-4000-8000-000000000010', 'spot', '2026-10-19',
    'a3000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000002', '2026-10-25', now());
insert into public.crew_weeks (crew_id, week_start, statuses, plate_delta, plates_after) values
  ('a3000000-0000-4000-8000-000000000010', '2026-10-19',
    '{"a3000000-0000-4000-8000-000000000001":{"credits":3,"spotted_by":null},"a3000000-0000-4000-8000-000000000002":{"credits":4,"spotted_by":"a3000000-0000-4000-8000-000000000001"}}',
    1, 1);
insert into public.challenges (id, crew_id, created_by, kind, starts_on, ends_on, status, winner_user_id) values
  ('a3000000-0000-4000-8000-000000000060', 'a3000000-0000-4000-8000-000000000010',
    'a3000000-0000-4000-8000-000000000002', 'sessions', '2026-10-19', '2026-11-02', 'settled',
    'a3000000-0000-4000-8000-000000000001');
insert into public.challenge_participants (challenge_id, user_id) values
  ('a3000000-0000-4000-8000-000000000060', 'a3000000-0000-4000-8000-000000000001'),
  ('a3000000-0000-4000-8000-000000000060', 'a3000000-0000-4000-8000-000000000002');
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values
  ('a3000000-0000-4000-8000-000000000001', 'https://push.example.test/audit', 'p256', 'authkey');
insert into public.push_log (user_id, sent_on) values
  ('a3000000-0000-4000-8000-000000000001', '2026-10-24');
insert into public.export_tokens (user_id, token_hash, label) values
  ('a3000000-0000-4000-8000-000000000001', repeat('ab', 32), 'Audit vault');
insert into public.invite_attempts (user_id) values
  ('a3000000-0000-4000-8000-000000000001');

set local role authenticated;
set local request.jwt.claims = '{"sub":"a3000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok(
  $$select token_hash from public.export_tokens$$,
  '42501', null,
  'H3: authenticated select of token_hash is denied');
select is((select array_agg(k order by k) from public.list_export_tokens() t,
  lateral jsonb_object_keys(to_jsonb(t)) as k),
  array['created_at', 'id', 'label', 'last_used_at', 'revoked_at']::text[],
  'H3: list_export_tokens never returns token_hash');
reset role;

create function pg_temp.rows_mentioning(target uuid) returns bigint
language plpgsql as $$
declare
  rel record;
  found bigint;
  total bigint := 0;
begin
  for rel in select tablename from pg_tables where schemaname = 'public' loop
    execute format(
      'select count(*) from public.%I r where strpos(to_jsonb(r)::text, %L) > 0',
      rel.tablename, target::text
    ) into found;
    total := total + found;
  end loop;
  return total;
end;
$$;

select lives_ok(
  $$delete from auth.users where id = 'a3000000-0000-4000-8000-000000000001'$$,
  'H3: deleting the auth user runs account cleanup');
select is((select count(*) from auth.users where id = 'a3000000-0000-4000-8000-000000000001'),
  0::bigint, 'D-23: auth user is gone');
select is(pg_temp.rows_mentioning('a3000000-0000-4000-8000-000000000001'),
  0::bigint, 'D-23: delete-account leaves 0 public rows mentioning that user');
select is((select count(*) from auth.users where id = 'a3000000-0000-4000-8000-000000000002'),
  1::bigint, 'D-23: the other user is kept');
select is((select count(*) from public.sets where id = 'a3000000-0000-4000-8000-000000000042'),
  1::bigint, 'D-23: partner training is kept');
select is((select seen_by from public.pr_events where id = 'a3000000-0000-4000-8000-000000000052'),
  '{}'::uuid[], 'D-23: partner PR drops the deleted viewer');
select is((select owner_id is null and name = 'Deleted exercise' and deleted_at is not null
  from public.exercises where id = 'a3000000-0000-4000-8000-000000000021'),
  true, 'D-23: shared custom exercise is anonymised');
select is((select count(*) from public.exercises where id = 'a3000000-0000-4000-8000-000000000022'),
  0::bigint, 'D-23: unshared custom exercise is removed');
select is((select created_by from public.crews where id = 'a3000000-0000-4000-8000-000000000010'),
  null, 'D-23: crew survives with creator set null');

select * from finish();
rollback;
