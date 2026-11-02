begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();
select is((select schedule from cron.job where jobname = 'purge'), '30 3 * * *', 'daily purge scheduled');
select is((select command from cron.job where jobname = 'purge'), 'select public.purge_deleted_rows()', 'cron invokes purge');
select ok(not has_function_privilege('authenticated', 'public.purge_deleted_rows()', 'execute'), 'clients cannot purge');
select ok(not has_function_privilege('anon', 'public.purge_deleted_rows()', 'execute'), 'anonymous cannot purge');
insert into auth.users (id) values ('50000000-0000-4000-8000-000000000001');
insert into public.crews (id, name) values ('50000000-0000-4000-8000-000000000002', 'Purge');
create temp table ages as select i,
  case i when 1 then now() - interval '31 days' when 2 then now() - interval '29 days'
    when 3 then now() - interval '30 days' else null end as deleted_at from generate_series(1,4) i;
insert into public.exercises (id, name, export_label, kind, deleted_at)
select md5('purge-exercise-' || i)::uuid, 'Purge lift', 'Purge lift ' || i, 'lift', deleted_at from ages;
insert into public.sessions (id, user_id, kind, started_at, tz, local_date, client_updated_at, deleted_at)
select md5('purge-session-' || i)::uuid, '50000000-0000-4000-8000-000000000001', 'gym', now(), 'UTC', current_date, now(), deleted_at from ages;
insert into public.sets (id, user_id, local_date, client_updated_at, deleted_at, session_id, exercise_id, set_index, reps, weight_kg, logged_at)
select md5('purge-sets-' || i)::uuid, '50000000-0000-4000-8000-000000000001', current_date, now(), deleted_at, md5('purge-session-' || i)::uuid, md5('purge-exercise-' || i)::uuid, 1, 5, 80, now() from ages;
insert into public.cardio_entries (id, user_id, local_date, client_updated_at, deleted_at, session_id, distance_m, duration_s, logged_at)
select md5('purge-cardio_entries-' || i)::uuid, '50000000-0000-4000-8000-000000000001', current_date, now(), deleted_at, md5('purge-session-' || i)::uuid, 1000, 300, now() from ages;
insert into public.martial_entries (id, user_id, local_date, client_updated_at, deleted_at, session_id, discipline, duration_min, logged_at)
select md5('purge-martial_entries-' || i)::uuid, '50000000-0000-4000-8000-000000000001', current_date, now(), deleted_at, md5('purge-session-' || i)::uuid, 'BJJ', 60, now() from ages;
insert into public.min_entries (id, user_id, local_date, client_updated_at, deleted_at, session_id, description, logged_at)
select md5('purge-min_entries-' || i)::uuid, '50000000-0000-4000-8000-000000000001', current_date, now(), deleted_at, md5('purge-session-' || i)::uuid, 'Walk', now() from ages;
insert into public.bodyweight_entries (id, user_id, local_date, client_updated_at, deleted_at, weight_kg, measured_at)
select md5('purge-bodyweight_entries-' || i)::uuid, '50000000-0000-4000-8000-000000000001', current_date, now(), deleted_at, 80, now() from ages;
insert into public.exercise_prefs (id, user_id, local_date, client_updated_at, deleted_at, exercise_id, rest_s)
select md5('purge-exercise_prefs-' || i)::uuid, '50000000-0000-4000-8000-000000000001', current_date, now(), deleted_at, md5('purge-exercise-' || i)::uuid, 90 from ages;
insert into public.goals (id, user_id, local_date, client_updated_at, deleted_at, exercise_id, kind, target_value, unit, starts_on)
select md5('purge-goals-' || i)::uuid, '50000000-0000-4000-8000-000000000001', current_date, now(), deleted_at, md5('purge-exercise-' || i)::uuid, 'e1rm', 100, 'kg', current_date from ages;
insert into public.pr_events (id, user_id, local_date, client_updated_at, deleted_at, exercise_id, source_id, pr_type, value)
select md5('purge-pr_events-' || i)::uuid, '50000000-0000-4000-8000-000000000001', current_date, now(), deleted_at, md5('purge-exercise-' || i)::uuid, md5('purge-sets-' || i)::uuid, 'e1rm', 100 from ages;
insert into public.reactions (id, user_id, local_date, client_updated_at, deleted_at, crew_id, to_user, target_type, target_id, kind)
select md5('purge-reactions-' || i)::uuid, '50000000-0000-4000-8000-000000000001', current_date, now(), deleted_at, '50000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000001', 'set', md5('purge-sets-' || i)::uuid, 'chalk' from ages;
insert into public.streak_tokens (id, user_id, local_date, client_updated_at, deleted_at, crew_id, covers_user_id, kind, week_start)
select md5('purge-streak_tokens-' || i)::uuid, '50000000-0000-4000-8000-000000000001', current_date, now(), deleted_at, '50000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000001', 'spot', current_date - i * 7 from ages;
-- An expired parent must not cascade-delete a recent or live child.
insert into public.sessions (id, user_id, kind, started_at, tz, local_date, client_updated_at, deleted_at)
values ('50000000-0000-4000-8000-000000000003', '50000000-0000-4000-8000-000000000001', 'gym', now(), 'UTC', current_date, now(), now() - interval '31 days');
insert into public.sets (id, session_id, exercise_id, set_index, reps, weight_kg, logged_at, user_id, local_date, client_updated_at, deleted_at)
values ('50000000-0000-4000-8000-000000000004', '50000000-0000-4000-8000-000000000003', md5('purge-exercise-2')::uuid, 1, 5, 80, now(), '50000000-0000-4000-8000-000000000001', current_date, now(), now() - interval '29 days');
-- An old exercise referenced by a live preference must survive RESTRICT.
insert into public.exercises (id, name, export_label, kind, deleted_at)
values ('50000000-0000-4000-8000-000000000005', 'Referenced lift', 'Referenced lift', 'lift', now() - interval '31 days');
insert into public.exercise_prefs (id, exercise_id, rest_s, user_id, local_date, client_updated_at)
values ('50000000-0000-4000-8000-000000000006', '50000000-0000-4000-8000-000000000005', 90, '50000000-0000-4000-8000-000000000001', current_date, now());
select lives_ok('select public.purge_deleted_rows()', 'purge respects FKs');
select is((select count(*) from public.sessions where id = md5('purge-session-1')::uuid), 0::bigint, 'sessions: old tombstone purged');
select is((select count(*) from public.sessions where id in (select md5('purge-session-' || i)::uuid from ages where i > 1)), 3::bigint, 'sessions: recent, exact boundary and live rows kept');
select is((select count(*) from public.exercises where id = md5('purge-exercise-1')::uuid), 0::bigint, 'exercises: old tombstone purged');
select is((select count(*) from public.exercises where id in (select md5('purge-exercise-' || i)::uuid from ages where i > 1)), 3::bigint, 'exercises: recent, exact boundary and live rows kept');
select is((select count(*) from public.sets where id = md5('purge-sets-1')::uuid), 0::bigint, 'sets: old tombstone purged');
select is((select count(*) from public.sets where id in (select md5('purge-sets-' || i)::uuid from ages where i > 1)), 3::bigint, 'sets: recent, exact boundary and live rows kept');
select is((select count(*) from public.cardio_entries where id = md5('purge-cardio_entries-1')::uuid), 0::bigint, 'cardio_entries: old tombstone purged');
select is((select count(*) from public.cardio_entries where id in (select md5('purge-cardio_entries-' || i)::uuid from ages where i > 1)), 3::bigint, 'cardio_entries: recent, exact boundary and live rows kept');
select is((select count(*) from public.martial_entries where id = md5('purge-martial_entries-1')::uuid), 0::bigint, 'martial_entries: old tombstone purged');
select is((select count(*) from public.martial_entries where id in (select md5('purge-martial_entries-' || i)::uuid from ages where i > 1)), 3::bigint, 'martial_entries: recent, exact boundary and live rows kept');
select is((select count(*) from public.min_entries where id = md5('purge-min_entries-1')::uuid), 0::bigint, 'min_entries: old tombstone purged');
select is((select count(*) from public.min_entries where id in (select md5('purge-min_entries-' || i)::uuid from ages where i > 1)), 3::bigint, 'min_entries: recent, exact boundary and live rows kept');
select is((select count(*) from public.bodyweight_entries where id = md5('purge-bodyweight_entries-1')::uuid), 0::bigint, 'bodyweight_entries: old tombstone purged');
select is((select count(*) from public.bodyweight_entries where id in (select md5('purge-bodyweight_entries-' || i)::uuid from ages where i > 1)), 3::bigint, 'bodyweight_entries: recent, exact boundary and live rows kept');
select is((select count(*) from public.exercise_prefs where id = md5('purge-exercise_prefs-1')::uuid), 0::bigint, 'exercise_prefs: old tombstone purged');
select is((select count(*) from public.exercise_prefs where id in (select md5('purge-exercise_prefs-' || i)::uuid from ages where i > 1)), 3::bigint, 'exercise_prefs: recent, exact boundary and live rows kept');
select is((select count(*) from public.goals where id = md5('purge-goals-1')::uuid), 0::bigint, 'goals: old tombstone purged');
select is((select count(*) from public.goals where id in (select md5('purge-goals-' || i)::uuid from ages where i > 1)), 3::bigint, 'goals: recent, exact boundary and live rows kept');
select is((select count(*) from public.pr_events where id = md5('purge-pr_events-1')::uuid), 0::bigint, 'pr_events: old tombstone purged');
select is((select count(*) from public.pr_events where id in (select md5('purge-pr_events-' || i)::uuid from ages where i > 1)), 3::bigint, 'pr_events: recent, exact boundary and live rows kept');
select is((select count(*) from public.reactions where id = md5('purge-reactions-1')::uuid), 0::bigint, 'reactions: old tombstone purged');
select is((select count(*) from public.reactions where id in (select md5('purge-reactions-' || i)::uuid from ages where i > 1)), 3::bigint, 'reactions: recent, exact boundary and live rows kept');
select is((select count(*) from public.streak_tokens where id = md5('purge-streak_tokens-1')::uuid), 0::bigint, 'streak_tokens: old tombstone purged');
select is((select count(*) from public.streak_tokens where id in (select md5('purge-streak_tokens-' || i)::uuid from ages where i > 1)), 3::bigint, 'streak_tokens: recent, exact boundary and live rows kept');
select is((select count(*) from public.sessions where id = '50000000-0000-4000-8000-000000000003'), 1::bigint, 'parent with recent child retained');
select is((select count(*) from public.sets where id = '50000000-0000-4000-8000-000000000004'), 1::bigint, 'recent child retained');
select is((select count(*) from public.exercises where id = '50000000-0000-4000-8000-000000000005'), 1::bigint, 'referenced exercise retained');
select lives_ok('select public.purge_deleted_rows()', 'repeated purge is harmless');
select * from finish();
rollback;
