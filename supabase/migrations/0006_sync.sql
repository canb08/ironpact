-- A7: server clock calibration. Caller privileges apply; no elevated access.
create function public.server_now() returns timestamptz
language sql stable security invoker set search_path = '' as $$
  select now();
$$;
revoke all on function public.server_now() from public, anon, authenticated;
grant execute on function public.server_now() to authenticated;
