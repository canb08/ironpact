begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- These helpers run with the client role, so denied grants and empty RLS
-- results both prove that the client cannot read a table.
create function pg_temp.cannot_read(relation_name text) returns boolean
language plpgsql as $$
declare row_count bigint;
begin
  execute format('select count(*) from public.%I', relation_name) into row_count;
  return row_count = 0;
exception when insufficient_privilege then return true;
end;
$$;
grant execute on function pg_temp.cannot_read(text) to anon, authenticated;

select is((select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r','p') and not c.relrowsecurity),
  0::bigint, 'D-1: RLS enabled on every public table');
select is((select count(*) from pg_policies where schemaname = 'public'
  and (qual = 'true' or with_check = 'true')), 0::bigint,
  'No public policy grants unconditional user-data access');
select is((select count(*) from pg_policies where schemaname = 'public'
  and tablename in ('crew_invites','export_tokens','invite_attempts','push_log')),
  0::bigint, 'Secret and server-only tables have no client policies');
select is((select count(*) from pg_policies where schemaname = 'public'
  and tablename in ('crews','crew_members','crew_weeks','nudges','streak_tokens')
  and cmd <> 'SELECT'), 0::bigint, 'Crew and server-owned state has no client write policy');
select is((select count(*) from pg_policies where schemaname = 'public'
  and tablename = 'push_subscriptions' and cmd in ('ALL','INSERT','UPDATE')),
  0::bigint, 'E4.7: push subscriptions have no direct insert or update policy');

-- Check every shipped RPC/helper independently, and all future public functions
-- returning ordinary values for anonymous EXECUTE privilege.
select ok(p.prosecdef, p.proname || ': SECURITY DEFINER')
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in
 ('is_crewmate','is_member','create_crew','create_invite','redeem_invite','leave_crew',
  'create_export_token','revoke_export_token','list_export_tokens');
select ok(coalesce('search_path=""' = any(p.proconfig), false),
  p.proname || ': empty search_path')
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in
 ('is_crewmate','is_member','create_crew','create_invite','redeem_invite','leave_crew',
  'create_export_token','revoke_export_token','list_export_tokens');
select ok(not has_function_privilege('anon', p.oid, 'EXECUTE'),
  p.proname || ': anon cannot execute')
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public';
select ok(p.provolatile = 's', p.proname || ': membership helper is STABLE')
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('is_crewmate','is_member');

insert into auth.users (id,email) values
 ('10000000-0000-4000-8000-000000000001','alice@example.test'),
 ('10000000-0000-4000-8000-000000000002','bob@example.test'),
 ('10000000-0000-4000-8000-000000000003',null);
insert into public.profiles (id,display_name,initial,color_hue) values
 ('10000000-0000-4000-8000-000000000001','A','A',125),
 ('10000000-0000-4000-8000-000000000002','B','B',220);
insert into public.crews (id,name,created_by) values
 ('90000000-0000-4000-8000-000000000001','Test crew','10000000-0000-4000-8000-000000000001');
insert into public.crew_members (crew_id,user_id,role) values
 ('90000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','owner'),
 ('90000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','member');
insert into public.sessions (id,kind,started_at,tz,user_id,local_date,client_updated_at) values
 ('20000000-0000-4000-8000-000000000001','gym',now(),'Europe/Amsterdam','10000000-0000-4000-8000-000000000001','2026-10-25','2026-10-26'),
 ('20000000-0000-4000-8000-000000000002','gym',now(),'Europe/Amsterdam','10000000-0000-4000-8000-000000000002','2026-10-25','2026-10-26');
insert into public.sets (id,session_id,exercise_id,set_index,reps,weight_kg,logged_at,user_id,local_date,client_updated_at) values
 ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001',1,5,60,now(),'10000000-0000-4000-8000-000000000001','2026-10-25','2026-10-28'),
 ('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001',1,5,60,now(),'10000000-0000-4000-8000-000000000002','2026-10-25','2026-10-28');
insert into public.cardio_entries (id,session_id,distance_m,duration_s,logged_at,user_id,local_date,client_updated_at) values
 ('40000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',5000,1800,now(),'10000000-0000-4000-8000-000000000001','2026-10-25','2026-10-28');
insert into public.martial_entries (id,session_id,discipline,duration_min,logged_at,user_id,local_date,client_updated_at) values
 ('50000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','BJJ',60,now(),'10000000-0000-4000-8000-000000000001','2026-10-25','2026-10-28');
insert into public.min_entries (id,session_id,description,duration_min,logged_at,user_id,local_date,client_updated_at) values
 ('60000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Walk',20,now(),'10000000-0000-4000-8000-000000000001','2026-10-25','2026-10-28');
insert into public.bodyweight_entries (id,weight_kg,measured_at,user_id,local_date,client_updated_at) values
 ('70000000-0000-4000-8000-000000000001',80,now(),'10000000-0000-4000-8000-000000000002','2026-10-25','2026-10-26');
insert into public.exercises (id,owner_id,name,export_label,kind) values
 ('a0000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','Private lift','Private lift','lift');
insert into public.exercise_muscles (exercise_id,muscle,weight) values
 ('a0000000-0000-4000-8000-000000000001','chest',1);
insert into public.challenges (id,crew_id,created_by,kind,starts_on,ends_on,status) values
 ('b0000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','sessions','2026-10-26','2026-11-01','proposed'),
 ('b0000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','sessions','2026-10-26','2026-11-01','active');
-- Seed every table checked by the outsider test. Empty tables cannot prove
-- that a policy actually hides somebody else's data.
insert into public.crew_invites (crew_id,code_hash,created_by) values
 ('90000000-0000-4000-8000-000000000001',encode(extensions.digest('rls-invite-fixture','sha256'),'hex'),'10000000-0000-4000-8000-000000000001');
insert into public.exercise_prefs (id,exercise_id,rest_s,user_id,local_date,client_updated_at) values
 ('c0000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001',90,'10000000-0000-4000-8000-000000000001','2026-10-25','2026-10-28');
insert into public.goals (id,kind,target_value,unit,starts_on,user_id,local_date,client_updated_at) values
 ('c0000000-0000-4000-8000-000000000002','weekly_sessions',3,'sessions','2026-10-26','10000000-0000-4000-8000-000000000001','2026-10-26','2026-10-28');
insert into public.pr_events (id,exercise_id,source_id,pr_type,value,user_id,local_date,client_updated_at) values
 ('c0000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','e1rm',70,'10000000-0000-4000-8000-000000000001','2026-10-25','2026-10-28');
insert into public.reactions (id,crew_id,to_user,target_type,target_id,kind,user_id,local_date,client_updated_at) values
 ('c0000000-0000-4000-8000-000000000004','90000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','session','20000000-0000-4000-8000-000000000002','clean','10000000-0000-4000-8000-000000000001','2026-10-25','2026-10-28');
insert into public.nudges (id,crew_id,from_user,to_user,sent_on) values
 ('c0000000-0000-4000-8000-000000000005','90000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','2026-10-26');
insert into public.streak_tokens (id,crew_id,kind,week_start,covers_user_id,user_id,local_date,client_updated_at) values
 ('c0000000-0000-4000-8000-000000000006','90000000-0000-4000-8000-000000000001','spot','2026-10-26','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','2026-10-26','2026-10-28');
insert into public.crew_weeks (crew_id,week_start,statuses,plate_delta,plates_after) values
 ('90000000-0000-4000-8000-000000000001','2026-10-26','{}',0,0);
insert into public.challenge_participants (challenge_id,user_id) values
 ('b0000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001');
insert into public.push_subscriptions (user_id,endpoint,p256dh,auth) values
 ('10000000-0000-4000-8000-000000000001','https://push.example.test/fixture','synthetic-key','synthetic-auth');
insert into public.push_log (user_id,sent_on,count) values
 ('10000000-0000-4000-8000-000000000001','2026-10-26',1);
insert into public.export_tokens (user_id,token_hash,label) values
 ('10000000-0000-4000-8000-000000000001',encode(extensions.digest('rls-token-fixture','sha256'),'hex'),'Synthetic fixture');
insert into public.invite_attempts (user_id) values
 ('10000000-0000-4000-8000-000000000001');
select ok(not pg_temp.cannot_read(t), 'D-5: outsider test has protected fixture rows in ' || t)
from unnest(array['profiles','crews','crew_members','crew_invites','exercise_prefs','sessions','sets',
 'cardio_entries','martial_entries','bodyweight_entries','min_entries','goals','pr_events','reactions',
 'nudges','streak_tokens','crew_weeks','challenges','challenge_participants','push_subscriptions',
 'push_log','export_tokens','invite_attempts']) as t;

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is((select count(*) from public.sets where user_id = '10000000-0000-4000-8000-000000000002'),1::bigint,
 'D-4: A reads crewmate B sets');
select is((select count(*) from public.sessions where user_id = '10000000-0000-4000-8000-000000000002'),1::bigint,
 'D-4: A reads crewmate B sessions');
select throws_ok($q$insert into public.sets (id,session_id,exercise_id,set_index,reps,weight_kg,logged_at,user_id,local_date,client_updated_at)
 values (gen_random_uuid(),'20000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001',2,5,60,now(),'10000000-0000-4000-8000-000000000002','2026-10-25','2026-10-28')$q$,
 '23503','session_missing','D-2: A cannot insert a set with B user_id');
select throws_ok($q$update public.sessions set user_id = '10000000-0000-4000-8000-000000000002'
 where id = '20000000-0000-4000-8000-000000000001'$q$,'42501',null,
 'A cannot update own session to B user_id');
select throws_ok($q$insert into public.sets (id,session_id,exercise_id,set_index,reps,weight_kg,logged_at,user_id,local_date,client_updated_at)
 values ('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001',2,5,60,now(),'10000000-0000-4000-8000-000000000001','2026-10-25','2026-10-29')
 on conflict (id) do update set reps = excluded.reps$q$,'42501',null,
 'D-3: A cannot upsert over B existing row id');
with changed as (update public.sets set reps = 99 where user_id = '10000000-0000-4000-8000-000000000002' returning id)
select is((select count(*) from changed),0::bigint,'Crewmate cannot update B sets');
select throws_ok($q$insert into public.sets (id,session_id,exercise_id,set_index,reps,weight_kg,logged_at,user_id,local_date,client_updated_at)
 values (gen_random_uuid(),'20000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001',2,5,60,now(),'10000000-0000-4000-8000-000000000001','2026-10-25','2026-10-28')$q$,
 '23503','session_missing','D-9: A cannot attach a set to B session');
select is((select count(*) from public.bodyweight_entries),0::bigint,
 'D-6: B bodyweight hidden from A while show_bodyweight is false');
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}';
update public.profiles set show_bodyweight = true where id = '10000000-0000-4000-8000-000000000002';
select is((select count(*) from public.bodyweight_entries),1::bigint,'Owner reads own bodyweight');
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is((select count(*) from public.bodyweight_entries),1::bigint,
 'D-6: B bodyweight visible to A while show_bodyweight is true');

