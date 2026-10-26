begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id,email) values
 ('10000000-0000-4000-8000-000000000001','alice@example.test'),
 ('10000000-0000-4000-8000-000000000002','bob@example.test');
create temporary table invite_results (crew_id uuid, code text, generation integer);
grant all on invite_results to authenticated;
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}';
insert into invite_results (crew_id,generation)
 values (public.create_crew('Test crew','Europe/Amsterdam'),1);
select is((select name from public.crews),'Test crew','create_crew stores the requested name');
select is((select tz from public.crews),'Europe/Amsterdam','create_crew stores the requested timezone');
select is((select role from public.crew_members where user_id = auth.uid()),'owner',
 'create_crew makes its caller the owner');
select ok((select left_at is null from public.crew_members where user_id = auth.uid()),
 'create_crew owner membership is current');
select throws_ok($q$select public.create_crew('Duplicate crew','Europe/Amsterdam')$q$,
 'P0001','already_in_crew','Active member cannot create a second crew');
update invite_results set code = public.create_invite(crew_id) where generation = 1;
select ok((select code ~ '^[0-9A-HJKMNP-TV-Z]{10}$' from invite_results),
 'D3: invite is exactly ten unformatted Crockford base32 characters');

reset role;
select is((select count(*) from public.crew_invites i join invite_results r
 on i.code_hash = encode(extensions.digest(r.code,'sha256'),'hex') and i.crew_id = r.crew_id),
 1::bigint,'Invite stores the SHA256 hex digest of its normalized code');
select ok((select code_hash ~ '^[0-9a-f]{64}$' from public.crew_invites),
 'Invite digest is 64 lowercase hex characters');
select is((select expires_at - created_at from public.crew_invites),interval '7 days',
 'Invite expires exactly seven days after creation');
select ok((select used_at is null and used_by is null and revoked_at is null from public.crew_invites),
 'New invite is unused and not revoked');

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok($q$select public.create_invite((select crew_id from invite_results limit 1))$q$,
 'P0001','not_crew_owner','Outsider cannot create an invite for another crew');
reset role;
insert into public.crew_members (crew_id,user_id,role)
 select crew_id,'10000000-0000-4000-8000-000000000002','member' from invite_results;
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok($q$select public.create_invite((select crew_id from invite_results limit 1))$q$,
 'P0001','not_crew_owner','Non-owner member cannot create an invite');
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}';
insert into invite_results (crew_id,code,generation)
 select crew_id,public.create_invite(crew_id),2 from invite_results where generation = 1;
select is((select count(distinct code) from invite_results),2::bigint,
 'New invite generation returns a fresh code');
reset role;
select ok((select i.revoked_at is not null from public.crew_invites i join invite_results r
 on i.code_hash = encode(extensions.digest(r.code,'sha256'),'hex') where r.generation = 1),
 'Creating a new invite revokes the older unused invite');
select is((select count(*) from public.crew_invites where revoked_at is null and used_at is null),1::bigint,
 'Only the latest unused invite remains active');

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}';
select lives_ok($q$select public.leave_crew((select crew_id from invite_results limit 1))$q$,
 'Crew owner can leave crew');
select throws_ok($q$select public.create_invite((select crew_id from invite_results limit 1))$q$,
 'P0001','not_crew_owner','Former owner cannot create invites after leaving');
reset role;
select ok((select left_at is not null from public.crew_members
 where user_id = '10000000-0000-4000-8000-000000000001'),'leave_crew records left_at');
select ok((select left_at is null from public.crew_members
 where user_id = '10000000-0000-4000-8000-000000000002'),'Leaving does not remove another member');

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok($q$select public.create_crew('Anon crew','Europe/Amsterdam')$q$,'42501',null,
 'Anon cannot call create_crew');
select throws_ok($q$select public.create_invite('00000000-0000-0000-0000-000000000000')$q$,'42501',null,
 'Anon cannot call create_invite');
select throws_ok($q$select public.leave_crew('00000000-0000-0000-0000-000000000000')$q$,'42501',null,
 'Anon cannot call leave_crew');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated"}';
select throws_ok($q$select public.create_crew('Missing identity','Europe/Amsterdam')$q$,
 'P0001','unauthenticated','Crew creation rejects authenticated role without a user identity');
select throws_ok($q$select public.create_invite('00000000-0000-0000-0000-000000000000')$q$,
 'P0001','unauthenticated','Invite creation rejects authenticated role without a user identity');
reset role;
-- redeem_invite is deliberately not stubbed. The frozen UUID/RAISE contract
-- cannot durably count failed attempts in invite_attempts: RAISE rolls back
-- those writes. D-12 redemption, D-13 rate limiting, D-14 capacity, and D-15
-- rejoin need the contract decision recorded in the A3 PR before implementation.
select diag('NOT IMPLEMENTED: invite redemption, reuse/expiry/revoke rejection, normalization, rate limit, capacity and rejoin await the redeem_invite contract decision');
select * from finish();
rollback;
