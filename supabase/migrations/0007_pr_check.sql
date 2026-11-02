-- P2F: re-check pr_events against the source set or run (§2 F7).
-- Reject a missing source, somebody else's source, a soft-deleted source, or a
-- claimed value that is not the source's Epley e1RM, rep-max, session volume,
-- distance, or pace. The client outbox dead-letters that row.
-- Formulas match src/core/e1rm.ts, volume.ts and prs.ts, including bodyweight
-- on bw_lift and warm-ups excluded. 0.005 covers a 2-decimal Epley (U-E1) and
-- the unrounded float the client stores.
-- 0001 cascade_pr_delete soft-deletes pr_events when the source is soft-deleted.
-- That update only stamps deleted_at, so an unchanged claim may become a
-- tombstone after its source is gone. A new claim against a deleted source still fails.

create function public.check_pr_event() returns trigger
language plpgsql set search_path = '' as $$
declare
  src_user uuid;
  src_deleted timestamptz;
  src_exercise uuid;
  src_reps smallint;
  src_weight numeric;
  src_warmup boolean;
  src_session uuid;
  src_local date;
  cardio_distance integer;
  cardio_duration integer;
  exercise_kind text;
  body_kg numeric;
  base_kg numeric;
  expected numeric;
  found_source boolean := false;
  unchanged_tombstone boolean;
begin
  unchanged_tombstone := tg_op = 'UPDATE'
    and new.deleted_at is not null
    and old.source_id = new.source_id
    and old.pr_type = new.pr_type
    and old.value = new.value
    and old.reps is not distinct from new.reps
    and old.exercise_id is not distinct from new.exercise_id
    and old.user_id = new.user_id
    and old.previous_value is not distinct from new.previous_value
    and old.pct_over_previous is not distinct from new.pct_over_previous
    and old.seen_by is not distinct from new.seen_by
    and old.local_date is not distinct from new.local_date;

  if new.pr_type in ('e1rm', 'rep_max', 'volume') then
    select s.user_id, s.deleted_at, s.exercise_id, s.reps, s.weight_kg, s.is_warmup,
           s.session_id, s.local_date
      into src_user, src_deleted, src_exercise, src_reps, src_weight, src_warmup,
           src_session, src_local
      from public.sets s
      where s.id = new.source_id;
    found_source := found;
  else
    select c.user_id, c.deleted_at, c.distance_m, c.duration_s
      into src_user, src_deleted, cardio_distance, cardio_duration
      from public.cardio_entries c
      where c.id = new.source_id;
    found_source := found;
  end if;

  if not found_source then
    raise exception 'pr_source_missing' using errcode = '23503';
  end if;
  if src_user is distinct from new.user_id then
    raise exception 'pr_owner_mismatch' using errcode = '23514';
  end if;
  if unchanged_tombstone then
    return new;
  end if;
  if src_deleted is not null then
    raise exception 'pr_source_deleted' using errcode = '23514';
  end if;

  if new.pr_type in ('e1rm', 'rep_max', 'volume') then
    select e.kind into exercise_kind from public.exercises e where e.id = src_exercise;
    select b.weight_kg into body_kg
      from public.bodyweight_entries b
      where b.user_id = src_user
        and b.deleted_at is null
        and b.local_date <= src_local
        and b.weight_kg > 0
      order by b.local_date desc, b.measured_at desc, b.id desc
      limit 1;
    if not found then
      body_kg := null;
    end if;

    if new.exercise_id is distinct from src_exercise then
      raise exception 'pr_source_mismatch' using errcode = '23514';
    end if;

    if new.pr_type = 'volume' then
      if new.reps is not null then
        raise exception 'pr_reps_mismatch' using errcode = '23514';
      end if;
      if src_warmup then
        expected := null;
      else
        select coalesce(sum(s.reps * (s.weight_kg + case
                 when exercise_kind = 'bw_lift' then coalesce(body_kg, 0) else 0 end)), 0)
          into expected
          from public.sets s
          where s.session_id = src_session
            and s.exercise_id = src_exercise
            and s.user_id = src_user
            and s.deleted_at is null
            and not s.is_warmup;
      end if;
    else
      if new.reps is not null and new.reps is distinct from src_reps then
        raise exception 'pr_reps_mismatch' using errcode = '23514';
      end if;
      if src_warmup or src_reps < 1 or src_reps > 12 then
        expected := null;
      elsif new.pr_type = 'rep_max' then
        expected := src_weight + case
          when exercise_kind = 'bw_lift' then coalesce(body_kg, 0) else 0 end;
      elsif exercise_kind = 'bw_lift' and body_kg is null then
        expected := null;
      else
        base_kg := src_weight + case when exercise_kind = 'bw_lift' then body_kg else 0 end;
        if base_kg < 0 then
          expected := null;
        elsif src_reps = 1 then
          expected := base_kg;
        else
          expected := base_kg * (1 + src_reps::numeric / 30);
        end if;
      end if;
    end if;
  else
    if new.exercise_id is not null or new.reps is not null then
      raise exception 'pr_source_mismatch' using errcode = '23514';
    end if;
    if new.pr_type = 'distance' then
      expected := cardio_distance;
    else
      expected := cardio_duration::numeric * 1000 / cardio_distance;
    end if;
  end if;

  if expected is null or abs(new.value - expected) > 0.005 then
    raise exception 'pr_value_mismatch' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.check_pr_event() from public, anon, authenticated;

create trigger c_check_pr_event
  before insert or update on public.pr_events
  for each row execute function public.check_pr_event();
