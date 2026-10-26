-- A3: authenticated crew/token RPCs. All relation names are schema-qualified.
create function public.create_crew(name text, tz text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  new_crew uuid := gen_random_uuid();
begin
  if caller is null then raise exception 'unauthenticated'; end if;
  -- Serializes independent create requests by the same account.
  perform pg_advisory_xact_lock(hashtextextended('crew-user:' || caller::text, 0));
  if exists (select 1 from public.crew_members m where m.user_id = caller and m.left_at is null) then
    raise exception 'already_in_crew';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = create_crew.tz) then
    raise exception 'invalid_timezone';
  end if;
  insert into public.crews (id, name, tz, created_by)
    values (new_crew, create_crew.name, create_crew.tz, caller);
  insert into public.crew_members (crew_id, user_id, role) values (new_crew, caller, 'owner');
  return new_crew;
end;
$$;

create function public.create_invite(crew_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  random_bytes bytea;
  random_bits bigint := 0;
  plain_code text := '';
  i integer;
begin
  if caller is null then raise exception 'unauthenticated'; end if;
  -- All invite rotations for one crew take the same lock. The later redemption
  -- implementation must also lock this crew before checking capacity/using a code.
  perform 1 from public.crews c where c.id = create_invite.crew_id for update;
  if not exists (select 1 from public.crew_members m
    where m.crew_id = create_invite.crew_id and m.user_id = caller
      and m.role = 'owner' and m.left_at is null) then
    raise exception 'not_crew_owner';
  end if;
  random_bytes := extensions.gen_random_bytes(7);
  for i in 0..6 loop
    random_bits := random_bits * 256 + get_byte(random_bytes, i);
  end loop;
  -- Ten independent five-bit values: exactly 50 bits, without modulo bias.
  for i in 1..10 loop
    plain_code := plain_code || substr(alphabet, (random_bits & 31)::integer + 1, 1);
    random_bits := random_bits >> 5;
  end loop;
  update public.crew_invites ci set revoked_at = now()
    where ci.crew_id = create_invite.crew_id and ci.used_at is null and ci.revoked_at is null;
  insert into public.crew_invites (crew_id, code_hash, created_by, expires_at)
    values (create_invite.crew_id, encode(extensions.digest(plain_code, 'sha256'), 'hex'),
      caller, now() + interval '7 days');
  -- Ticket A3 asks for the plain ten characters; grouping belongs to the UI.
  return plain_code;
end;
$$;

-- redeem_invite is deliberately not installed pending a contract decision.
-- E4.3 requires persistent failed attempts, but the frozen UUID/RAISE contract
-- rolls back those attempts with the failed statement. A safe implementation
-- needs a committed error result or a separately committed trusted limiter.
-- There is no callable stub and no unthrottled redemption path.

create function public.leave_crew(crew_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare caller uuid := auth.uid();
begin
  if caller is null then raise exception 'unauthenticated'; end if;
  perform pg_advisory_xact_lock(hashtextextended('crew-user:' || caller::text, 0));
  perform 1 from public.crews c where c.id = leave_crew.crew_id for update;
  update public.crew_members m set left_at = now()
    where m.crew_id = leave_crew.crew_id and m.user_id = caller and m.left_at is null;
end;
$$;

create function public.create_export_token(label text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  plain_token text;
begin
  if caller is null then raise exception 'unauthenticated'; end if;
  -- The cap must survive concurrent requests, not just sequential requests.
  perform pg_advisory_xact_lock(hashtextextended('export-user:' || caller::text, 0));
  if (select count(*) from public.export_tokens t where t.user_id = caller and t.revoked_at is null) >= 3 then
    raise exception 'token_limit';
  end if;
  plain_token := 'spx_' || translate(rtrim(encode(extensions.gen_random_bytes(32), 'base64'), '='), '+/', '-_');
  insert into public.export_tokens (user_id, token_hash, label)
    values (caller, encode(extensions.digest(plain_token, 'sha256'), 'hex'), create_export_token.label);
  return plain_token;
end;
$$;

create function public.revoke_export_token(id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare caller uuid := auth.uid();
begin
  if caller is null then raise exception 'unauthenticated'; end if;
  perform pg_advisory_xact_lock(hashtextextended('export-user:' || caller::text, 0));
  -- Unknown, foreign and already revoked IDs are equally harmless/idempotent.
  update public.export_tokens t set revoked_at = now()
    where t.id = revoke_export_token.id and t.user_id = caller and t.revoked_at is null;
end;
$$;

create function public.list_export_tokens()
returns table (id uuid, label text, created_at timestamptz, last_used_at timestamptz, revoked_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'unauthenticated'; end if;
  return query select t.id, t.label, t.created_at, t.last_used_at, t.revoked_at
    from public.export_tokens t where t.user_id = auth.uid() order by t.created_at desc, t.id;
end;
$$;

revoke all on function public.create_crew(text, text), public.create_invite(uuid),
  public.leave_crew(uuid), public.create_export_token(text), public.revoke_export_token(uuid),
  public.list_export_tokens() from public, anon, authenticated;
grant execute on function public.create_crew(text, text), public.create_invite(uuid),
  public.leave_crew(uuid), public.create_export_token(text), public.revoke_export_token(uuid),
  public.list_export_tokens() to authenticated;

-- A child write must not inherit a date from a session that is concurrently
-- being moved. SHARE conflicts with the session UPDATE's NO KEY UPDATE lock;
-- the parent move either observes the committed child or the child observes
-- the moved parent. Keep A2's ownership checks and invoker privileges.
create or replace function public.enforce_owner() returns trigger
language plpgsql set search_path = '' as $$
declare parent public.sessions%rowtype;
begin
  select * into parent from public.sessions where id = new.session_id for share;
  if not found then raise exception 'session_missing' using errcode = '23503'; end if;
  if parent.user_id <> new.user_id then raise exception 'owner_mismatch' using errcode = '23514'; end if;
  new.local_date := parent.local_date;
  return new;
end;
$$;
revoke all on function public.enforce_owner() from public, anon, authenticated;

-- S15: moving a session moves every child, including tombstones, atomically.
-- Retaining each child's client_updated_at makes E4.5 accept this derived date
-- change even when a child's own edit timestamp is newer than the session's.
create function public.propagate_session_local_date() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.sets set local_date = new.local_date
    where session_id = new.id and local_date is distinct from new.local_date;
  update public.cardio_entries set local_date = new.local_date
    where session_id = new.id and local_date is distinct from new.local_date;
  update public.martial_entries set local_date = new.local_date
    where session_id = new.id and local_date is distinct from new.local_date;
  update public.min_entries set local_date = new.local_date
    where session_id = new.id and local_date is distinct from new.local_date;
  return null;
end;
$$;
revoke all on function public.propagate_session_local_date() from public, anon, authenticated;
create trigger propagate_session_local_date after update of local_date on public.sessions
  for each row when (old.local_date is distinct from new.local_date)
  execute function public.propagate_session_local_date();
