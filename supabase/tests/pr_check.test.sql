begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, email) values
  ('10000000-0000-4000-8000-000000000001', 'alice@example.test'),
  ('10000000-0000-4000-8000-000000000002', 'bob@example.test');
insert into public.sessions (id, kind, started_at, tz, user_id, local_date, client_updated_at) values
  ('21000000-0000-4000-8000-000000000001', 'gym', '2026-10-25 18:00+00', 'Europe/Amsterdam',
   '10000000-0000-4000-8000-000000000001', '2026-10-25', '2026-10-25'),
  ('21000000-0000-4000-8000-000000000002', 'gym', '2026-10-25 18:00+00', 'Europe/Amsterdam',
   '10000000-0000-4000-8000-000000000002', '2026-10-25', '2026-10-25'),
  ('21000000-0000-4000-8000-000000000003', 'run', '2026-10-26 18:00+00', 'Europe/Amsterdam',
   '10000000-0000-4000-8000-000000000001', '2026-10-26', '2026-10-26');

-- 60 kg × 5. Epley = 70. 100 kg × 5 = 116.6̅. Two working sets volume = 110.
insert into public.sets (id, session_id, exercise_id, set_index, reps, weight_kg, logged_at, user_id, local_date, client_updated_at) values
  ('31000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000001', 1, 5, 60, '2026-10-25 18:01+00',
   '10000000-0000-4000-8000-000000000001', '2026-10-25', '2026-10-25'),
  ('31000000-0000-4000-8000-000000000002', '21000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000000001', 1, 5, 60, '2026-10-25 18:01+00',
   '10000000-0000-4000-8000-000000000002', '2026-10-25', '2026-10-25'),
  ('31000000-0000-4000-8000-000000000003', '21000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000001', 2, 5, 100, '2026-10-25 18:02+00',
   '10000000-0000-4000-8000-000000000001', '2026-10-25', '2026-10-25'),
  ('31000000-0000-4000-8000-000000000004', '21000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000004', 1, 5, 10, '2026-10-25 18:03+00',
   '10000000-0000-4000-8000-000000000001', '2026-10-25', '2026-10-25'),
  ('31000000-0000-4000-8000-000000000005', '21000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000004', 2, 3, 20, '2026-10-25 18:04+00',
   '10000000-0000-4000-8000-000000000001', '2026-10-25', '2026-10-25'),
  ('31000000-0000-4000-8000-000000000006', '21000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000001', 3, 5, 40, '2026-10-25 18:05+00',
   '10000000-0000-4000-8000-000000000001', '2026-10-25', '2026-10-25'),
  ('31000000-0000-4000-8000-000000000007', '21000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000011', 1, 5, -25, '2026-10-25 18:06+00',
   '10000000-0000-4000-8000-000000000001', '2026-10-25', '2026-10-25');
update public.sets set is_warmup = true
  where id = '31000000-0000-4000-8000-000000000006';
update public.sets set reps = 13
  where id = '31000000-0000-4000-8000-000000000003';

insert into public.cardio_entries (id, session_id, distance_m, duration_s, logged_at, user_id, local_date, client_updated_at) values
  ('41000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000003',
   5000, 1500, '2026-10-26 18:10+00', '10000000-0000-4000-8000-000000000001', '2026-10-26', '2026-10-26');

select lives_ok($q$
  insert into public.pr_events (id, exercise_id, source_id, pr_type, reps, value, user_id, local_date, client_updated_at)
  values ('81000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001',
    '31000000-0000-4000-8000-000000000001', 'e1rm', 5, 70,
    '10000000-0000-4000-8000-000000000001', '2026-10-25', '2026-10-25')
$q$, 'valid e1RM accepted');
select lives_ok($q$
  insert into public.pr_events (id, exercise_id, source_id, pr_type, value, user_id, local_date, client_updated_at)
  values ('81000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000001',
    '31000000-0000-4000-8000-000000000001', 'e1rm', 70,
    '10000000-0000-4000-8000-000000000001', '2026-10-25', '2026-10-25')
$q$, 'valid e1RM accepted when reps is omitted');
delete from public.pr_events where id = '81000000-0000-4000-8000-000000000011';

-- 100×5 was rewritten to 13 reps below; use a fresh 100×5 for the rounded Epley.
insert into public.sets (id, session_id, exercise_id, set_index, reps, weight_kg, logged_at, user_id, local_date, client_updated_at) values
  ('31000000-0000-4000-8000-000000000013', '21000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000002', 1, 5, 100, '2026-10-25 18:08+00',
   '10000000-0000-4000-8000-000000000001', '2026-10-25', '2026-10-25');
