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
-- Redemption's approved result contract commits expected failures, allowing
-- these real failed calls (not pre-seeded attempts) to exercise the limiter.
insert into auth.users (id) values
 ('10000000-0000-4000-8000-000000000003'),
 ('10000000-0000-4000-8000-000000000004'),
 ('10000000-0000-4000-8000-000000000005'),
 ('10000000-0000-4000-8000-000000000006');
update public.crew_members set left_at = null where user_id = '10000000-0000-4000-8000-000000000001';
insert into public.crew_invites (crew_id,code_hash,created_by,expires_at,revoked_at)
select r.crew_id,encode(extensions.digest(v.code,'sha256'),'hex'),
 '10000000-0000-4000-8000-000000000001',v.expiry,v.revoked
from invite_results r cross join (values
 ('0112345678',now()+interval '7 days',null::timestamptz),
 ('1111111111',now()-interval '1 second',null::timestamptz),
 ('2222222222',now()+interval '7 days',now()),
 ('3333333333',now()+interval '7 days',null::timestamptz),
 ('4444444444',now()+interval '7 days',null::timestamptz)
) v(code,expiry,revoked) where r.generation = 1;
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}';
select is(public.redeem_invite(' oil23-45678 '),
 jsonb_build_object('crew_id',(select crew_id from invite_results limit 1),'error',null),
 'D-12: valid invite normalizes case, spaces, hyphens and O/I/L aliases');
select is((select role from public.crew_members where user_id = auth.uid()),'member',
 'Redemption creates current member');
reset role;
select is((select count(*) from public.invite_attempts where user_id = '10000000-0000-4000-8000-000000000003'),
 0::bigint,'Successful redemption does not count as a failed attempt');
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}';
select is(public.redeem_invite('4444444444')->>'error','already_in_crew',
 'Current member cannot redeem into another active membership');
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000004","role":"authenticated"}';
select is(public.redeem_invite('0112345678')->>'error','code_dead','D-12: invite cannot be redeemed twice');
select is(public.redeem_invite('1111111111')->>'error','code_dead','D-12: expired invite cannot be redeemed');
select is(public.redeem_invite('2222222222')->>'error','code_dead','D-12: revoked invite cannot be redeemed');
select is(public.redeem_invite(null)->>'error','code_dead','Null invite returns a recorded failure');
reset role;
select is((select used_by from public.crew_invites where code_hash = encode(extensions.digest('0112345678','sha256'),'hex')),
 '10000000-0000-4000-8000-000000000003'::uuid,'Successful invite records its redeemer');
select is((select count(*) from public.invite_attempts where user_id = '10000000-0000-4000-8000-000000000004'),
 4::bigint,'Failed redemption calls persist their attempt records');
update public.crews set max_members = 3;
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000004","role":"authenticated"}';
select is(public.redeem_invite('3333333333')->>'error','crew_full','D-14: crew capacity rejects another member');
reset role;
select ok((select used_at is null from public.crew_invites where code_hash = encode(extensions.digest('3333333333','sha256'),'hex')),
 'Full crew does not consume invite');
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}';
select public.leave_crew((select crew_id from invite_results limit 1));
select is((select count(*) from public.crew_members),0::bigint,'Leaving removes crew membership reads');
select is(public.redeem_invite('4444444444')->>'error',null::text,'D-15: former member can rejoin');
select is((select count(*) from public.crew_members where user_id = auth.uid()),1::bigint,
 'D-15: rejoin restores membership reads without duplicating membership');
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000005","role":"authenticated"}';
select is(public.redeem_invite('not-a-code')->>'error','code_dead',
 'D-13: failed attempt ' || n || ' returns code_dead') from generate_series(1,10) n;
select is(public.redeem_invite('not-a-code')->>'error','slow_down','D-13: eleventh failed attempt in an hour is rate limited');
reset role;
-- Make the unused invite joinable so the limiter, rather than capacity or code
-- validity, is the only reason this caller cannot redeem it.
update public.crews set max_members = 8;
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000005","role":"authenticated"}';
select is(public.redeem_invite('3333333333'),jsonb_build_object('crew_id',null,'error','slow_down'),
 'D-13: ten failed attempts also block a valid unused invite');
reset role;
select ok((select used_at is null and used_by is null from public.crew_invites
 where code_hash = encode(extensions.digest('3333333333','sha256'),'hex')),
 'D-13: rate limiting leaves a valid invite unused');
select is((select count(*) from public.crew_members where user_id = '10000000-0000-4000-8000-000000000005'),
 0::bigint,'D-13: rate limiting does not create a membership');
select is((select count(*) from public.invite_attempts where user_id = '10000000-0000-4000-8000-000000000005'),
 10::bigint,'D-13: ten actual failed calls remain recorded after rate limiting');
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000006","role":"authenticated"}';
select is(public.redeem_invite('3333333333'),
 jsonb_build_object('crew_id',(select crew_id from invite_results limit 1),'error',null),
 'D-13: another caller can redeem the invite while the first caller is rate limited');
reset role;
select is((select count(*) from public.invite_attempts where user_id = '10000000-0000-4000-8000-000000000006'),
 0::bigint,'D-13: another caller successful redemption creates no failed attempt');
update public.invite_attempts set at = now()-interval '2 hours' where user_id = '10000000-0000-4000-8000-000000000005';
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000005","role":"authenticated"}';
select is(public.redeem_invite('not-a-code')->>'error','code_dead','D-13: failed attempts expire after one hour');
select throws_ok($q$insert into public.invite_attempts(user_id) values(auth.uid())$q$,'42501',null,
 'Client cannot tamper with invite attempts');
set local request.jwt.claims = '{"role":"authenticated"}';
select throws_ok($q$select public.redeem_invite('0112345678')$q$,'P0001','unauthenticated',
 'Redemption rejects authenticated role without identity');
reset role;
set local role anon;
select throws_ok($q$select public.redeem_invite('0112345678')$q$,'42501',null,'Anon cannot call redeem_invite');
reset role;
select * from finish();
rollback;
