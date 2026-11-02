begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- The table inventory is the frozen SPEC §4.3 contract plus E4.3.
select has_table('public', t, t || ' exists') from unnest(array[
  'profiles','crews','crew_members','crew_invites','exercises','exercise_muscles',
  'exercise_prefs','sessions','sets','cardio_entries','martial_entries','bodyweight_entries',
  'min_entries','goals','pr_events','reactions','nudges','streak_tokens','crew_weeks',
  'challenges','challenge_participants','push_subscriptions','push_log','export_tokens',
  'invite_attempts'
]) as t;
select is((select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r','p') and not c.relrowsecurity),
  0::bigint, 'RLS is enabled dynamically on EVERY public table, including future tables');
select is((select count(*) from pg_policies where schemaname = 'public'
  and tablename in ('crew_invites','export_tokens','invite_attempts','push_log')), 0::bigint,
  'Secret and server-only tables have no client policies');
select hasnt_column('public','nudges','acted_on','E4.4 drops stored acted_on');
select hasnt_column('public','reactions','emoji','E2.4 replaces emoji');
select has_column('public','reactions','kind','E2.4 reaction kind exists');
select is((select count(*) from public.exercises where owner_id is null), 60::bigint,
  'seed supplies 60 global exercises');
select is((select count(*) from public.exercises e where owner_id is null and not exists
  (select 1 from public.exercise_muscles m where m.exercise_id = e.id)), 0::bigint,
  'every global exercise has muscle weights');
select is((select count(*) from public.exercises where owner_id is null and
  kind not in ('lift','bw_lift')), 0::bigint, 'all seeded exercises are lifts');
select ok((select aliases @> array['bench','bp'] from public.exercises where export_label = 'Bench'),
  'Bench includes shorthand aliases');

-- Only reserved test identities are used. Everything rolls back at the end.
insert into auth.users (id, email) values
  ('10000000-0000-4000-8000-000000000001','alice@example.test'),
  ('10000000-0000-4000-8000-000000000002','bob@example.test');
insert into public.profiles (id, display_name, initial, color_hue) values
  ('10000000-0000-4000-8000-000000000001', repeat('x',20), 'A', 125),
  ('10000000-0000-4000-8000-000000000002', 'B', 'B', 220);
select is((select export_format from public.profiles limit 1), 'lines', 'export defaults to lines');
select throws_ok($q$update public.profiles set display_name = repeat('x',21)$q$,
  '23514', null, 'E2.3 name longer than 20 rejected');
select throws_ok($q$update public.profiles set export_format = 'xml'$q$,
  '23514', null, 'only lines/json/csv export formats accepted');

insert into public.sessions (id, kind, started_at, tz, user_id, local_date, client_updated_at, readiness)
values
  ('20000000-0000-4000-8000-000000000001','gym','2026-10-25 22:30+00','Europe/Amsterdam',
   '10000000-0000-4000-8000-000000000001','2026-10-25','2026-10-26','{"sleep":1,"soreness":2,"energy":3}'),
  ('20000000-0000-4000-8000-000000000002','gym','2026-10-26 12:00+00','Europe/Amsterdam',
   '10000000-0000-4000-8000-000000000002','2026-10-26','2026-10-26',null);
select throws_ok($q$update public.sessions set readiness = '{"sleep":0,"soreness":2,"energy":3}'$q$,
  '23514', null, 'E2.2 readiness rejects zero');
select throws_ok($q$update public.sessions set readiness = '{"sleep":1,"soreness":2}'$q$,
  '23514', null, 'readiness cannot omit a row');
select throws_ok($q$update public.sessions set readiness = '{"sleep":1.5,"soreness":2,"energy":3}'$q$,
  '23514', null, 'readiness rejects fractional values');

insert into public.sets (id, session_id, exercise_id, set_index, reps, weight_kg, rpe,
  logged_at, user_id, local_date, client_updated_at, updated_at, received_at, note)
values ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001',1,5,60,5,'2026-10-26 00:15+00',
  '10000000-0000-4000-8000-000000000001','2026-10-26','2026-10-26','2000-01-01','2000-01-01','fresh');
select is((select local_date from public.sets limit 1), date '2026-10-25',
  'D9/E5.5 child inherits session date across midnight and DST');