select lives_ok($q$
  insert into public.pr_events (id, exercise_id, source_id, pr_type, reps, value, user_id, local_date, client_updated_at)
  values ('81000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002',
    '31000000-0000-4000-8000-000000000013', 'e1rm', 5, 116.67,
    '10000000-0000-4000-8000-000000000001', '2026-10-25', '2026-10-25')
$q$, '2-decimal Epley 116.67 accepted for 100×5');
select throws_ok($q$
  insert into public.pr_events (id, exercise_id, source_id, pr_type, reps, value, user_id, local_date, client_updated_at)
  values ('81000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000002',
    '31000000-0000-4000-8000-000000000013', 'e1rm', 5, 200,
    '10000000-0000-4000-8000-000000000001', '2026-10-25', '2026-10-25')
$q$, '23514', 'pr_value_mismatch', 'forged e1RM rejected');
select throws_ok($q$
  insert into public.pr_events (id, exercise_id, source_id, pr_type, reps, value, user_id, local_date, client_updated_at)
  values ('81000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000001',
    '31000000-0000-4000-8000-000000000002', 'e1rm', 5, 70,
    '10000000-0000-4000-8000-000000000001', '2026-10-25', '2026-10-25')
$q$, '23514', 'pr_owner_mismatch', 'another user''s set rejected');
select throws_ok($q$
  insert into public.pr_events (id, exercise_id, source_id, pr_type, value, user_id, local_date, client_updated_at)
  values ('81000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000001',
    '31000000-0000-4000-8000-000000000099', 'e1rm', 70,
    '10000000-0000-4000-8000-000000000001', '2026-10-25', '2026-10-25')
$q$, '23503', 'pr_source_missing', 'missing source rejected');

update public.sets set deleted_at = '2026-10-27', client_updated_at = '2026-10-27'
  where id = '31000000-0000-4000-8000-000000000013';
select throws_ok($q$
  insert into public.pr_events (id, exercise_id, source_id, pr_type, reps, value, user_id, local_date, client_updated_at)
  values ('81000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-000000000002',
    '31000000-0000-4000-8000-000000000013', 'e1rm', 5, 116.67,
    '10000000-0000-4000-8000-000000000001', '2026-10-25', '2026-10-25')
$q$, '23514', 'pr_source_deleted', 'deleted source rejected');
select ok((select deleted_at is not null from public.pr_events
  where id = '81000000-0000-4000-8000-000000000002'),
  'set delete cascades to the PR tombstone');
select lives_ok($q$
  update public.pr_events set deleted_at = '2026-10-28', client_updated_at = '2026-10-28'
  where id = '81000000-0000-4000-8000-000000000002'
$q$, 'unchanged PR may be tombstoned again after its source is deleted');
select throws_ok($q$
  update public.pr_events set value = 999, client_updated_at = '2026-10-29'
  where id = '81000000-0000-4000-8000-000000000002'
$q$, '23514', 'pr_source_deleted', 'forged update rejected after the source is deleted');

select lives_ok($q$
  insert into public.pr_events (id, exercise_id, source_id, pr_type, reps, value, user_id, local_date, client_updated_at)
  values ('81000000-0000-4000-8000-000000000007', '00000000-0000-4000-8000-000000000001',
    '31000000-0000-4000-8000-000000000001', 'rep_max', 5, 60,
    '10000000-0000-4000-8000-000000000001', '2026-10-25', '2026-10-25')
$q$, 'valid rep-max accepted');
select throws_ok($q$
  update public.pr_events set value = 61, client_updated_at = '2026-10-26'
  where id = '81000000-0000-4000-8000-000000000007'
$q$, '23514', 'pr_value_mismatch', 'forged rep-max rejected');

select lives_ok($q$
  insert into public.pr_events (id, exercise_id, source_id, pr_type, value, user_id, local_date, client_updated_at)
  values ('81000000-0000-4000-8000-000000000008', '00000000-0000-4000-8000-000000000004',
    '31000000-0000-4000-8000-000000000005', 'volume', 110,
    '10000000-0000-4000-8000-000000000001', '2026-10-25', '2026-10-25')
$q$, 'valid session volume accepted');
select throws_ok($q$
  insert into public.pr_events (id, exercise_id, source_id, pr_type, value, user_id, local_date, client_updated_at)
  values ('81000000-0000-4000-8000-000000000009', '00000000-0000-4000-8000-000000000004',
    '31000000-0000-4000-8000-000000000004', 'volume', 50,
    '10000000-0000-4000-8000-000000000001', '2026-10-25', '2026-10-25')
$q$, '23514', 'pr_value_mismatch', 'partial session volume rejected');

-- Same shape as schema.test.sql: assisted pull-up, no bodyweight on or before the set.
select lives_ok($q$
  insert into public.pr_events (id, exercise_id, source_id, pr_type, value, user_id, local_date, client_updated_at)
  values ('81000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000011',
    '31000000-0000-4000-8000-000000000007', 'volume', -125,
    '10000000-0000-4000-8000-000000000001', '2026-10-25', '2026-10-25')
$q$, 'assisted pull-up volume is reps times added load');
select throws_ok($q$
  insert into public.pr_events (id, exercise_id, source_id, pr_type, value, user_id, local_date, client_updated_at)
  values ('81000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000011',
    '31000000-0000-4000-8000-000000000007', 'e1rm', 80,
    '10000000-0000-4000-8000-000000000001', '2026-10-25', '2026-10-25')
$q$, '23514', 'pr_value_mismatch', 'assisted pull-up without bodyweight has no e1RM');

