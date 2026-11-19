-- pgTAP tests for 0025's referral tracking: anyone can record a tagged
-- visit, only a new account with a matching prior visit can claim a
-- referral signup, and neither table is readable through the API.
--
-- Run with: supabase test db --local
BEGIN;
SELECT plan(10);

-- r1 signs up after its browser's tagged visit; r0 is an existing account.
insert into auth.users (id, email, created_at) values
  ('d1111111-1111-1111-1111-111111111111', 'ref-new@nd.edu', now()),
  ('d0000000-0000-0000-0000-000000000000', 'ref-old@nd.edu', now() - interval '30 days');

set local role anon;
reset request.jwt.claims;

SELECT lives_ok(
  $$ select public.record_referral_visit('HPC', 'aaaaaaaa-0000-0000-0000-000000000001', '/dashboard') $$,
  'anon can record a tagged visit'
);

SELECT throws_ok(
  $$ select public.record_referral_visit('bad tag!', 'aaaaaaaa-0000-0000-0000-000000000001', '/dashboard') $$,
  '23514', null,
  'malformed tags are rejected'
);

SELECT throws_ok(
  $$ select * from public.referral_visits $$,
  '42501', null,
  'anon cannot read referral_visits'
);

SELECT throws_ok(
  $$ select public.claim_referral_signup('hpc', 'aaaaaaaa-0000-0000-0000-000000000001') $$,
  '42501', null,
  'anon cannot claim a referral signup'
);

set local role authenticated;
set local request.jwt.claims = '{"sub": "d0000000-0000-0000-0000-000000000000", "role":"authenticated"}';

SELECT is(
  public.claim_referral_signup('hpc', 'aaaaaaaa-0000-0000-0000-000000000001'),
  false,
  'an account older than the visit is not counted as a signup'
);

set local request.jwt.claims = '{"sub": "d1111111-1111-1111-1111-111111111111", "role":"authenticated"}';

SELECT is(
  public.claim_referral_signup('hpc', 'bbbbbbbb-0000-0000-0000-000000000002'),
  false,
  'a browser with no recorded visit cannot claim'
);

SELECT is(
  public.claim_referral_signup('hpc', 'aaaaaaaa-0000-0000-0000-000000000001'),
  true,
  'a new account with a prior tagged visit is counted'
);

SELECT is(
  public.claim_referral_signup('hpc', 'aaaaaaaa-0000-0000-0000-000000000001'),
  false,
  'claiming twice does not double count'
);

SELECT throws_ok(
  $$ select * from public.referral_signups $$,
  '42501', null,
  'authenticated users cannot read referral_signups'
);

reset role;

SELECT results_eq(
  $$ select ref, user_id::text from public.referral_signups $$,
  $$ values ('hpc', 'd1111111-1111-1111-1111-111111111111') $$,
  'exactly the new account is attributed to hpc'
);

SELECT * FROM finish();
ROLLBACK;