-- All children deliberately have a newer client timestamp than their parent.
-- Date propagation must not be swallowed by the child LWW trigger.
update public.sessions set local_date = '2026-10-24', client_updated_at = '2026-10-27'
 where id = '20000000-0000-4000-8000-000000000001';
select is((select local_date from public.sets where id = '30000000-0000-4000-8000-000000000001'),
 date '2026-10-24','S15: editing session date moves its sets despite newer child timestamp');
select is((select local_date from public.cardio_entries limit 1),date '2026-10-24','S15: editing session date moves cardio');
select is((select local_date from public.martial_entries limit 1),date '2026-10-24','S15: editing session date moves martial');
select is((select local_date from public.min_entries limit 1),date '2026-10-24','S15: editing session date moves MIN');
select is(child.client_updated_at,'2026-10-28'::timestamptz,
 'S15: editing session date preserves ' || child.relation_name || ' client timestamp')
from (
 select 'sets' as relation_name,client_updated_at from public.sets where id = '30000000-0000-4000-8000-000000000001'
 union all select 'cardio',client_updated_at from public.cardio_entries
 union all select 'martial',client_updated_at from public.martial_entries
 union all select 'MIN',client_updated_at from public.min_entries
) child;
select is((select local_date from public.sets where id = '30000000-0000-4000-8000-000000000002'),
 date '2026-10-25','S15: editing A session leaves B sets unchanged');
