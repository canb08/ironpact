begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select is((select jsonb_agg(tablename order by tablename) from pg_publication_tables
  where pubname = 'supabase_realtime' and schemaname = 'public'),
  '["bodyweight_entries","cardio_entries","challenges","crew_weeks",
    "martial_entries","min_entries","nudges","pr_events","profiles","reactions","sessions","sets"]'::jsonb,
  'SPEC 4.5: all twelve source tables are published for Postgres Changes');
select ok((select relrowsecurity from pg_class where oid = 'realtime.messages'::regclass),
  'Realtime messages have row-level security enabled');

insert into auth.users (id, email) values
 ('10000000-0000-4000-8000-000000000001', 'alice@example.test'),
 ('10000000-0000-4000-8000-000000000002', 'bob@example.test'),
 ('10000000-0000-4000-8000-000000000003', null);
insert into public.crews (id, name) values
 ('90000000-0000-4000-8000-000000000001', 'Test crew'),
 ('90000000-0000-4000-8000-000000000002', 'Other crew');
insert into public.crew_members (crew_id, user_id, role) values
 ('90000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'owner'),
 ('90000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'member');
-- Realtime authorizes channels by probing messages under realtime.topic().
-- These nonempty rows prove visibility, rather than merely inspecting policies.
insert into realtime.messages (topic, extension, payload, event, private) values
 ('crew:90000000-0000-4000-8000-000000000001', 'broadcast', '{}', 'hype', true),
 ('crew:90000000-0000-4000-8000-000000000001', 'presence', '{}', 'track', true);
select set_config('realtime.topic', 'crew:90000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select is((select count(*) from realtime.messages), 2::bigint,
  'D-21: active crew member can receive broadcast and presence');
select lives_ok($q$insert into realtime.messages (topic, extension, payload, event, private)
  values ('crew:90000000-0000-4000-8000-000000000001', 'broadcast', '{}', 'hype', true)$q$,
  'D-21: active member can send broadcast');
select lives_ok($q$insert into realtime.messages (topic, extension, payload, event, private)
  values ('crew:90000000-0000-4000-8000-000000000001', 'presence', '{}', 'track', true)$q$,
  'D-21: active member can send presence');
select set_config('realtime.topic', 'crew:90000000-0000-4000-8000-000000000002', true);
select is((select count(*) from realtime.messages), 0::bigint, 'Member cannot read another crew channel');
select throws_ok($q$insert into realtime.messages (topic, extension, payload, event, private)
  values ('crew:90000000-0000-4000-8000-000000000002', 'broadcast', '{}', 'hype', true)$q$,
  '42501', null, 'Member cannot send to another crew channel');
select set_config('realtime.topic', 'crew:90000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
select is((select count(*) from realtime.messages), 0::bigint, 'D-21: non-member cannot read crew broadcast or presence');
select throws_ok($q$insert into realtime.messages (topic, extension, payload, event, private)
  values ('crew:90000000-0000-4000-8000-000000000001', 'broadcast', '{}', 'hype', true)$q$,
  '42501', null, 'D-21: non-member cannot send broadcast');
select throws_ok($q$insert into realtime.messages (topic, extension, payload, event, private)
  values ('crew:90000000-0000-4000-8000-000000000001', 'presence', '{}', 'track', true)$q$,
  '42501', null, 'D-21: non-member cannot send presence');
reset role;
update public.crew_members set left_at = now() where user_id = '10000000-0000-4000-8000-000000000002';
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
set local role authenticated;
select is((select count(*) from realtime.messages), 0::bigint, 'Departed member cannot read the crew channel');
select throws_ok($q$insert into realtime.messages (topic, extension, payload, event, private)
  values ('crew:90000000-0000-4000-8000-000000000001', 'presence', '{}', 'track', true)$q$,
  '42501', null, 'Departed member cannot send presence');
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('realtime.topic', 'crew:not-a-uuid', true);
select is((select count(*) from realtime.messages), 0::bigint, 'Malformed topic safely denies access without UUID casts');
select set_config('realtime.topic', '', true);
select is((select count(*) from realtime.messages), 0::bigint, 'Missing topic denies access');
reset role;
select diag('P3A Realtime: 14 assertions');
select * from finish();
rollback;
