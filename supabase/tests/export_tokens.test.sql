begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id,email) values
 ('10000000-0000-4000-8000-000000000001','alice@example.test'),
 ('10000000-0000-4000-8000-000000000002','bob@example.test');
create temporary table token_results (owner_id uuid, plain_token text, token_id uuid);
grant all on token_results to authenticated;
create function pg_temp.hash_hidden() returns boolean language plpgsql as $$
declare row_count bigint;
begin
 select count(token_hash) into row_count from public.export_tokens;
 return row_count = 0;
exception when insufficient_privilege then return true;
end;
$$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}';
insert into token_results (owner_id,plain_token)
 values (auth.uid(),public.create_export_token('First vault'));
select ok((select plain_token ~ '^spx_[A-Za-z0-9_-]{43}$' from token_results),
 'Export token has spx_ prefix and 43 base64url characters');
select ok(pg_temp.hash_hidden(),'D-16: authenticated cannot directly select token_hash');
select is((select count(*) from public.list_export_tokens()),1::bigint,
 'Owner lists their first export token');
select is((select array_agg(k order by k) from public.list_export_tokens() t,
 lateral jsonb_object_keys(to_jsonb(t)) as k),
 array['created_at','id','label','last_used_at','revoked_at']::text[],
 'D-16: list_export_tokens returns exactly metadata fields and never token_hash');
select is((select label from public.list_export_tokens()),'First vault',
 'Export token list preserves label');
update token_results set token_id = (select id from public.list_export_tokens());
insert into token_results (owner_id,plain_token)
 values (auth.uid(),public.create_export_token('Second vault')),
        (auth.uid(),public.create_export_token('Third vault'));
select is((select count(distinct plain_token) from token_results),3::bigint,
 'Each export token receives fresh random bytes');
select throws_ok($q$select public.create_export_token('Fourth vault')$q$,
 'P0001','token_limit','D-17: fourth active export token is rejected');
select is((select count(*) from public.list_export_tokens() where revoked_at is null),3::bigint,
 'Rejected fourth token leaves exactly three active tokens');

set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is((select count(*) from public.list_export_tokens()),0::bigint,
 'B cannot list A export tokens');
insert into token_results (owner_id,plain_token)
 values (auth.uid(),public.create_export_token('B vault'));
update token_results set token_id = (select id from public.list_export_tokens())
 where owner_id = auth.uid();
select is((select count(*) from public.list_export_tokens()),1::bigint,
 'Per-user active-token limit lets B create a token while A has three');

set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is((select count(*) from public.list_export_tokens() where label = 'B vault'),0::bigint,
 'A cannot list B export tokens');
-- Foreign IDs are an idempotent no-op; inspect persisted state as the owner.
select lives_ok($q$select public.revoke_export_token((select token_id from token_results
 where owner_id = '10000000-0000-4000-8000-000000000002'))$q$,
 'Cross-user revoke is safely rejected or ignored');
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}';
select ok((select revoked_at is null from public.list_export_tokens()),
 'A cannot revoke B export token');

set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}';
select lives_ok($q$select public.revoke_export_token((select token_id from token_results
 where owner_id = '10000000-0000-4000-8000-000000000001' and token_id is not null))$q$,
 'Owner can revoke own export token');
select ok((select revoked_at is not null from public.list_export_tokens() where label = 'First vault'),
 'Revocation is effective immediately');
select lives_ok($q$select public.create_export_token('Replacement vault')$q$,
 'Revocation frees an active-token slot');
select is((select count(*) from public.list_export_tokens() where revoked_at is null),3::bigint,
 'Replacement preserves the three-active-token cap');

reset role;
select is((select count(*) from token_results r join public.export_tokens t
 on t.token_hash = encode(extensions.digest(r.plain_token,'sha256'),'hex') and t.user_id = r.owner_id),
 4::bigint,'All returned tokens are stored only as the owner-scoped SHA256 hex digest');
select is((select count(*) from public.export_tokens where token_hash !~ '^[0-9a-f]{64}$'),
 0::bigint,'Stored export hashes are 64 lowercase hex characters');
select is((select count(*) from public.export_tokens t join token_results r on t.token_hash = r.plain_token),
 0::bigint,'Plain export tokens are never stored in token_hash');
select is((select count(*) from pg_policies where schemaname = 'public' and tablename = 'export_tokens'
 and cmd in ('SELECT','ALL')),0::bigint,'Export token table has no client SELECT policy');
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select ok(pg_temp.hash_hidden(),'D-16: anon cannot directly select token_hash');
select throws_ok($q$select public.create_export_token('Anon')$q$,'42501',null,
 'Anon cannot call create_export_token');
select throws_ok($q$select public.revoke_export_token('00000000-0000-0000-0000-000000000000')$q$,'42501',null,
 'Anon cannot call revoke_export_token');
select throws_ok($q$select * from public.list_export_tokens()$q$,'42501',null,
 'Anon cannot call list_export_tokens');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated"}';
select throws_ok($q$select public.create_export_token('Missing identity')$q$,'P0001','unauthenticated',
 'Token creation rejects authenticated role without a user identity');
select throws_ok($q$select * from public.list_export_tokens()$q$,'P0001','unauthenticated',
 'Token listing rejects authenticated role without a user identity');
reset role;
select * from finish();
rollback;