select throws_ok($q$delete from public.sets$q$,'42501',null,
 'D-7: clients cannot hard-delete training sets');
select lives_ok($q$update public.sets set deleted_at = now(),client_updated_at = '2026-10-29'
 where id = '30000000-0000-4000-8000-000000000001'$q$,'Owner can soft-delete own training set');
select ok((select deleted_at is not null from public.sets where id = '30000000-0000-4000-8000-000000000001'),
 'Owner soft-delete persists');
-- A second date edit must also move every tombstoned child without changing
-- its deletion marker or its own edit timestamp.
update public.sets set deleted_at = '2026-10-29',client_updated_at = '2026-10-29'
 where id = '30000000-0000-4000-8000-000000000001';
update public.cardio_entries set deleted_at = '2026-10-29',client_updated_at = '2026-10-29';
update public.martial_entries set deleted_at = '2026-10-29',client_updated_at = '2026-10-29';
update public.min_entries set deleted_at = '2026-10-29',client_updated_at = '2026-10-29';
update public.sessions set local_date = '2026-10-23',client_updated_at = '2026-10-30'
 where id = '20000000-0000-4000-8000-000000000001';
select is(child.local_date,date '2026-10-23',
 'S15: editing session date moves tombstoned ' || child.relation_name)
from (
 select 'sets' as relation_name,local_date from public.sets where id = '30000000-0000-4000-8000-000000000001'
 union all select 'cardio',local_date from public.cardio_entries
 union all select 'martial',local_date from public.martial_entries
 union all select 'MIN',local_date from public.min_entries
) child;
select is(child.client_updated_at,'2026-10-29'::timestamptz,
 'S15: editing session date preserves tombstoned ' || child.relation_name || ' client timestamp')