select throws_ok($q$update public.sets set reps = 0$q$, '23514', null, 'zero reps rejected');
select throws_ok($q$update public.sets set reps = 101$q$, '23514', null, '101 reps rejected');
select throws_ok($q$update public.sets set rpe = 5.25$q$, '23514', null, 'RPE 5.25 rejected');
select throws_ok($q$update public.sets set rpe = 5.01$q$, '23514', null,
  'RPE cannot round an invalid fraction to an accepted half step');
select throws_ok($q$update public.sets set rpe = 4.5$q$, '23514', null, 'RPE below 5 rejected');
select throws_ok($q$update public.sets set rpe = 10.5$q$, '23514', null, 'RPE above 10 rejected');
select throws_ok($q$update public.sets set weight_kg = 501$q$, '23514', null, '501 kg rejected');
select throws_ok($q$update public.sets set weight_kg = -1$q$, '23514',
  'negative_weight_requires_bw_lift', 'negative load rejected on a lift');
select throws_ok($q$update public.sets set user_id = '10000000-0000-4000-8000-000000000002'$q$,
  '23514', 'owner_mismatch', 'child cannot change its owner to another user');
select throws_ok($q$update public.sets set session_id = '20000000-0000-4000-8000-000000000002'$q$,
  '23514', 'owner_mismatch', 'child cannot move to another user session');

with stale as (update public.sets set note = 'stale',
  client_updated_at = '2026-10-25' returning id)
select is(count(*), 0::bigint, 'E4.5 stale update returns no rows') from stale;
select is((select note from public.sets limit 1), 'fresh', 'stale write preserves payload');
select is((select updated_at from public.sets limit 1), timestamptz '2000-01-01',
  'stale write does not bump updated_at');
select is((select received_at from public.sets limit 1), timestamptz '2000-01-01',
  'stale write does not bump received_at');
update public.sets set note = 'newer', client_updated_at = '2026-10-27', rpe = 5.5;
select is((select note from public.sets limit 1), 'newer', 'newer edit wins');
select is((select updated_at from public.sets limit 1), now(), 'updated_at moves on accepted update');
select is((select received_at from public.sets limit 1), now(), 'received_at tracks accepted update');
update public.sets set note = 'tie', client_updated_at = '2026-10-27', local_date = '2026-10-28';
select is((select note from public.sets limit 1), 'tie', 'equal timestamps accept last arrival');
select is((select local_date from public.sets limit 1), date '2026-10-25',
  'child date cannot be overridden on update');
select lives_ok($q$update public.sets set exercise_id = '00000000-0000-4000-8000-000000000011',
  weight_kg = -25$q$, 'negative added load accepted for bodyweight lift');
select throws_ok($q$delete from public.exercises where id = '00000000-0000-4000-8000-000000000011'$q$,
  '23503', null, 'E4.1 referenced exercise cannot be deleted');

insert into public.cardio_entries (id,session_id,distance_m,duration_s,rpe,logged_at,user_id,local_date,client_updated_at)
values ('40000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',100,60,5,now(),
  '10000000-0000-4000-8000-000000000001','2026-10-28','2026-10-26');
insert into public.martial_entries (id,session_id,discipline,duration_min,rpe,logged_at,user_id,local_date,client_updated_at)
values ('50000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','BJJ',1,5,now(),
  '10000000-0000-4000-8000-000000000001','2026-10-28','2026-10-26');
insert into public.min_entries (id,session_id,description,duration_min,logged_at,user_id,local_date,client_updated_at)
values ('60000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Walk',20,now(),
  '10000000-0000-4000-8000-000000000001','2026-10-28','2026-10-26');
select is((select local_date from public.cardio_entries limit 1), date '2026-10-25','cardio inherits date');
select is((select local_date from public.martial_entries limit 1), date '2026-10-25','martial inherits date');
select is((select local_date from public.min_entries limit 1), date '2026-10-25','MIN inherits date');
select throws_ok($q$update public.cardio_entries set rpe = 5.25$q$, '23514', null,'cardio rejects invalid RPE');
select throws_ok($q$update public.martial_entries set rpe = 5.25$q$, '23514', null,'martial rejects invalid RPE');
select throws_ok($q$update public.cardio_entries set distance_m = 99$q$, '23514', null,'run lower bound');
select throws_ok($q$update public.martial_entries set duration_min = 481$q$, '23514', null,'martial upper bound');
select throws_ok($q$update public.martial_entries set discipline = 'rUn'$q$, '23514', null,'reserved discipline rejected');
select throws_ok($q$update public.martial_entries set discipline = 'bEnCh'$q$, '23514',
  'You already have one called that.', 'martial discipline cannot duplicate a global lift label');
