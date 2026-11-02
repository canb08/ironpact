-- P3A: E5.5/E5.6. Credit dates are inherited session local_date values, not
-- timestamps converted to the crew zone. Open sessions can already earn credit.
create function public.week_credits(user_id uuid, week_start date) returns numeric
language plpgsql stable security invoker set search_path = '' as $$
declare total numeric;
begin
  if week_start is null or extract(isodow from week_start) <> 1 then
    raise exception 'invalid_week_start';
  end if;
  select coalesce(sum(least(d.credits, 2.0)), 0) into total
  from (
    select s.local_date, sum(case s.kind
      when 'min' then 0.5 * (select count(*) from public.min_entries e
        where e.session_id = s.id and e.user_id = s.user_id and e.deleted_at is null)
      when 'gym' then case when exists (select 1 from public.sets e
        where e.session_id = s.id and e.user_id = s.user_id
          and e.deleted_at is null and not e.is_warmup) then 1 else 0 end
      when 'run' then case when exists (select 1 from public.cardio_entries e
        where e.session_id = s.id and e.user_id = s.user_id and e.deleted_at is null) then 1 else 0 end
      when 'martial' then case when exists (select 1 from public.martial_entries e
        where e.session_id = s.id and e.user_id = s.user_id and e.deleted_at is null) then 1 else 0 end
      else 0 end) as credits
    from public.sessions s
    where s.user_id = week_credits.user_id and s.deleted_at is null
      and s.local_date >= week_start and s.local_date < week_start + 7
    group by s.local_date
  ) d;
  return total;
end;
$$;

-- All close/spot operations lock the crew, including retries. This serializes
-- plate totals and spot consumption with create/redeem/leave from 0003.
create function public.close_week(crew_id uuid, week_start date) returns void
language plpgsql security definer set search_path = '' as $$
declare
  crew public.crews%rowtype;
  member record;
  credit numeric;
  status text;
  spotter uuid;
  statuses jsonb := '{}'::jsonb;
  all_full boolean := true;
  uncovered_rest boolean := false;
  partial_week boolean := false;
  delta smallint;
  plates integer;
  previous public.crew_weeks%rowtype;
  later record;
begin
  if week_start is null or extract(isodow from week_start) <> 1 then
    raise exception 'invalid_week_start';
  end if;
  select * into crew from public.crews c where c.id = close_week.crew_id for update;
  if not found then raise exception 'crew_missing'; end if;
  if week_start < date_trunc('week', crew.created_at at time zone crew.tz)::date then
    raise exception 'week_before_crew';
  end if;
  -- An archived crew freezes its Bar. Never silently turn a departed duo into
  -- a solo streak. A member joining after this week must not affect its result.
  if exists (select 1 from public.crew_members m where m.crew_id = crew.id and m.left_at is not null) then
    return;
  end if;
  partial_week := week_start = date_trunc('week', crew.created_at at time zone crew.tz)::date;
  for member in
    select m.user_id, m.joined_at, p.weekly_target
    from public.crew_members m join public.profiles p on p.id = m.user_id
    where m.crew_id = crew.id and m.left_at is null
      and (m.joined_at at time zone crew.tz)::date < week_start + 7
    order by m.user_id
  loop
    credit := public.week_credits(member.user_id, week_start);
    status := case when credit >= member.weekly_target then 'FULL'
      when credit >= 0.5 then 'HELD' else 'REST' end;
    if (member.joined_at at time zone crew.tz)::date >= week_start then
      partial_week := true;
      if status = 'REST' then status := 'HELD'; end if;
    end if;
    spotter := null;
    if status = 'REST' then
      select t.user_id into spotter from public.streak_tokens t
      where t.crew_id = crew.id and t.week_start = close_week.week_start
        and t.kind = 'spot' and t.covers_user_id = member.user_id and t.deleted_at is null
      order by t.created_at, t.id limit 1;
      uncovered_rest := uncovered_rest or spotter is null;
    end if;
    all_full := all_full and status = 'FULL';
    statuses := statuses || jsonb_build_object(member.user_id::text,
      jsonb_build_object('credits', credit, 'target', member.weekly_target,
        'status', status, 'spotted_by', spotter));
  end loop;
  if statuses = '{}'::jsonb then return; end if;
  delta := case when all_full then 1 when uncovered_rest and not partial_week then -1 else 0 end;
  select * into previous from public.crew_weeks w
    where w.crew_id = crew.id and w.week_start = close_week.week_start;
  -- Exact retries don't rewrite computed_at or consume another token.
  if found and previous.statuses = statuses and previous.plate_delta = delta then return; end if;
  select w.plates_after into plates from public.crew_weeks w
    where w.crew_id = crew.id and w.week_start < close_week.week_start
    order by w.week_start desc limit 1;
  plates := greatest(0, coalesce(plates, 0) + delta);
  insert into public.crew_weeks as w (crew_id, week_start, statuses, plate_delta, plates_after)
    values (crew.id, week_start, statuses, delta, plates)
    on conflict on constraint crew_weeks_pkey do update set
      statuses = excluded.statuses, plate_delta = excluded.plate_delta,
      plates_after = excluded.plates_after, adjusted_after_edit = true, computed_at = now();
  -- Recomputing an older week must also preserve the floor at every later week.
  for later in select w.week_start, w.plate_delta from public.crew_weeks w
    where w.crew_id = crew.id and w.week_start > close_week.week_start order by w.week_start
  loop
    plates := greatest(0, plates + later.plate_delta);
    update public.crew_weeks w set plates_after = plates,
      adjusted_after_edit = true, computed_at = now()
      where w.crew_id = crew.id and w.week_start = later.week_start and w.plates_after <> plates;
  end loop;
