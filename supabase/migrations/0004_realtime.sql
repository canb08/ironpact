-- P3A: Postgres Changes still use each source table's existing RLS.
alter publication supabase_realtime add table
  public.sessions, public.sets, public.cardio_entries, public.martial_entries,
  public.min_entries, public.bodyweight_entries, public.pr_events,
  public.reactions, public.nudges, public.challenges, public.crew_weeks, public.profiles;

-- Clients join crew:{uuid} with config.private=true. Realtime sets the topic
-- while checking these policies for both broadcast and presence permissions.
create policy crew_topic_read on realtime.messages for select to authenticated using (
  extension in ('broadcast', 'presence') and exists (
    select 1 from public.crew_members m
    where m.user_id = (select auth.uid()) and m.left_at is null
      and (select realtime.topic()) = 'crew:' || m.crew_id::text
  )
);
create policy crew_topic_write on realtime.messages for insert to authenticated with check (
  extension in ('broadcast', 'presence') and exists (
    select 1 from public.crew_members m
    where m.user_id = (select auth.uid()) and m.left_at is null
      and (select realtime.topic()) = 'crew:' || m.crew_id::text
  )
);
