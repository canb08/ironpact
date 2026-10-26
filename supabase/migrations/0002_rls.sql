-- A3: SPEC §4.4, with E4.2/E4.3/E4.7. Training deletes stay soft deletes.
create function public.is_crewmate(other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.crew_members a
    join public.crew_members b on b.crew_id = a.crew_id
    where a.user_id = (select auth.uid()) and b.user_id = other
      and a.left_at is null and b.left_at is null
  );
$$;

create function public.is_member(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.crew_members m
    where m.crew_id = c and m.user_id = (select auth.uid()) and m.left_at is null
  );
$$;

revoke all on function public.is_crewmate(uuid), public.is_member(uuid)
  from public, anon, authenticated;
grant execute on function public.is_crewmate(uuid), public.is_member(uuid) to authenticated;

-- Remove Supabase's broad default grants as well as enforcing RLS. No client
-- receives TRUNCATE, REFERENCES, TRIGGER, or privileges on server-only secrets.
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
  end loop;
  foreach t in array array['sessions','sets','cardio_entries','martial_entries',
    'min_entries','goals','pr_events','exercise_prefs'] loop
    execute format('grant select, insert, update on public.%I to authenticated', t);
    execute format($f$create policy %1$s_sel on public.%1$I for select to authenticated
      using (user_id = (select auth.uid()) or public.is_crewmate(user_id))$f$, t);
    execute format($f$create policy %1$s_ins on public.%1$I for insert to authenticated
      with check (user_id = (select auth.uid()))$f$, t);
    execute format($f$create policy %1$s_upd on public.%1$I for update to authenticated
      using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))$f$, t);
  end loop;
end;
$$;

grant select, insert, update on public.profiles, public.bodyweight_entries,
  public.exercises to authenticated;
grant select, insert on public.exercise_muscles, public.reactions,
  public.challenges, public.challenge_participants to authenticated;
grant select on public.crews, public.crew_members, public.crew_weeks,
  public.streak_tokens, public.nudges to authenticated;
grant select, delete on public.push_subscriptions to authenticated;

create policy prof_sel on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.is_crewmate(id));
create policy prof_ins on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));
create policy prof_upd on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy bw_sel on public.bodyweight_entries for select to authenticated
  using (user_id = (select auth.uid()) or (public.is_crewmate(user_id) and exists (
    select 1 from public.profiles p
    where p.id = bodyweight_entries.user_id and p.show_bodyweight
  )));
create policy bw_ins on public.bodyweight_entries for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy bw_upd on public.bodyweight_entries for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy ex_sel on public.exercises for select to authenticated
  using (owner_id is null or owner_id = (select auth.uid()) or public.is_crewmate(owner_id));
create policy ex_ins on public.exercises for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy ex_upd on public.exercises for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
-- A custom exercise's muscle mapping has the same visibility as its parent.
create policy exm_sel on public.exercise_muscles for select to authenticated
  using (exists (select 1 from public.exercises e where e.id = exercise_muscles.exercise_id));
create policy exm_ins on public.exercise_muscles for insert to authenticated
  with check (exists (select 1 from public.exercises e
    where e.id = exercise_muscles.exercise_id and e.owner_id = (select auth.uid())));

create policy crews_sel on public.crews for select to authenticated using (public.is_member(id));
create policy cm_sel on public.crew_members for select to authenticated using (public.is_member(crew_id));
create policy cw_sel on public.crew_weeks for select to authenticated using (public.is_member(crew_id));
create policy st_sel on public.streak_tokens for select to authenticated using (public.is_member(crew_id));

create policy rx_sel on public.reactions for select to authenticated
  using (user_id = (select auth.uid()) or to_user = (select auth.uid()));
create policy rx_ins on public.reactions for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_member(crew_id)
    and exists (select 1 from public.crew_members m
      where m.crew_id = reactions.crew_id and m.user_id = reactions.to_user and m.left_at is null));
-- Reactions are immutable to clients; mark_seen is a later authenticated RPC.
create policy nd_sel on public.nudges for select to authenticated
  using (from_user = (select auth.uid()) or to_user = (select auth.uid()));

create policy ch_sel on public.challenges for select to authenticated using (public.is_member(crew_id));
create policy ch_ins on public.challenges for insert to authenticated
  with check (created_by = (select auth.uid()) and public.is_member(crew_id) and status = 'proposed');
create policy cp_sel on public.challenge_participants for select to authenticated
  using (exists (select 1 from public.challenges c
    where c.id = challenge_participants.challenge_id and public.is_member(c.crew_id)));
-- E4.2: knowing a challenge UUID is not permission to join it.
create policy cp_ins on public.challenge_participants for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (
    select 1 from public.challenges c where c.id = challenge_participants.challenge_id
      and public.is_member(c.crew_id) and c.status = 'proposed'
  ));

-- E4.7: only the later save_push_subscription RPC may insert/reassign endpoints.
create policy ps_sel on public.push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));
create policy ps_del on public.push_subscriptions for delete to authenticated
  using (user_id = (select auth.uid()));

-- No client policies/grants on crew_invites, export_tokens, invite_attempts,
-- or push_log. In particular, token_hash cannot be selected by either client role.
-- Crews, membership, streak tokens, nudges and derived crew weeks are server-write-only.