end;
$$;

-- Private implementation with an injected instant for deterministic boundary
-- tests. Only the authenticated wrapper below exposes the server clock.
create function public.use_spot_at(week_start date, at_time timestamptz) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  caller uuid := auth.uid();
  crew public.crews%rowtype;
  local_now timestamp;
  target integer;
  covered uuid;
  token uuid;
begin
  if caller is null then raise exception 'unauthenticated'; end if;
  if week_start is null or extract(isodow from week_start) <> 1 then
    raise exception 'invalid_week_start';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('crew-user:' || caller::text, 0));
  select c.* into crew from public.crews c join public.crew_members m on m.crew_id = c.id
    where m.user_id = caller and m.left_at is null for update of c;
  if not found then raise exception 'not_in_crew'; end if;
  if exists (select 1 from public.crew_members m where m.crew_id = crew.id and m.left_at is not null) then
    raise exception 'crew_archived';
  end if;
  -- Outbox retries return the original token, including after the window closes.
  select t.id into token from public.streak_tokens t
    where t.crew_id = crew.id and t.user_id = caller and t.kind = 'spot'
      and t.week_start = use_spot_at.week_start and t.deleted_at is null;
  if found then return token; end if;
  local_now := at_time at time zone crew.tz;
  if at_time is null or local_now < week_start + interval '6 days 12 hours'
      or local_now >= week_start + interval '7 days' then
    raise exception 'spot_window_closed';
  end if;
  if exists (select 1 from public.crew_weeks w
    where w.crew_id = crew.id and w.week_start = use_spot_at.week_start) then
    raise exception 'week_closed';
  end if;
  if exists (select 1 from public.streak_tokens t where t.user_id = caller and t.kind = 'spot'
    and date_trunc('month', t.local_date) = date_trunc('month', local_now)) then
    raise exception 'spot_monthly_limit';
  end if;
  select p.weekly_target into target from public.profiles p where p.id = caller;
  if target is null or public.week_credits(caller, week_start) < target + 1 then
    raise exception 'spot_needs_extra_credit';
  end if;
  -- The one-argument RPC covers the first eligible partner (join order, then
  -- UUID). This also supports N>2 without spending a token on an already covered
  -- member; one tap always covers exactly one person.
  select m.user_id into covered from public.crew_members m
    where m.crew_id = crew.id and m.user_id <> caller and m.left_at is null
      and (m.joined_at at time zone crew.tz)::date < week_start
      and public.week_credits(m.user_id, week_start) = 0
      and not exists (select 1 from public.streak_tokens t where t.crew_id = crew.id
        and t.week_start = use_spot_at.week_start and t.kind = 'spot'
        and t.covers_user_id = m.user_id and t.deleted_at is null)
    order by m.joined_at, m.user_id limit 1;
  if not found then raise exception 'no_partner_needs_spot'; end if;
  token := gen_random_uuid();
  insert into public.streak_tokens (id, crew_id, kind, week_start, covers_user_id,
    user_id, local_date, client_updated_at, created_at)
    values (token, crew.id, 'spot', week_start, covered, caller, local_now::date, at_time, at_time);
  return token;
end;
$$;

create function public.use_spot(week_start date) returns uuid
language sql security definer set search_path = '' as $$
  select public.use_spot_at(week_start, now());
$$;

-- The one-hour local window includes fractional UTC offsets. Date arithmetic
-- constructs the previous Monday in the zone; no elapsed 168-hour subtraction.
create function public.close_due_weeks(at_time timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
declare crew record;
begin
  for crew in select c.id, (at_time at time zone c.tz) as local_now from public.crews c
    where extract(isodow from at_time at time zone c.tz) = 1
      and (at_time at time zone c.tz)::time >= time '00:05'
      and (at_time at time zone c.tz)::time < time '01:05'
      and (c.created_at at time zone c.tz)::date < (at_time at time zone c.tz)::date
    order by c.id
  loop
    perform public.close_week(crew.id, crew.local_now::date - 7);
  end loop;
end;
$$;

revoke all on function public.week_credits(uuid, date), public.close_week(uuid, date),
  public.use_spot_at(date, timestamptz), public.use_spot(date), public.close_due_weeks(timestamptz)
  from public, anon, authenticated;
-- week_credits is invoker: clients can only aggregate rows allowed by RLS.
grant execute on function public.week_credits(uuid, date), public.use_spot(date) to authenticated;
grant execute on function public.close_week(uuid, date), public.close_due_weeks(timestamptz) to service_role;

select cron.schedule('week-close', '5 * * * *', 'select public.close_due_weeks(now());');