select throws_ok($q$update public.martial_entries set discipline = 'Bad·Label'$q$, '23514', null,
  'discipline cannot contain export separator');

select throws_ok($q$insert into public.exercises (id,name,export_label,kind)
  values (gen_random_uuid(),'Test','Run','lift')$q$, '23514', null,'Run label rejected');
select throws_ok($q$insert into public.exercises (id,name,export_label,kind)
  values (gen_random_uuid(),'Test','wEiGhT','lift')$q$, '23514', null,'Weight label rejected case insensitively');
select throws_ok($q$insert into public.exercises (id,name,export_label,kind)
  values (gen_random_uuid(),'Test','MIN','lift')$q$, '23514', null,'MIN label rejected');
select throws_ok($q$insert into public.exercises (id,name,export_label,kind)
  values (gen_random_uuid(),'Test','Bad·Label','lift')$q$, '23514', null,'separator label rejected');
select throws_ok($q$insert into public.exercises (id,name,export_label,kind)
  values (gen_random_uuid(),'Test',repeat('x',25),'lift')$q$, '23514', null,'label longer than 24 rejected');
select throws_ok($q$insert into public.exercises (id,name,export_label,kind)
  values (gen_random_uuid(),'Test','bEnCh','lift')$q$, '23505', null,'active global labels unique ignoring case');
select throws_ok($q$insert into public.exercises (id,owner_id,name,export_label,kind)
  values (gen_random_uuid(),'10000000-0000-4000-8000-000000000001','Test','BJJ','lift')$q$,
  '23514','You already have one called that.','lift cannot duplicate existing personal martial discipline');
select lives_ok($q$update public.exercises set rep_target = 6 where export_label = 'Bench'$q$,
  'exercise timestamps work without a received_at column');

insert into public.bodyweight_entries (id,weight_kg,measured_at,user_id,local_date,client_updated_at)
values ('70000000-0000-4000-8000-000000000001',300,now(),
  '10000000-0000-4000-8000-000000000001','2026-10-26','2026-10-26');
select throws_ok($q$update public.bodyweight_entries set weight_kg = 301$q$,'23514',null,'301 kg bodyweight rejected');
select throws_ok($q$update public.bodyweight_entries set weight_kg = 29$q$,'23514',null,'29 kg bodyweight rejected');
select is((select local_date from public.bodyweight_entries limit 1),date '2026-10-26',
  'standalone bodyweight retains own local date');

-- P2F: assisted pull-up (−25 kg) with no bodyweight on or before the set date
-- has no e1RM. The session volume of that one working set is −125.
insert into public.pr_events (id,exercise_id,source_id,pr_type,value,user_id,local_date,client_updated_at)
values ('80000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000011',
  '30000000-0000-4000-8000-000000000001','volume',-125,
  '10000000-0000-4000-8000-000000000001','2026-10-25','2026-10-28');
update public.sets set deleted_at = now();
select ok((select deleted_at is not null from public.pr_events limit 1),
  'soft-deleting source also soft-deletes a newer PR event');

-- Inspect account deletion actions without implementing A3's delete-account RPC.
insert into public.crews (id,name,created_by) values
  ('90000000-0000-4000-8000-000000000001','Crew','10000000-0000-4000-8000-000000000002');
insert into public.crew_invites (crew_id,code_hash,created_by,used_by) values
  ('90000000-0000-4000-8000-000000000001','test-hash','10000000-0000-4000-8000-000000000001',
   '10000000-0000-4000-8000-000000000002');
delete from auth.users where id = '10000000-0000-4000-8000-000000000002';
select ok((select created_by is null from public.crews limit 1),'E4.1 crew survives deleted creator');
select ok((select used_by is null from public.crew_invites limit 1),'E4.1 deleted invite redeemer set null');
delete from public.sessions where id = '20000000-0000-4000-8000-000000000001';
select is((select count(*) from public.sets),0::bigint,'sets cascade with session');
select is((select count(*) from public.cardio_entries),0::bigint,'cardio cascades with session');
select is((select count(*) from public.martial_entries),0::bigint,'martial cascades with session');
select is((select count(*) from public.min_entries),0::bigint,'MIN cascades with session');

-- Printed for the acceptance table-to-column summary in the pull request.
select diag(table_name || ' -> ' || count(*) || ' columns')
from information_schema.columns where table_schema = 'public'
group by table_name order by table_name;
select * from finish();
rollback;
