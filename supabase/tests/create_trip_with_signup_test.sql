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
SELECT plan(12);

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

-- ============================================================
-- Case 4: the other way the second insert can fail -- a poster declaring
-- more bags than the vehicle they're posting can hold. Case 3 covered a
-- unique-index violation (23505); this one trips check_signup_capacity
-- (P0001), a different trigger on the same insert, and must roll the trips
-- insert back just the same.
-- ============================================================

insert into auth.users (id, email) values
  ('e4444444-4444-4444-4444-444444444444', 'ctws-user4@nd.edu');

set local role authenticated;
set local request.jwt.claims = '{"sub": "e4444444-4444-4444-4444-444444444444", "role":"authenticated"}';

SELECT throws_ok(
  $$ select public.create_trip_with_signup(
       'to_airport', now() + interval '2 hours', 'Dorm', 'Airport',
       null, 4, 2, 40, null, 3
     ) $$,
  'P0001',
  'This trip is full: not enough bag capacity remaining.',
  'posting with more bags than the trip''s own bag_capacity is rejected'
);

reset role;

SELECT is(
  (select count(*) from public.trips where created_by = 'e4444444-4444-4444-4444-444444444444')::int,
  0,
  'the over-capacity post left no orphaned trips row behind either'
);

-- ============================================================
-- Case 5: vehicle_type_id is passed through to the trip row. Every other
-- case here passes null for it, so this is the only coverage that the
-- argument is stored at all and that the FK to vehicle_types resolves.
-- ============================================================

insert into auth.users (id, email) values
  ('e5555555-5555-5555-5555-555555555555', 'ctws-user5@nd.edu');

set local role authenticated;
set local request.jwt.claims = '{"sub": "e5555555-5555-5555-5555-555555555555", "role":"authenticated"}';

create temporary table ctws_vt as
select public.create_trip_with_signup(
  'from_airport', now() + interval '4 hours', 'Airport', 'Dorm',
  (select id from public.vehicle_types where name = 'XL'), 6, 4, 60, null, 2
) as trip_id;

SELECT is(
  (select vehicle_type_id from public.trips where id = (select trip_id from ctws_vt)),
  (select id from public.vehicle_types where name = 'XL'),
  'the posted vehicle type is stored on the trip'
);

reset role;

-- ============================================================
-- Case 6: max_bags_per_person (migration 0010) is a trailing argument with a
-- default, so every call above omits it -- these two cases are the only
-- coverage that passing it does anything, and that the poster is held to
-- their own cap rather than exempt from it.
-- ============================================================

insert into auth.users (id, email) values
  ('e6666666-6666-6666-6666-666666666666', 'ctws-user6@nd.edu'),
  ('e7777777-7777-7777-7777-777777777777', 'ctws-user7@nd.edu');

set local role authenticated;
set local request.jwt.claims = '{"sub": "e6666666-6666-6666-6666-666666666666", "role":"authenticated"}';

create temporary table ctws_cap as
select public.create_trip_with_signup(
  'to_airport', now() + interval '2 hours', 'Dorm', 'Airport',
  null, 4, 8, 40, null, 1, 2
) as trip_id;

SELECT is(
  (select max_bags_per_person from public.trips where id = (select trip_id from ctws_cap)),
  2,
  'the per-person bag cap passed to create_trip_with_signup is stored on the trip'
);

reset role;

-- The poster's own auto-join runs through check_signup_capacity like any
-- other join, so a poster declaring more bags than the cap they just set is
-- rejected and the trip insert rolls back with it.
set local role authenticated;
set local request.jwt.claims = '{"sub": "e7777777-7777-7777-7777-777777777777", "role":"authenticated"}';

SELECT throws_ok(
  $$ select public.create_trip_with_signup(
       'to_airport', now() + interval '2 hours', 'Dorm', 'Airport',
       null, 4, 8, 40, null, 3, 2
     ) $$,
  'P0001',
  'This trip limits riders to 2 bag(s) each.',
  'a poster is held to the per-person cap they set for their own trip'
);

reset role;

SELECT is(
  (select count(*) from public.trips where created_by = 'e7777777-7777-7777-7777-777777777777')::int,
  0,
  'that rejection rolled the trips insert back too, leaving no orphan'
);

SELECT * FROM finish();
ROLLBACK;
