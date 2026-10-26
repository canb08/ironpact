-- A2: SPEC §4.3, with §10 overrides. Client UUIDs have no server default.
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_cron;
create extension if not exists pg_net;

create type public.muscle_t as enum ('chest','front_delts','side_delts','rear_delts','biceps',
  'triceps','forearms','lats','upper_back','traps','lower_back','abs','obliques','glutes',
  'quads','hamstrings','adductors','calves');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 20 and display_name !~ '·'),
  initial text not null check (char_length(initial) = 1),
  color_hue smallint not null check (color_hue between 0 and 359),   -- Volt≈125, Ice≈220
  tz text not null default 'Europe/Amsterdam',
  weekly_target smallint not null default 3 check (weekly_target between 1 and 7),
  show_bodyweight boolean not null default false,
  share_dots boolean not null default false,
  sound_on boolean not null default false,
  haptics_on boolean not null default true,
  reduce_motion boolean not null default false,
  battery_saver boolean not null default false,
  big_jumps boolean not null default false,
  theme text not null default 'dark' check (theme in ('dark','light','system')),
  quiet_start time not null default '22:00', quiet_end time not null default '08:00',
  notify jsonb not null default
    '{"partner_start":false,"partner_pr":true,"nudge":true,"recap":true,"spot":true}',
  min_default_label text not null default '20m walk' check (char_length(min_default_label) between 1 and 40),
  gym_treat_url text check (gym_treat_url ~ '^https://'),
  bar_kg numeric(5,2) not null default 20,
  plates_kg numeric[] not null default '{25,20,15,10,5,2.5,1.25}',
  export_format text not null default 'lines' check (export_format in ('lines','json','csv')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.crews (
  id uuid primary key, name text not null check (char_length(name) between 1 and 24),
  tz text not null default 'Europe/Amsterdam', max_members smallint not null default 8,
  created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now());

create table public.crew_members (
  crew_id uuid not null references public.crews(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','member')),
  joined_at timestamptz not null default now(), left_at timestamptz,
  primary key (crew_id, user_id));
create index on public.crew_members(user_id);

create table public.crew_invites (
  id uuid primary key default gen_random_uuid(),
  crew_id uuid not null references public.crews(id) on delete cascade,
  code_hash text not null unique,                       -- sha256 hex of the normalised code
  created_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null default now() + interval '7 days',
  used_by uuid references auth.users(id) on delete set null, used_at timestamptz, revoked_at timestamptz,
  created_at timestamptz not null default now());

create table public.exercises (
  id uuid primary key, owner_id uuid references auth.users(id) on delete cascade,   -- null = global seed
  name text not null check (char_length(name) between 1 and 40),
  export_label text not null check (char_length(export_label) between 1 and 24 and export_label !~ '·' and lower(export_label) not in ('weight','run','min')),
  aliases text[] not null default '{}',
  kind text not null check (kind in ('lift','bw_lift','run','martial')),
  category text not null default 'compound' check (category in ('compound','isolation')),
  lower_body boolean not null default false,          -- drives F5 big jumps
  equipment text, increment_kg numeric(4,2) not null default 2.5,
  rep_target smallint not null default 5 check (rep_target between 1 and 100),
  client_updated_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted_at timestamptz, created_at timestamptz not null default now());
create unique index exercises_label_uq on public.exercises
  (coalesce(owner_id,'00000000-0000-0000-0000-000000000000'::uuid), lower(export_label))
  where deleted_at is null;

create table public.exercise_muscles (
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  muscle public.muscle_t not null, weight numeric(2,1) not null check (weight in (1.0, 0.5)),
  primary key (exercise_id, muscle));

create table public.exercise_prefs (id uuid primary key, exercise_id uuid not null references public.exercises(id) on delete restrict,
  rest_s smallint not null check (rest_s between 15 and 600) ,
  user_id           uuid not null references auth.users(id) on delete cascade,
  local_date        date not null,              -- see D9
  client_updated_at timestamptz not null,
  updated_at        timestamptz not null default now(),
  received_at       timestamptz not null default now(),
  deleted_at        timestamptz,
  created_at        timestamptz not null default now(), unique (user_id, exercise_id));

create table public.sessions (
  id uuid primary key,
  kind text not null check (kind in ('gym','run','martial','min')),
  mode text not null default 'full' check (mode in ('full','min')),
  started_at timestamptz not null, ended_at timestamptz, tz text not null,
  readiness jsonb check (readiness is null or coalesce(
    jsonb_typeof(readiness) = 'object'
    and readiness->'sleep' in ('1'::jsonb, '2'::jsonb, '3'::jsonb)
    and readiness->'soreness' in ('1'::jsonb, '2'::jsonb, '3'::jsonb)
    and readiness->'energy' in ('1'::jsonb, '2'::jsonb, '3'::jsonb), false)),
  together_id uuid, note text check (char_length(note) <= 200)
  ,
  user_id           uuid not null references auth.users(id) on delete cascade,
  local_date        date not null,              -- see D9
  client_updated_at timestamptz not null,
  updated_at        timestamptz not null default now(),
  received_at       timestamptz not null default now(),
  deleted_at        timestamptz,
  created_at        timestamptz not null default now());

create table public.sets (
  id uuid primary key, session_id uuid not null references public.sessions(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete restrict,
  set_index smallint not null check (set_index >= 1),
  reps smallint not null check (reps between 1 and 100),
  weight_kg numeric(6,2) not null check (weight_kg between -250 and 500),  -- bw_lift: ADDED load
  rpe numeric check (rpe between 5 and 10 and rpe * 2 = trunc(rpe * 2)),
  is_warmup boolean not null default false,
  note text check (char_length(note) <= 120), logged_at timestamptz not null
  ,
  user_id           uuid not null references auth.users(id) on delete cascade,
  local_date        date not null,              -- see D9
  client_updated_at timestamptz not null,
  updated_at        timestamptz not null default now(),
  received_at       timestamptz not null default now(),
  deleted_at        timestamptz,
  created_at        timestamptz not null default now());
create index on public.sets(user_id, exercise_id, logged_at desc);

create table public.cardio_entries (
  id uuid primary key, session_id uuid not null references public.sessions(id) on delete cascade,
  activity text not null default 'Run' check (activity = 'Run'),
  distance_m integer not null check (distance_m between 100 and 100000),
  duration_s integer not null check (duration_s between 1 and 86400),
  rpe numeric check (rpe between 5 and 10 and rpe*2 = trunc(rpe*2)),
  note text check (char_length(note) <= 120), logged_at timestamptz not null ,
  user_id           uuid not null references auth.users(id) on delete cascade,
  local_date        date not null,              -- see D9
  client_updated_at timestamptz not null,
  updated_at        timestamptz not null default now(),
  received_at       timestamptz not null default now(),
  deleted_at        timestamptz,
  created_at        timestamptz not null default now());

create table public.martial_entries (
  id uuid primary key, session_id uuid not null references public.sessions(id) on delete cascade,
  discipline text not null check (char_length(discipline) between 1 and 16 and discipline !~ '·' and lower(discipline) not in ('weight','run','min')),
  duration_min smallint not null check (duration_min between 1 and 480),
  rounds smallint check (rounds between 1 and 99),
  rpe numeric check (rpe between 5 and 10 and rpe*2 = trunc(rpe*2)),
  note text check (char_length(note) <= 120), logged_at timestamptz not null ,
  user_id           uuid not null references auth.users(id) on delete cascade,
  local_date        date not null,              -- see D9
  client_updated_at timestamptz not null,
  updated_at        timestamptz not null default now(),
  received_at       timestamptz not null default now(),
  deleted_at        timestamptz,
  created_at        timestamptz not null default now());

create table public.bodyweight_entries (
  id uuid primary key,                                  -- uuidv5(user_id:local_date), see §4.6
  weight_kg numeric(4,1) not null check (weight_kg between 30 and 300),
  measured_at timestamptz not null ,
  user_id           uuid not null references auth.users(id) on delete cascade,
  local_date        date not null,              -- see D9
  client_updated_at timestamptz not null,
  updated_at        timestamptz not null default now(),
  received_at       timestamptz not null default now(),
  deleted_at        timestamptz,
  created_at        timestamptz not null default now());
create index on public.bodyweight_entries(user_id, measured_at desc);

create table public.min_entries (
  id uuid primary key, session_id uuid not null references public.sessions(id) on delete cascade,
  description text not null check (char_length(description) between 1 and 40),
  duration_min smallint check (duration_min between 1 and 480), logged_at timestamptz not null ,
  user_id           uuid not null references auth.users(id) on delete cascade,
  local_date        date not null,              -- see D9
  client_updated_at timestamptz not null,
  updated_at        timestamptz not null default now(),
  received_at       timestamptz not null default now(),
  deleted_at        timestamptz,
  created_at        timestamptz not null default now());

create table public.goals (id uuid primary key,
  kind text not null check (kind in ('weekly_sessions','e1rm','bodyweight','run_distance')),
  exercise_id uuid references public.exercises(id), target_value numeric not null, unit text not null,
  starts_on date not null, ends_on date, achieved_at timestamptz ,
  user_id           uuid not null references auth.users(id) on delete cascade,
  local_date        date not null,              -- see D9
  client_updated_at timestamptz not null,
  updated_at        timestamptz not null default now(),
  received_at       timestamptz not null default now(),
  deleted_at        timestamptz,
  created_at        timestamptz not null default now());

create table public.pr_events (id uuid primary key, exercise_id uuid references public.exercises(id) on delete restrict,
  source_id uuid not null, pr_type text not null check (pr_type in ('e1rm','rep_max','volume','distance','pace')),
  reps smallint, value numeric not null, previous_value numeric, pct_over_previous numeric,
  seen_by uuid[] not null default '{}' ,
  user_id           uuid not null references auth.users(id) on delete cascade,
  local_date        date not null,              -- see D9
  client_updated_at timestamptz not null,
  updated_at        timestamptz not null default now(),
  received_at       timestamptz not null default now(),
  deleted_at        timestamptz,
  created_at        timestamptz not null default now());

create table public.reactions (id uuid primary key, crew_id uuid not null references public.crews(id),
  to_user uuid not null references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('set','session','pr_event')), target_id uuid not null,
  kind text not null check (kind in ('light_weight','clean','again','chalk')), seen_at timestamptz ,
  user_id           uuid not null references auth.users(id) on delete cascade,
  local_date        date not null,              -- see D9
  client_updated_at timestamptz not null,
  updated_at        timestamptz not null default now(),
  received_at       timestamptz not null default now(),
  deleted_at        timestamptz,
  created_at        timestamptz not null default now(),
  unique (user_id, target_id, kind));

create table public.nudges (id uuid primary key, crew_id uuid not null references public.crews(id),
  from_user uuid not null references auth.users(id) on delete cascade, to_user uuid not null references auth.users(id) on delete cascade,
  template_key text not null default 'gym_open', sent_on date not null, seen_at timestamptz,
  created_at timestamptz not null default now(), unique (from_user, to_user, sent_on));

create table public.streak_tokens (id uuid primary key, crew_id uuid not null references public.crews(id),
  kind text not null check (kind in ('spot','freeze')), week_start date not null, covers_user_id uuid not null
  ,
  user_id           uuid not null references auth.users(id) on delete cascade,
  local_date        date not null,              -- see D9
  client_updated_at timestamptz not null,
  updated_at        timestamptz not null default now(),
  received_at       timestamptz not null default now(),
  deleted_at        timestamptz,
  created_at        timestamptz not null default now(), unique (crew_id, user_id, kind, week_start));

create table public.crew_weeks (crew_id uuid not null references public.crews(id), week_start date not null,
  statuses jsonb not null,            -- {"<user_id>":{"credits":3.5,"target":3,"status":"FULL|HELD|REST","spotted_by":null}}
  plate_delta smallint not null check (plate_delta between -1 and 1), plates_after integer not null check (plates_after >= 0),
  adjusted_after_edit boolean not null default false, computed_at timestamptz not null default now(),
  primary key (crew_id, week_start));

create table public.challenges (id uuid primary key, crew_id uuid not null references public.crews(id),
  created_by uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('e1rm_pct','sessions','run_km','season')), exercise_id uuid,
  starts_on date not null check (extract(isodow from starts_on) = 1), ends_on date not null,
  stake_text text check (char_length(stake_text) <= 80),
  status text not null check (status in ('proposed','active','settled','cancelled')),
  winner_user_id uuid, settled_at timestamptz, updated_at timestamptz not null default now(),
  created_at timestamptz not null default now());
create table public.challenge_participants (challenge_id uuid references public.challenges(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade, accepted_at timestamptz, baseline_value numeric,
  final_value numeric, score numeric, primary key (challenge_id, user_id));

create table public.push_subscriptions (id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade, endpoint text not null unique,
  p256dh text not null, auth text not null, ua text, created_at timestamptz not null default now(),
  last_ok_at timestamptz, fail_count smallint not null default 0);

create table public.push_log (user_id uuid not null references auth.users(id) on delete cascade,
  sent_on date not null, count smallint not null default 0, primary key (user_id, sent_on));

create table public.export_tokens (id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique, label text not null default 'My vault' check (char_length(label) <= 32),
  created_at timestamptz not null default now(), revoked_at timestamptz, last_used_at timestamptz,
  window_start timestamptz not null default now(), window_count integer not null default 0);

-- E4.3: server-owned rate-limit records; no client policies in this migration.
create table public.invite_attempts (
  user_id uuid not null references auth.users(id) on delete cascade,
  at timestamptz not null default now()
);
create index invite_attempts_user_at_idx on public.invite_attempts (user_id, at desc);

-- JSON record population preserves the exact contract: exercises/profiles/challenges
-- have updated_at but no received_at. Unknown fields are ignored by PostgreSQL.
create function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new := jsonb_populate_record(new, jsonb_build_object('updated_at', now(), 'received_at', now()));
  return new;
end;
$$;

create function public.lww_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.client_updated_at < old.client_updated_at then return null; end if;
  return new;
end;
$$;

create function public.enforce_owner() returns trigger
language plpgsql set search_path = '' as $$
declare parent public.sessions%rowtype;
begin
  select * into parent from public.sessions where id = new.session_id;
  if not found then raise exception 'session_missing' using errcode = '23503'; end if;
  if parent.user_id <> new.user_id then raise exception 'owner_mismatch' using errcode = '23514'; end if;
  new.local_date := parent.local_date;
  return new;
end;
$$;

create function public.enforce_bw_negative() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.weight_kg < 0 and not exists (
    select 1 from public.exercises where id = new.exercise_id and kind = 'bw_lift'
  ) then raise exception 'negative_weight_requires_bw_lift' using errcode = '23514'; end if;
  return new;
end;
$$;

create function public.cascade_pr_delete() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.deleted_at is not null and old.deleted_at is distinct from new.deleted_at then
    update public.pr_events set deleted_at = new.deleted_at,
      client_updated_at = greatest(client_updated_at, new.client_updated_at)
    where source_id = new.id and deleted_at is null;
  end if;
  return null;
end;
$$;

-- E4.9: labels share the owner's export namespace with martial disciplines.
create function public.enforce_export_namespace() returns trigger
language plpgsql set search_path = '' as $$
declare namespace_label text;
begin
  if tg_table_name = 'martial_entries' then
    namespace_label := lower(new.discipline);
  else
    namespace_label := lower(new.export_label);
  end if;
  -- Both write paths serialize the label before looking in the other table.
  -- Include global labels by using the same lock across owners.
  perform pg_advisory_xact_lock(hashtextextended(namespace_label, 0));
  if tg_table_name = 'martial_entries' then
    if new.deleted_at is null and exists (
      select 1 from public.exercises e where e.deleted_at is null
        and e.kind in ('lift','bw_lift') and lower(e.export_label) = lower(new.discipline)
        and (e.owner_id is null or e.owner_id = new.user_id)
    ) then raise exception 'You already have one called that.' using errcode = '23514'; end if;
  else
    if new.deleted_at is null and new.kind in ('lift','bw_lift') and exists (
      select 1 from public.martial_entries m where m.deleted_at is null
        and lower(m.discipline) = lower(new.export_label)
        and (new.owner_id is null or m.user_id = new.owner_id)
    ) then raise exception 'You already have one called that.' using errcode = '23514'; end if;
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  -- Trigger names enforce PostgreSQL's alphabetical BEFORE-trigger order (E4.5).
  for t in select table_name from information_schema.columns
    where table_schema = 'public' and column_name = 'client_updated_at'
  loop
    execute format('create trigger a_lww_guard before update on public.%I for each row execute function public.lww_guard()', t);
    execute format('create trigger b_set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
    execute format('create index %I on public.%I (updated_at)', t || '_updated_at_idx', t);
  end loop;
  foreach t in array array['profiles','challenges'] loop
    execute format('create trigger b_set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
  foreach t in array array['exercise_prefs','sessions','sets','cardio_entries','martial_entries',
    'bodyweight_entries','min_entries','goals','pr_events','reactions','streak_tokens'] loop
    execute format('create index %I on public.%I (user_id, local_date desc)', t || '_user_date_idx', t);
  end loop;
  foreach t in array array['sets','cardio_entries','martial_entries','min_entries'] loop
    execute format('create trigger c_enforce_owner before insert or update on public.%I for each row execute function public.enforce_owner()', t);
  end loop;
  foreach t in array array['sets','cardio_entries'] loop
    execute format('create trigger cascade_pr_delete after update of deleted_at on public.%I for each row execute function public.cascade_pr_delete()', t);
  end loop;
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end;
$$;
create trigger d_enforce_bw_negative before insert or update on public.sets
  for each row execute function public.enforce_bw_negative();
create trigger d_export_namespace before insert or update on public.martial_entries
  for each row execute function public.enforce_export_namespace();
create trigger d_export_namespace before insert or update on public.exercises
  for each row execute function public.enforce_export_namespace();

-- A3 adds authenticated RPCs and policies. Trigger functions are not client RPCs.
revoke execute on function public.set_updated_at(), public.lww_guard(), public.enforce_owner(),
  public.enforce_bw_negative(), public.cascade_pr_delete(), public.enforce_export_namespace()
  from public, anon, authenticated;