from (
 select 'sets' as relation_name,client_updated_at from public.sets where id = '30000000-0000-4000-8000-000000000001'
 union all select 'cardio',client_updated_at from public.cardio_entries
 union all select 'martial',client_updated_at from public.martial_entries
 union all select 'MIN',client_updated_at from public.min_entries
) child;
select is(child.deleted_at,'2026-10-29'::timestamptz,
 'S15: editing session date preserves ' || child.relation_name || ' tombstone')
from (
 select 'sets' as relation_name,deleted_at from public.sets where id = '30000000-0000-4000-8000-000000000001'
 union all select 'cardio',deleted_at from public.cardio_entries
 union all select 'martial',deleted_at from public.martial_entries
 union all select 'MIN',deleted_at from public.min_entries
) child;

set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}';
select ok(pg_temp.cannot_read(t), 'D-5: non-member C reads no rows from ' || t)
from unnest(array['profiles','crews','crew_members','crew_invites','exercise_prefs','sessions','sets',
 'cardio_entries','martial_entries','bodyweight_entries','min_entries','goals','pr_events','reactions',
 'nudges','streak_tokens','crew_weeks','challenges','challenge_participants','push_subscriptions',
 'push_log','export_tokens','invite_attempts']) as t;
select is((select count(*) from public.exercises where owner_id is not null),0::bigint,
 'D-5: non-member C cannot read personal exercises');
select is((select count(*) from public.exercise_muscles where exercise_id = 'a0000000-0000-4000-8000-000000000001'),0::bigint,
 'D-5: non-member C cannot read personal exercise muscles');
select is((select count(*) from public.exercises where owner_id is null),60::bigint,
 'Every authenticated user can read global exercises');
select throws_ok($q$insert into public.challenge_participants (challenge_id,user_id)
 values ('b0000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003')$q$,
 '42501',null,'E4.2: outsider cannot join another crew challenge');
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok($q$insert into public.challenge_participants (challenge_id,user_id)
 values ('b0000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002')$q$,
 '42501',null,'E4.2: member cannot join an already active challenge');
select lives_ok($q$insert into public.challenge_participants (challenge_id,user_id)
 values ('b0000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002')$q$,
 'E4.2: member can join own crew proposed challenge');
select lives_ok($q$select public.leave_crew('90000000-0000-4000-8000-000000000001')$q$,
 'Member can leave crew');
select is((select count(*) from public.sets where user_id = '10000000-0000-4000-8000-000000000001'),0::bigint,
 'D-15: former member B loses A training reads');
select is((select count(*) from public.sets where user_id = '10000000-0000-4000-8000-000000000002'),1::bigint,
 'D-15: former member retains own history');
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is((select count(*) from public.sets where user_id = '10000000-0000-4000-8000-000000000002'),0::bigint,
 'D-15: remaining member A loses former member B training reads');
select is((select count(*) from public.bodyweight_entries),0::bigint,
 'D-15: sharing bodyweight does not expose a former member');

reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select ok(pg_temp.cannot_read(tablename), 'Anon cannot read table ' || tablename)
from pg_tables where schemaname = 'public' order by tablename;
reset role;
select * from finish();
rollback;
