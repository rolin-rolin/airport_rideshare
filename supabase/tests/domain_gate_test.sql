-- pgTAP tests for the school-email domain gate (DESIGN.md), covering
-- handle_new_user() / on_auth_user_created from migration 0001:
--   * Signing up with an @nd.edu email provisions a matching public.profiles
--     row in the same transaction as the auth.users insert.
--   * Signing up with any other domain is rejected outright, and because the
--     profile insert and the domain check both run inside the BEFORE-commit
--     trigger on the same statement, a rejected signup leaves no trace in
--     either auth.users or public.profiles (nothing to clean up, no
--     orphaned auth user with no profile).
--
-- Run with: supabase test db --local
BEGIN;
SELECT plan(7);

-- ============================================================
-- Case 1: nd.edu email is accepted and provisions a profile row.
-- ============================================================

insert into auth.users (id, email) values
  ('d1111111-1111-1111-1111-111111111111', 'valid-user@nd.edu');

SELECT is(
  (select email from public.profiles where id = 'd1111111-1111-1111-1111-111111111111'),
  'valid-user@nd.edu',
  'on_auth_user_created provisions a profiles row for an nd.edu signup'
);

-- ============================================================
-- Case 2: any other domain is rejected by the domain gate.
-- ============================================================

SELECT throws_ok(
  $$ insert into auth.users (id, email) values
     ('d2222222-2222-2222-2222-222222222222', 'outsider@gmail.com') $$,
  'P0001',
  'Email domain not allowed. Please use your nd.edu school email.',
  'signup with a non-nd.edu email is rejected by the domain gate'
);

-- throws_ok runs the statement in its own subtransaction and rolls it back
-- on failure, so these two checks confirm the rejection left nothing behind
-- in either table -- not just that the auth.users row is gone, but that no
-- profiles row was ever committed for it either.
SELECT is(
  (select count(*) from auth.users where id = 'd2222222-2222-2222-2222-222222222222')::int,
  0,
  'rejected signup leaves no auth.users row behind'
);

SELECT is(
  (select count(*) from public.profiles where id = 'd2222222-2222-2222-2222-222222222222')::int,
  0,
  'rejected signup leaves no orphaned profiles row behind'
);

-- ============================================================
-- Case 3: edge cases in how the domain is matched.
-- ============================================================

-- handle_new_user compares split_part(email, '@', 2) against a lowercase
-- literal, so the match is case-sensitive. In practice GoTrue lowercases
-- emails before they reach auth.users, which is why this has never bitten --
-- but anything inserting directly (admin API, seed script, this test) can
-- still hit it. Pinned so the behavior is a decision rather than an
-- accident: if the gate is ever changed to lowercase its input, this test
-- should fail and be updated to lives_ok.
SELECT throws_ok(
  $$ insert into auth.users (id, email) values
     ('d3333333-3333-3333-3333-333333333333', 'shouty@ND.EDU') $$,
  'P0001',
  'Email domain not allowed. Please use your nd.edu school email.',
  'the domain match is case-sensitive: an uppercase ND.EDU is rejected'
);

-- Subdomains are not the allowed domain: split_part returns the whole
-- 'mail.nd.edu', which doesn't equal 'nd.edu'. Guards against a future
-- rewrite to a suffix/LIKE match quietly widening the gate.
SELECT throws_ok(
  $$ insert into auth.users (id, email) values
     ('d4444444-4444-4444-4444-444444444444', 'student@mail.nd.edu') $$,
  'P0001',
  'Email domain not allowed. Please use your nd.edu school email.',
  'a subdomain of the allowed domain is still rejected'
);

-- An address with no @ at all: split_part returns an empty string, which
-- also fails the comparison rather than erroring out.
SELECT throws_ok(
  $$ insert into auth.users (id, email) values
     ('d5555555-5555-5555-5555-555555555555', 'not-an-email') $$,
  'P0001',
  'Email domain not allowed. Please use your nd.edu school email.',
  'an address with no domain part is rejected rather than erroring'
);

SELECT * FROM finish();
ROLLBACK;
