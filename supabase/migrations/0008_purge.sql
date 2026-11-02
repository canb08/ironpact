-- P5D: cleanup is part of Auth's hard-delete transaction, so failure rolls back
-- the whole account deletion. No client-callable service-role cleanup RPC.
create function public.delete_account_cleanup() returns trigger
language plpgsql security definer set search_path = '' as $$
declare exercise record; anonymous_label text;
begin
  update public.export_tokens set revoked_at = now() where user_id = old.id;
  delete from public.pr_events where user_id = old.id;
  delete from public.sets where user_id = old.id;
  delete from public.exercise_prefs where user_id = old.id;
  delete from public.goals where user_id = old.id;

  -- These references have no FK (JSON/arrays/derived UUIDs).
  update public.pr_events set seen_by = array_remove(seen_by, old.id)
    where old.id = any(seen_by);
  delete from public.streak_tokens where covers_user_id = old.id;
  update public.challenges set winner_user_id = null where winner_user_id = old.id;
  update public.crew_weeks w set statuses = coalesce((
    select jsonb_object_agg(s.key, case when s.value->>'spotted_by' = old.id::text
      then jsonb_set(s.value, '{spotted_by}', 'null'::jsonb) else s.value end)
    from jsonb_each(w.statuses - old.id::text) s
  ), '{}'::jsonb)
  where w.statuses ? old.id::text or exists (
    select 1 from jsonb_each(w.statuses) s where s.value->>'spotted_by' = old.id::text
  );

  -- A crewmate may have logged a custom exercise. Keep their training history,
  -- but remove its creator and all free text; never promote private labels into
  -- the global catalogue. A tombstone remains only while references require it.
  delete from public.exercise_muscles where exercise_id in (
    select id from public.exercises where owner_id = old.id
  );
  for exercise in select e.id from public.exercises e where e.owner_id = old.id and (
    exists (select 1 from public.sets where exercise_id = e.id) or
    exists (select 1 from public.pr_events where exercise_id = e.id) or
    exists (select 1 from public.exercise_prefs where exercise_id = e.id) or
    exists (select 1 from public.goals where exercise_id = e.id) or
    exists (select 1 from public.challenges where exercise_id = e.id and created_by <> old.id)
  ) for update loop
    anonymous_label := 'Deleted exercise';
    update public.exercises set owner_id = null, name = anonymous_label,
      export_label = anonymous_label, aliases = '{}', equipment = null,
      deleted_at = now(), client_updated_at = greatest(client_updated_at, now())
      where id = exercise.id;
  end loop;
  -- The remaining user rows cascade; crews.created_by/invites.used_by SET NULL.
  return old;
end;
$$;
revoke all on function public.delete_account_cleanup() from public, anon, authenticated;
create trigger delete_account_cleanup before delete on auth.users
for each row execute function public.delete_account_cleanup();

create function public.purge_deleted_rows() returns void
language plpgsql security definer set search_path = '' as $$
declare cutoff timestamptz := now() - interval '30 days';
begin
  delete from public.reactions where deleted_at < cutoff;
  delete from public.streak_tokens where deleted_at < cutoff;
  delete from public.pr_events where deleted_at < cutoff;
  delete from public.sets where deleted_at < cutoff;
  delete from public.cardio_entries where deleted_at < cutoff;
  delete from public.martial_entries where deleted_at < cutoff;
  delete from public.min_entries where deleted_at < cutoff;
  delete from public.bodyweight_entries where deleted_at < cutoff;
  delete from public.exercise_prefs where deleted_at < cutoff;
  delete from public.goals where deleted_at < cutoff;
  -- CASCADE must not bypass a child's own 30-day retention period.
  delete from public.sessions s where s.deleted_at < cutoff
    and not exists (select 1 from public.sets where session_id = s.id)
    and not exists (select 1 from public.cardio_entries where session_id = s.id)
    and not exists (select 1 from public.martial_entries where session_id = s.id)
    and not exists (select 1 from public.min_entries where session_id = s.id);
  delete from public.exercises e where e.deleted_at < cutoff
    and not exists (select 1 from public.sets where exercise_id = e.id)
    and not exists (select 1 from public.pr_events where exercise_id = e.id)
    and not exists (select 1 from public.exercise_prefs where exercise_id = e.id)
    and not exists (select 1 from public.goals where exercise_id = e.id)
    and not exists (select 1 from public.challenges where exercise_id = e.id);
end;
$$;
revoke all on function public.purge_deleted_rows() from public, anon, authenticated;
grant execute on function public.purge_deleted_rows() to service_role;
select cron.schedule('purge', '30 3 * * *', 'select public.purge_deleted_rows()');
