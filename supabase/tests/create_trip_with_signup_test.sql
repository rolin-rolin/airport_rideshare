-- pgTAP tests for public.create_trip_with_signup() (migration 0003, args
-- updated in 0004), the security-definer RPC that lets a poster create a
-- trip and auto-join it as the first member in one call:
--   1. Requires auth.uid() to be set -- rejects an unauthenticated caller.
--   2. Happy path: both the trips row and the poster's own signups row are
--      created atomically, with created_by / user_id set from auth.uid()
--      (not a caller-supplied argument) and the poster's bag_count applied.
--   3. Atomicity: if the poster already has an active signup elsewhere, the
--      second insert (signups) hits signups_one_active_per_user and the
--      whole call rolls back -- no orphaned trips row is left behind from
--      the first insert.
--
-- Run with: supabase test db --local
BEGIN;
SELECT plan(6);

insert into auth.users (id, email) values
  ('e1111111-1111-1111-1111-111111111111', 'ctws-user1@nd.edu'),
  ('e2222222-2222-2222-2222-222222222222', 'ctws-user2@nd.edu');

-- ============================================================
-- Case 1: no auth.uid() (role authenticated, but no jwt claims set) ->
-- the function's own "Not authenticated" guard fires.
-- ============================================================

set local role authenticated;
reset request.jwt.claims;

SELECT throws_ok(
  $$ select public.create_trip_with_signup(
       'to_airport', now() + interval '2 hours', 'Dorm', 'Airport',
       null, 4, 2, 40, null, 1
     ) $$,
  'P0001',
  'Not authenticated',
  'calling with no auth.uid() is rejected before any insert happens'
);

reset role;

-- ============================================================
-- Case 2: happy path -- one call produces both rows, atomically.
-- ============================================================

set local role authenticated;
set local request.jwt.claims = '{"sub": "e1111111-1111-1111-1111-111111111111", "role":"authenticated"}';

create temporary table ctws_result as
select public.create_trip_with_signup(
  'to_airport', now() + interval '2 hours', 'Dorm', 'Airport',
  null, 4, 2, 40, null, 1
) as trip_id;

SELECT ok(
  (select trip_id from ctws_result) is not null,
  'create_trip_with_signup returns a new trip id'
);

SELECT is(
  (select created_by from public.trips where id = (select trip_id from ctws_result)),
  'e1111111-1111-1111-1111-111111111111',
  'the created trip has created_by set from auth.uid(), not a caller-supplied value'
);

SELECT is(
  (select count(*) from public.signups
   where trip_id = (select trip_id from ctws_result)
     and user_id = 'e1111111-1111-1111-1111-111111111111'
     and bag_count = 1)::int,
  1,
  'the poster is auto-joined as the first member with their own bag_count'
);

reset role;

-- ============================================================
-- Case 3: atomicity -- poster already active elsewhere, so the signups
-- insert fails the one-active-per-user constraint and the whole call rolls
-- back, including the trips insert it already made.
-- ============================================================

insert into public.trips
  (id, direction, departure_time, pickup_location, dropoff_location,
   seat_capacity, bag_capacity, created_by, status)
values
  ('e3333333-0000-0000-0000-000000000001', 'to_airport',
   now() + interval '2 hours', 'Dorm', 'Airport', 4, 4,
   'e1111111-1111-1111-1111-111111111111', 'open');

insert into public.signups (trip_id, user_id, bag_count)
values ('e3333333-0000-0000-0000-000000000001', 'e2222222-2222-2222-2222-222222222222', 0);

set local role authenticated;
set local request.jwt.claims = '{"sub": "e2222222-2222-2222-2222-222222222222", "role":"authenticated"}';

SELECT throws_ok(
  $$ select public.create_trip_with_signup(
       'to_airport', now() + interval '2 hours', 'Dorm', 'Airport',
       null, 4, 2, 40, null, 1
     ) $$,
  '23505',
  'duplicate key value violates unique constraint "signups_one_active_per_user"',
  'posting while already active elsewhere is rejected by the second insert''s unique violation'
);

reset role;

SELECT is(
  (select count(*) from public.trips where created_by = 'e2222222-2222-2222-2222-222222222222')::int,
  0,
  'the rejected call left no orphaned trips row behind -- both inserts rolled back together'
);

SELECT * FROM finish();
ROLLBACK;
