begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, email) values
 ('10000000-0000-4000-8000-000000000001', 'alice@example.test'),
 ('10000000-0000-4000-8000-000000000002', 'bob@example.test'),
 ('10000000-0000-4000-8000-000000000003', null);
insert into public.profiles (id, display_name, initial, color_hue) values
 ('10000000-0000-4000-8000-000000000001', 'A', 'A', 125),
 ('10000000-0000-4000-8000-000000000002', 'B', 'B', 220),
 ('10000000-0000-4000-8000-000000000003', 'C', 'C', 300);
insert into public.crews (id, name, tz, created_at) values
 ('90000000-0000-4000-8000-000000000001', 'Test crew', 'Europe/Amsterdam', '2026-01-01');
insert into public.crew_members (crew_id, user_id, role, joined_at) values
 ('90000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'owner', '2026-01-01'),
 ('90000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'member', '2026-01-01');

create function pg_temp.training(u integer, d date, k text default 'gym', n integer default 1,
  warmup boolean default false, min_mode boolean default false) returns uuid
language plpgsql as $$
declare
  s uuid := gen_random_uuid();
  who uuid := ('10000000-0000-4000-8000-' || lpad(u::text, 12, '0'))::uuid;
begin
  insert into public.sessions (id, kind, mode, started_at, tz, user_id, local_date, client_updated_at)
    values (s, k, case when min_mode then 'min' else 'full' end,
      d::timestamp at time zone 'Europe/Amsterdam', 'Europe/Amsterdam', who, d, now());
  for i in 1..n loop
    if k = 'gym' then
      insert into public.sets (id, session_id, exercise_id, set_index, reps, weight_kg,
        is_warmup, logged_at, user_id, local_date, client_updated_at)
      values (gen_random_uuid(), s, '00000000-0000-4000-8000-000000000001', i, 5, 60,
        warmup, now(), who, d, now());
    elsif k = 'run' then
      insert into public.cardio_entries (id, session_id, distance_m, duration_s,
        logged_at, user_id, local_date, client_updated_at)
      values (gen_random_uuid(), s, 5000, 1800, now(), who, d, now());
    elsif k = 'martial' then
      insert into public.martial_entries (id, session_id, discipline, duration_min,
        logged_at, user_id, local_date, client_updated_at)
      values (gen_random_uuid(), s, 'BJJ', 30, now(), who, d, now());
    else
      insert into public.min_entries (id, session_id, description,
        logged_at, user_id, local_date, client_updated_at)
      values (gen_random_uuid(), s, 'Walk', now(), who, d, now());
    end if;
  end loop;
  return s;
end;
$$;
create function pg_temp.clear_case() returns void language plpgsql as $$
begin
  delete from public.sessions;
  delete from public.crew_weeks;
  delete from public.streak_tokens;
end;
$$;
create function pg_temp.close_test_week() returns void language sql as $$
  select public.close_week('90000000-0000-4000-8000-000000000001', '2027-03-22');
$$;
create function pg_temp.spot_at(w date, instant timestamptz) returns uuid language sql as $$
  select public.use_spot_at(w, instant);
$$;

select is(public.week_credits('10000000-0000-4000-8000-000000000001', '2027-03-22'), 0::numeric,
  'E5.6: empty week has zero credits');
select pg_temp.training(1, '2027-03-22', 'min');
select is(public.week_credits('10000000-0000-4000-8000-000000000001', '2027-03-22'), 0.5,
  'E5.6: Floor MIN earns 0.5, never the session award');
select pg_temp.training(1, '2027-03-23', 'gym', 2, false, true);
select pg_temp.training(1, '2027-03-24', 'run', 2);
select pg_temp.training(1, '2027-03-25', 'martial', 2);
select is(public.week_credits('10000000-0000-4000-8000-000000000001', '2027-03-22'), 3.5,
  'E5.6: open gym Do MIN, run and martial each earn one regardless of entry count');
select pg_temp.training(1, '2027-03-25', 'gym');
select pg_temp.training(1, '2027-03-25', 'min', 6);
select is(public.week_credits('10000000-0000-4000-8000-000000000001', '2027-03-22'), 4.5,
  'D5: sessions plus MIN cap at 2.0 per local day; other days retain their credits');
select pg_temp.training(1, '2027-03-26', 'gym', 1, true);
select pg_temp.training(1, '2027-03-26', 'gym', 0);
select pg_temp.training(1, '2027-03-21');
select pg_temp.training(1, '2027-03-29');
select is(public.week_credits('10000000-0000-4000-8000-000000000001', '2027-03-22'), 4.5,
  'Warmup-only, empty and outside-week sessions earn no credit');
update public.sessions set deleted_at = now() where kind = 'run';
update public.martial_entries set deleted_at = now();
update public.min_entries set deleted_at = now();
select is(public.week_credits('10000000-0000-4000-8000-000000000001', '2027-03-22'), 2::numeric,
  'Deleted sessions and entries earn no credit');
select throws_ok($q$select public.week_credits('10000000-0000-4000-8000-000000000001', '2027-03-23')$q$,
  'P0001', 'invalid_week_start', 'Credit week must start on Monday');
select throws_ok($q$select public.close_week('90000000-0000-4000-8000-000000000001', null)$q$,
  'P0001', 'invalid_week_start', 'Close rejects a missing week');

select pg_temp.clear_case();
select pg_temp.training(u, d::date) from generate_series(1, 2) u
  cross join generate_series(timestamp '2027-03-22', timestamp '2027-03-24', interval '1 day') d;
select pg_temp.close_test_week();
select is((select plate_delta::integer from public.crew_weeks), 1, 'Bar FULL/FULL: +1 plate');
select is((select plates_after from public.crew_weeks), 1, 'Bar FULL/FULL: first plate total is 1');
select is((select statuses->'10000000-0000-4000-8000-000000000001' from public.crew_weeks),
  '{"credits":3,"target":3,"status":"FULL","spotted_by":null}'::jsonb,
  'Week close persists credits, own target, status and cover');
create temporary table first_close as select * from public.crew_weeks;
select pg_temp.close_test_week();
select results_eq('select * from public.crew_weeks', 'select * from first_close',
  'Week-close retry is idempotent, including computed_at and adjustment flag');

-- Reclose after an edit changes the outcome; later plate totals are rebased.
select public.close_week('90000000-0000-4000-8000-000000000001', '2027-03-29');
update public.sessions set deleted_at = now()
  where user_id = '10000000-0000-4000-8000-000000000002' and local_date = '2027-03-24';
select pg_temp.close_test_week();
select is((select plate_delta::integer from public.crew_weeks where week_start = '2027-03-22'),
  0, 'Bar HELD/FULL: no change');
select ok((select adjusted_after_edit from public.crew_weeks where week_start = '2027-03-22'),
  'Recomputation after an edit marks the week adjusted');
select is((select plates_after from public.crew_weeks where week_start = '2027-03-29'),
  0, 'Historical recomputation preserves later floor at zero');

select pg_temp.clear_case();
select pg_temp.training(u, '2027-03-22', 'min') from generate_series(1, 2) u;
select pg_temp.close_test_week();
select is((select plate_delta::integer from public.crew_weeks), 0, 'Bar HELD/HELD: no change');
select is((select statuses->'10000000-0000-4000-8000-000000000001'->>'status' from public.crew_weeks),
  'HELD', 'One MIN reaches the HELD threshold');

select pg_temp.clear_case();
insert into public.crew_weeks (crew_id, week_start, statuses, plate_delta, plates_after)
  values ('90000000-0000-4000-8000-000000000001', '2027-03-15', '{}', 1, 4);
select pg_temp.close_test_week();
select is((select plate_delta::integer from public.crew_weeks where week_start = '2027-03-22'),
  -1, 'Bar REST/REST: at most -1 plate for the whole crew');
select is((select plates_after from public.crew_weeks where week_start = '2027-03-22'),
  3, 'Bar REST: subtracts exactly one plate, never resets');
select pg_temp.clear_case();
select pg_temp.training(1, d::date) from generate_series(timestamp '2027-03-22', timestamp '2027-03-24', interval '1 day') d;
select pg_temp.close_test_week();
select is((select plate_delta::integer from public.crew_weeks), -1, 'Bar FULL/REST: -1 plate');
select pg_temp.clear_case();
select pg_temp.training(1, '2027-03-22');
select pg_temp.close_test_week();
select is((select plate_delta::integer from public.crew_weeks), -1, 'Bar HELD/REST: -1 plate');
select is((select plates_after from public.crew_weeks), 0, 'Bar REST: plates never go below zero');

-- DST switch on 2027-03-28: the Sunday date belongs to the week of March 22.
select pg_temp.clear_case();
select pg_temp.training(1, '2027-03-28', 'min');
update public.sessions set started_at = '2027-03-28 21:30+00', tz = 'Asia/Tokyo';
select is(public.week_credits('10000000-0000-4000-8000-000000000001', '2027-03-22'), 0.5,
  'DST 2027-03-28: Sunday 23:30 Amsterdam belongs to Monday 2027-03-22 via local_date');
select is(public.week_credits('10000000-0000-4000-8000-000000000001', '2027-03-29'), 0::numeric,
  'DST 2027-03-28: Sunday credit does not leak into the following week');
select public.close_due_weeks('2027-03-28 22:04:59+00');
select is((select count(*) from public.crew_weeks), 0::bigint, 'Cron excludes Monday 00:04:59 local');
select public.close_due_weeks('2027-03-28 22:05:00+00');
select is((select week_start from public.crew_weeks), date '2027-03-22',
  'DST 2027-03-28: cron closes the 167-hour Amsterdam week at local Monday 00:05');
delete from public.crew_weeks;
select public.close_due_weeks('2027-03-28 23:04:59+00');
select is((select count(*) from public.crew_weeks), 1::bigint, 'Cron includes Monday 01:04:59 local');
delete from public.crew_weeks;
select public.close_due_weeks('2027-03-28 23:05:00+00');
select is((select count(*) from public.crew_weeks), 0::bigint, 'Cron excludes Monday 01:05 local');
update public.crews set tz = 'Asia/Kathmandu';
select public.close_due_weeks('2027-03-28 19:05:00+00');
select is((select week_start from public.crew_weeks), date '2027-03-22',
  'Cron hourly :05 catches fractional-offset Kathmandu at local 00:50');
update public.crews set tz = 'Europe/Amsterdam';
select is((select schedule from cron.job where jobname = 'week-close'), '5 * * * *',
  'Week-close cron runs hourly at :05 on every UTC day');

select pg_temp.clear_case();
select pg_temp.training(1, '2026-10-25', 'min');
update public.sessions set started_at = '2026-10-25 22:30+00';
select is(public.week_credits('10000000-0000-4000-8000-000000000001', '2026-10-19'), 0.5,
  'Autumn DST: Sunday 2026-10-25 23:30 belongs to Monday 2026-10-19');
select public.close_due_weeks('2026-10-25 23:05+00');
select is((select week_start from public.crew_weeks), date '2026-10-19',
  'Autumn DST: cron closes the 169-hour Amsterdam week');

-- Spot tests inject time only into the ungranted implementation. Authenticated
-- callers have access solely to use_spot(date), which always uses now().
select pg_temp.clear_case();
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select throws_ok($q$select pg_temp.spot_at('2027-03-22', '2027-03-28 09:59:59+00')$q$,
  'P0001', 'spot_window_closed', 'Spot unavailable before Sunday 12:00 crew time across DST');
select throws_ok($q$select pg_temp.spot_at('2027-03-22', '2027-03-28 10:00:00+00')$q$,
  'P0001', 'spot_needs_extra_credit', 'Spot requires own target plus one credit');
select pg_temp.training(1, d::date) from generate_series(timestamp '2027-03-22', timestamp '2027-03-24', interval '1 day') d;
select throws_ok($q$select pg_temp.spot_at('2027-03-22', '2027-03-28 10:00:00+00')$q$,
  'P0001', 'spot_needs_extra_credit', 'Exactly own target is insufficient to spot');
select pg_temp.training(1, '2027-03-25');
select pg_temp.training(2, '2027-03-22', 'min');
select throws_ok($q$select pg_temp.spot_at('2027-03-22', '2027-03-28 10:00:00+00')$q$,
  'P0001', 'no_partner_needs_spot', 'A HELD partner cannot be spotted');
delete from public.sessions where user_id = '10000000-0000-4000-8000-000000000002';
select lives_ok($q$select pg_temp.spot_at('2027-03-22', '2027-03-28 10:00:00+00')$q$,
  'Spot opens at Sunday 12:00 crew time, including the DST switch');
select is((select covers_user_id from public.streak_tokens), '10000000-0000-4000-8000-000000000002'::uuid,
  'Spot token records the REST partner');
select is((select local_date from public.streak_tokens), date '2027-03-28',
  'Spot monthly budget uses the crew-local spend date');
select is(pg_temp.spot_at('2027-03-22', '2027-03-29 12:00+00'), (select id from public.streak_tokens),
  'Outbox retry after the window returns the same token');
select is((select count(*) from public.streak_tokens), 1::bigint, 'Spot retry consumes exactly one token');
select pg_temp.close_test_week();
select is((select plate_delta::integer from public.crew_weeks), 0, 'Bar FULL/REST spotted: no change');
select is((select statuses->'10000000-0000-4000-8000-000000000002'->>'spotted_by' from public.crew_weeks),
  '10000000-0000-4000-8000-000000000001', 'Week close persists the covering member');
select pg_temp.close_test_week();
select is((select count(*) from public.streak_tokens), 1::bigint, 'Idempotent close does not spend a spot again');

-- Three members: an uncovered REST still costs one, even if another is covered.
insert into public.crew_members (crew_id, user_id, role, joined_at) values
 ('90000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 'member', '2026-01-01');
select pg_temp.close_test_week();
select is((select plate_delta::integer from public.crew_weeks), -1,
  'Bar N>2: one covered REST cannot mask another uncovered REST');
insert into public.streak_tokens (id, crew_id, kind, week_start, covers_user_id, user_id, local_date, client_updated_at)
values (gen_random_uuid(), '90000000-0000-4000-8000-000000000001', 'spot', '2027-03-22',
 '10000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', '2027-03-28', now());
select pg_temp.close_test_week();
select is((select plate_delta::integer from public.crew_weeks), 0, 'Bar N>2: every REST spotted holds the Bar');
delete from public.crew_members where user_id = '10000000-0000-4000-8000-000000000003';

-- Same calendar month, different weeks. Limit also survives soft deletion.
select throws_ok($q$select pg_temp.spot_at('2027-03-15', '2027-03-21 12:00+00')$q$,
  'P0001', 'spot_monthly_limit', 'D8: a second spot in the crew calendar month is rejected');
update public.streak_tokens set deleted_at = now();
select throws_ok($q$select pg_temp.spot_at('2027-03-15', '2027-03-21 12:00+00')$q$,
  'P0001', 'spot_monthly_limit', 'Soft deletion cannot restore the monthly spot budget');
select pg_temp.training(1, d::date) from generate_series(timestamp '2027-03-29', timestamp '2027-04-01', interval '1 day') d;
select lives_ok($q$select pg_temp.spot_at('2027-03-29', '2027-04-04 10:00+00')$q$,
  'D8: new calendar month renews one spot, even when week_start is in the previous month');
select pg_temp.training(1, d::date) from generate_series(timestamp '2027-04-05', timestamp '2027-04-08', interval '1 day') d;
select throws_ok($q$select pg_temp.spot_at('2027-04-05', '2027-04-11 10:00+00')$q$,
  'P0001', 'spot_monthly_limit', 'D8: unused months do not roll over into extra spots');
select throws_ok($q$select pg_temp.spot_at('2027-04-05', '2027-04-11 22:00+00')$q$,
  'P0001', 'spot_window_closed', 'Spot window closes exactly at Monday 00:00 crew time');
select throws_ok($q$select pg_temp.spot_at('2027-04-06', '2027-04-11 10:00+00')$q$,
  'P0001', 'invalid_week_start', 'Spot rejects a non-Monday week');

-- Last instant in the window, custom targets, and the public RPC boundary.
select pg_temp.clear_case();
update public.profiles set weekly_target = 1 where id = '10000000-0000-4000-8000-000000000001';
select pg_temp.training(1, '2027-03-22');
select pg_temp.training(1, '2027-03-23');
select lives_ok($q$select pg_temp.spot_at('2027-03-22', '2027-03-28 21:59:59+00')$q$,
  'Spot uses own custom target and remains open until Sunday 23:59:59');
select set_config('request.jwt.claim.sub', '', true);
select throws_ok($q$select public.use_spot('2027-03-22')$q$,
  'P0001', 'unauthenticated', 'Public spot RPC requires an authenticated user');
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
select throws_ok($q$select public.use_spot('2027-03-22')$q$,
  'P0001', 'not_in_crew', 'Public spot RPC rejects non-members');
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select is(public.use_spot('2027-03-22'), (select id from public.streak_tokens),
  'Authenticated wrapper replays the original spot without another write');
select throws_ok($q$select public.use_spot_at('2027-03-22', '2027-03-28 10:00+00')$q$,
  '42501', null, 'Authenticated user cannot call the injected-clock implementation');
reset role;
update public.profiles set weekly_target = 3;

select pg_temp.clear_case();
insert into public.streak_tokens (id, crew_id, kind, week_start, covers_user_id, user_id, local_date, client_updated_at)
values (gen_random_uuid(), '90000000-0000-4000-8000-000000000001', 'freeze', '2027-03-22',
 '10000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '2027-03-28', now());
select pg_temp.close_test_week();
select is((select plate_delta::integer from public.crew_weeks), -1, 'D6: unused freeze tokens never cover a REST week');

select pg_temp.clear_case();
update public.crews set created_at = '2027-03-24';
select pg_temp.close_test_week();
select is((select plate_delta::integer from public.crew_weeks), 0, 'E5.8: crew creation week cannot lose a plate');
update public.crews set created_at = '2026-01-01';
delete from public.crew_weeks;
update public.crew_members set joined_at = '2027-03-24' where user_id = '10000000-0000-4000-8000-000000000002';
select pg_temp.close_test_week();
select is((select statuses->'10000000-0000-4000-8000-000000000002'->>'status' from public.crew_weeks),
  'HELD', 'E5.8: new member is never REST in their join week');
select is((select plate_delta::integer from public.crew_weeks), 0, 'E5.8: join week cannot lose a plate');
select pg_temp.training(u, d::date) from generate_series(1, 2) u
  cross join generate_series(timestamp '2027-03-24', timestamp '2027-03-26', interval '1 day') d;
select pg_temp.close_test_week();
select is((select plate_delta::integer from public.crew_weeks), 1, 'E5.8: join week can still earn a plate');
update public.crew_members set left_at = now() where user_id = '10000000-0000-4000-8000-000000000002';
select public.close_week('90000000-0000-4000-8000-000000000001', '2027-03-29');
select is((select count(*) from public.crew_weeks), 1::bigint, 'A departed partner freezes the archived Bar');

select ok(not has_function_privilege('authenticated', 'public.close_week(uuid,date)', 'EXECUTE'),
  'Clients cannot close arbitrary weeks');
select ok(not has_function_privilege('authenticated', 'public.use_spot_at(date,timestamptz)', 'EXECUTE'),
  'Clients cannot inject the spot clock');
select ok(not has_function_privilege('authenticated', 'public.close_due_weeks(timestamptz)', 'EXECUTE'),
  'Clients cannot inject the cron clock');
select ok(has_function_privilege('authenticated', 'public.use_spot(date)', 'EXECUTE'),
  'Authenticated clients can use the server-clock spot RPC');
select ok(coalesce('search_path=""' = any(p.proconfig), false), p.proname || ': empty SECURITY DEFINER search_path')
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef;
select * from finish();
rollback;