insert into public.sets (id, session_id, exercise_id, set_index, reps, weight_kg, logged_at, user_id, local_date, client_updated_at) values
  ('31000000-0000-4000-8000-000000000008', '21000000-0000-4000-8000-000000000003',
   '00000000-0000-4000-8000-000000000011', 1, 1, 10, '2026-10-26 18:07+00',
   '10000000-0000-4000-8000-000000000001', '2026-10-26', '2026-10-26');
insert into public.bodyweight_entries (id, weight_kg, measured_at, user_id, local_date, client_updated_at) values
  ('71000000-0000-4000-8000-000000000001', 80, '2026-10-25 08:00+00',
   '10000000-0000-4000-8000-000000000001', '2026-10-25', '2026-10-25');
select lives_ok($q$
  insert into public.pr_events (id, exercise_id, source_id, pr_type, reps, value, user_id, local_date, client_updated_at)
  values ('81000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000011',
    '31000000-0000-4000-8000-000000000008', 'e1rm', 1, 90,
    '10000000-0000-4000-8000-000000000001', '2026-10-25', '2026-10-25')
$q$, 'bodyweight lift e1RM adds the logged bodyweight');

select lives_ok($q$
  insert into public.pr_events (id, exercise_id, source_id, pr_type, value, user_id, local_date, client_updated_at)
  values ('81000000-0000-4000-8000-000000000014', null,
    '41000000-0000-4000-8000-000000000001', 'distance', 5000,
    '10000000-0000-4000-8000-000000000001', '2026-10-26', '2026-10-26')
$q$, 'valid distance accepted');
select throws_ok($q$
  insert into public.pr_events (id, exercise_id, source_id, pr_type, value, user_id, local_date, client_updated_at)
  values ('81000000-0000-4000-8000-000000000015', null,
    '41000000-0000-4000-8000-000000000001', 'distance', 5001,
    '10000000-0000-4000-8000-000000000001', '2026-10-26', '2026-10-26')
$q$, '23514', 'pr_value_mismatch', 'forged distance rejected');
select lives_ok($q$
  insert into public.pr_events (id, exercise_id, source_id, pr_type, value, user_id, local_date, client_updated_at)
  values ('81000000-0000-4000-8000-000000000016', null,
    '41000000-0000-4000-8000-000000000001', 'pace', 300,
    '10000000-0000-4000-8000-000000000001', '2026-10-26', '2026-10-26')
$q$, 'valid pace accepted');
select throws_ok($q$
  insert into public.pr_events (id, exercise_id, source_id, pr_type, value, user_id, local_date, client_updated_at)
  values ('81000000-0000-4000-8000-000000000017', null,
    '41000000-0000-4000-8000-000000000001', 'pace', 299,
    '10000000-0000-4000-8000-000000000001', '2026-10-26', '2026-10-26')
$q$, '23514', 'pr_value_mismatch', 'forged pace rejected');

select throws_ok($q$
  insert into public.pr_events (id, exercise_id, source_id, pr_type, value, user_id, local_date, client_updated_at)
  values ('81000000-0000-4000-8000-000000000018', '00000000-0000-4000-8000-000000000001',
    '31000000-0000-4000-8000-000000000006', 'e1rm', 40,
    '10000000-0000-4000-8000-000000000001', '2026-10-25', '2026-10-25')
$q$, '23514', 'pr_value_mismatch', 'warm-up rejected');
select throws_ok($q$
  insert into public.pr_events (id, exercise_id, source_id, pr_type, reps, value, user_id, local_date, client_updated_at)
  values ('81000000-0000-4000-8000-000000000019', '00000000-0000-4000-8000-000000000001',
    '31000000-0000-4000-8000-000000000003', 'e1rm', 13, 100,
    '10000000-0000-4000-8000-000000000001', '2026-10-25', '2026-10-25')
$q$, '23514', 'pr_value_mismatch', 'e1RM above 12 reps rejected');

select lives_ok($q$
  update public.pr_events set seen_by = array['10000000-0000-4000-8000-000000000002']::uuid[],
    client_updated_at = '2026-10-26'
  where id = '81000000-0000-4000-8000-000000000001'
$q$, 'seen_by update keeps a matching claim');

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}';
select lives_ok($q$
  insert into public.pr_events (id, exercise_id, source_id, pr_type, reps, value, user_id, local_date, client_updated_at)
  values ('81000000-0000-4000-8000-000000000020', '00000000-0000-4000-8000-000000000001',
    '31000000-0000-4000-8000-000000000001', 'e1rm', 5, 70,
    '10000000-0000-4000-8000-000000000001', '2026-10-25', '2026-10-30')
$q$, 'owner insert under RLS accepted');
reset role;

select ok(not has_function_privilege('anon', 'public.check_pr_event()', 'execute'),
  'anonymous cannot execute check_pr_event');
select has_trigger('public', 'pr_events', 'c_check_pr_event', 'PR check trigger installed');

select * from finish();
rollback;
