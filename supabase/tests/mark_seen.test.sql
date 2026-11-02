begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, email) values
  ('10000000-0000-4000-8000-000000000001', 'alice@example.test'),
  ('10000000-0000-4000-8000-000000000002', 'bob@example.test'),
  ('10000000-0000-4000-8000-000000000003', null);
insert into public.crews (id, name, tz, created_by) values
  ('20000000-0000-4000-8000-000000000001', 'Crew', 'Europe/Amsterdam', '10000000-0000-4000-8000-000000000001');
insert into public.crew_members (crew_id, user_id, role) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'owner'),
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'member');
insert into public.sessions (id, kind, started_at, tz, user_id, local_date, client_updated_at) values
  ('30000000-0000-4000-8000-000000000001', 'gym', '2026-11-02', 'Europe/Amsterdam', '10000000-0000-4000-8000-000000000001', '2026-11-02', '2026-11-02');
insert into public.sets (id, session_id, exercise_id, set_index, reps, weight_kg, logged_at, user_id, local_date, client_updated_at) values
  ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 1, 5, 60, '2026-11-02', '10000000-0000-4000-8000-000000000001', '2026-11-02', '2026-11-02');
insert into public.pr_events (id, exercise_id, source_id, pr_type, reps, value, previous_value, pct_over_previous, user_id, local_date, client_updated_at, deleted_at) values
  ('50000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'e1rm', 5, 70, 60, 16.6667, '10000000-0000-4000-8000-000000000001', '2026-11-02', '2026-11-02', null),
  ('50000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'rep_max', 5, 60, 50, 20, '10000000-0000-4000-8000-000000000001', '2026-11-02', '2026-11-02', '2026-11-02');
insert into public.pr_events (id, exercise_id, source_id, pr_type, reps, value, user_id, local_date, client_updated_at)
select '50000000-0000-4000-8000-000000000003', exercise_id, source_id, pr_type, reps, value, user_id, local_date, client_updated_at
from public.pr_events where id = '50000000-0000-4000-8000-000000000001';
create temporary table original as select * from public.pr_events;
grant select on original to authenticated;

select ok(has_function_privilege('authenticated', 'public.mark_pr_events_seen(uuid[])', 'EXECUTE'), 'authenticated can execute');
select ok(not has_function_privilege('anon', 'public.mark_pr_events_seen(uuid[])', 'EXECUTE'), 'anon cannot execute');
select ok(not has_function_privilege('service_role', 'public.mark_pr_events_seen(uuid[])', 'EXECUTE'), 'service role has no execute grant');
select ok((select prosecdef from pg_proc where oid = 'public.mark_pr_events_seen(uuid[])'::regprocedure), 'security definer');
select ok((select proconfig @> array['search_path=""'] from pg_proc where oid = 'public.mark_pr_events_seen(uuid[])'::regprocedure), 'empty search path');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
select lives_ok($$select public.mark_pr_events_seen(array['50000000-0000-4000-8000-000000000001']::uuid[])$$, 'outsider IDs silently ignored');
reset role;
select is((select seen_by from public.pr_events where id = '50000000-0000-4000-8000-000000000001'), '{}'::uuid[], 'outsider cannot mark');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select public.mark_pr_events_seen(array['50000000-0000-4000-8000-000000000001']::uuid[]);
select is((select seen_by from public.pr_events where id = '50000000-0000-4000-8000-000000000001'), '{}'::uuid[], 'own PR is not a partner PR');
reset role;
-- Historic claims may disagree after a source edit: receipt-only appends must still work.
update public.sets set weight_kg = 65 where id = '40000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
update public.pr_events set seen_by = array['10000000-0000-4000-8000-000000000002']::uuid[];
select is((select seen_by from public.pr_events where id = '50000000-0000-4000-8000-000000000001'), '{}'::uuid[], 'direct partner UPDATE remains blocked by RLS');
select lives_ok($$select public.mark_pr_events_seen(array['50000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000099']::uuid[])$$, 'partner append accepts duplicates, stale claim and missing IDs');
select is((select seen_by from public.pr_events where id = '50000000-0000-4000-8000-000000000001'), array['10000000-0000-4000-8000-000000000002']::uuid[], 'caller appended exactly once');
select is((select seen_by from public.pr_events where id = '50000000-0000-4000-8000-000000000002'), '{}'::uuid[], 'deleted PR ignored');
select is((select to_jsonb(p) - array['seen_by','updated_at','received_at'] from public.pr_events p where id = '50000000-0000-4000-8000-000000000001'),
          (select to_jsonb(p) - array['seen_by','updated_at','received_at'] from original p where id = '50000000-0000-4000-8000-000000000001'), 'every owner claim field unchanged');
reset role;
create temporary table acknowledged as select * from public.pr_events;
grant select on acknowledged to authenticated;
set local role authenticated;
select public.mark_pr_events_seen(array['50000000-0000-4000-8000-000000000001']::uuid[]);
select results_eq('select * from public.pr_events order by id', 'select * from acknowledged order by id', 'repeat is a complete no-op');
select lives_ok('select public.mark_pr_events_seen(null)', 'null list is a no-op');
select lives_ok($$select public.mark_pr_events_seen('{}'::uuid[])$$, 'empty list is a no-op');
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select throws_ok($$update public.pr_events set value = 999 where id = '50000000-0000-4000-8000-000000000001'$$, '23514', 'pr_value_mismatch', 'owner cannot bypass claim guard');
select throws_ok($$update public.pr_events set seen_by = '{}' where id = '50000000-0000-4000-8000-000000000001'$$, '23514', 'pr_value_mismatch', 'ordinary owner seen-only update still checks claim');
reset role;
update public.crew_members set left_at = now() where user_id = '10000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select public.mark_pr_events_seen(array['50000000-0000-4000-8000-000000000003']::uuid[]);
reset role;
select results_eq('select * from public.pr_events order by id', 'select * from acknowledged order by id', 'former member cannot mutate receipts');
-- Owner's offline snapshot predates the partner receipt. Source deletion
-- cascades a tombstone first; PostgREST then performs INSERT ... ON CONFLICT.
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
update public.sets set deleted_at = now()
  where id = '40000000-0000-4000-8000-000000000001';
select lives_ok($q$
  insert into public.pr_events (id, exercise_id, source_id, pr_type, reps, value,
    previous_value, pct_over_previous, user_id, local_date, client_updated_at, deleted_at, seen_by)
  select id, exercise_id, source_id, pr_type, reps, value,
    previous_value, pct_over_previous, user_id, local_date, client_updated_at, now(), '{}'::uuid[]
  from original where id = '50000000-0000-4000-8000-000000000001'
  on conflict (id) do update set
    exercise_id = excluded.exercise_id, source_id = excluded.source_id,
    pr_type = excluded.pr_type, reps = excluded.reps, value = excluded.value,
    previous_value = excluded.previous_value, pct_over_previous = excluded.pct_over_previous,
    user_id = excluded.user_id, local_date = excluded.local_date,
    client_updated_at = excluded.client_updated_at, deleted_at = excluded.deleted_at,
    seen_by = excluded.seen_by
$q$, 'owner can upsert a stale-receipt tombstone after source deletion');
select is((select deleted_at from public.pr_events where id = '50000000-0000-4000-8000-000000000001'), now(), 'owner tombstone is stored');
select is((select seen_by from public.pr_events where id = '50000000-0000-4000-8000-000000000001'), array['10000000-0000-4000-8000-000000000002']::uuid[], 'stale owner upsert preserves partner receipt');
select lives_ok($q$update public.pr_events set seen_by = '{}'
  where id = '50000000-0000-4000-8000-000000000001'$q$, 'ordinary tombstone update accepts stale receipt metadata');
select is((select seen_by from public.pr_events where id = '50000000-0000-4000-8000-000000000001'), array['10000000-0000-4000-8000-000000000002']::uuid[], 'ordinary update also preserves partner receipt');
reset role;
select lives_ok($q$delete from auth.users where id = '10000000-0000-4000-8000-000000000002'$q$, 'account cleanup can still remove a real RPC receipt');
select is((select seen_by from public.pr_events where id = '50000000-0000-4000-8000-000000000001'), '{}'::uuid[], 'deleted viewer is scrubbed from server-owned receipts');
select * from finish();
rollback;
