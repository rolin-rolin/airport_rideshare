-- pgTAP tests for the RLS policies active on profiles, vehicle_types,
-- trips, and signups (post migration 0008, which dropped the last update
-- policy on trips -- "Active members can mark a trip departed" -- with
-- nothing replacing it, so authenticated users can no longer UPDATE a trip
-- row directly at all; and post 0013, which replaced the three
-- `using (true)` select policies -- see the private-trips section below).
--
-- Two distinct failure shapes show up below, and it matters which one a
-- case expects:
--   * INSERT whose WITH CHECK fails (or no policy applies to the role at
--     all) raises a hard error, SQLSTATE 42501 -- asserted with throws_ok.
--   * SELECT/UPDATE rows that a USING clause filters out (or that have no
--     applicable policy at all) are just invisible -- the statement
--     succeeds but touches zero rows. Asserted by checking the row/count is
--     unaffected, not throws_ok.
-- This 42501 (RLS) is a different layer from Area 1's P0001 (plpgsql
-- capacity/update-guard triggers) -- every fixture trip here is sized well
-- under capacity so a capacity rejection never masks an RLS one.
--
-- Fixtures are inserted as the connecting superuser (bypasses RLS). Each
-- case that needs to act as a specific user does:
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub": "<uuid>", "role":"authenticated"}';
--   ... statement under test ...
--   reset role;  -- back to superuser before the next fixture/case
--
-- Every assertion below is scoped to this file's own fixture rows by id.
-- Counting a whole table instead would make the suite pass only against an
-- empty database (CI) and fail on any dev machine carrying seed/dev users.
--
-- Run with: supabase test db --local
BEGIN;
SELECT plan(38);

-- Shared fixtures: two users (A owns a trip + is on its roster, B is a
-- bystander used to prove cross-user access is denied where expected).
insert into auth.users (id, email) values
  ('a1111111-1111-1111-1111-111111111111', 'rls-userA@nd.edu'),
  ('a2222222-2222-2222-2222-222222222222', 'rls-userB@nd.edu');

insert into public.trips
  (id, direction, departure_time, pickup_location, dropoff_location,
   seat_capacity, bag_capacity, created_by, status)
values
  ('f1111111-0000-0000-0000-000000000001', 'to_airport',
   now() + interval '2 hours', 'Dorm', 'Airport', 4, 4,
   'a1111111-1111-1111-1111-111111111111', 'open');

insert into public.signups (id, trip_id, user_id, bag_count)
values
  ('f2222222-0000-0000-0000-000000000001',
   'f1111111-0000-0000-0000-000000000001',
   'a1111111-1111-1111-1111-111111111111', 1);

-- ============================================================
-- profiles: select-only, scoped to yourself and your current trip-mates
-- (0013 -- 0003's "anyone signed in" policy is gone).
-- ============================================================

set local role authenticated;
set local request.jwt.claims = '{"sub": "a2222222-2222-2222-2222-222222222222", "role":"authenticated"}';

-- B is not on any trip with A at this point, so only B's own row resolves.
-- Scoped to the two fixture ids so unrelated rows already in the database
-- can't affect the count. (The trip-mate case is asserted further down,
-- once B has actually joined A's trip.)
SELECT is(
  (select count(*) from public.profiles
   where id in ('a1111111-1111-1111-1111-111111111111',
                'a2222222-2222-2222-2222-222222222222'))::int,
  1,
  'authenticated user cannot view the profile of someone they share no trip with'
);

reset role;
set local role anon;
reset request.jwt.claims;

SELECT is(
  (select count(*) from public.profiles)::int,
  0,
  'anon has no access to profiles (policy is to authenticated only)'
);

reset role;

-- profiles is select-only: 0009 grants no INSERT/UPDATE/DELETE to anyone, so
-- a user cannot rewrite the email their profile was provisioned with by the
-- domain gate (0001). Rejected at the grant level, before RLS is consulted.
set local role authenticated;
set local request.jwt.claims = '{"sub": "a1111111-1111-1111-1111-111111111111", "role":"authenticated"}';

SELECT throws_ok(
  $$ update public.profiles set email = 'forged@nd.edu'
     where id = 'a1111111-1111-1111-1111-111111111111' $$,
  '42501',
  'permission denied for table profiles',
  'a user cannot update their own profile row (no update grant or policy)'
);

reset role;

SELECT is(
  (select email from public.profiles where id = 'a1111111-1111-1111-1111-111111111111'),
  'rls-userA@nd.edu',
  'the rejected profile update left the email unchanged'
);

-- ============================================================
-- vehicle_types: select-only, "to authenticated using (true)"
-- ============================================================

set local role authenticated;
set local request.jwt.claims = '{"sub": "a1111111-1111-1111-1111-111111111111", "role":"authenticated"}';

SELECT ok(
  (select count(*) from public.vehicle_types) > 0,
  'authenticated user can view vehicle types'
);

reset role;
set local role anon;
reset request.jwt.claims;

SELECT is(
  (select count(*) from public.vehicle_types)::int,
  0,
  'anon has no access to vehicle_types'
);

reset role;

-- vehicle_types is reference data seeded by migration 0002 -- select-only for
-- app users, so nobody can invent a vehicle tier with arbitrary capacities.
set local role authenticated;
set local request.jwt.claims = '{"sub": "a1111111-1111-1111-1111-111111111111", "role":"authenticated"}';

SELECT throws_ok(
  $$ insert into public.vehicle_types (name, default_seat_capacity, default_bag_capacity)
     values ('Forged', 99, 99) $$,
  '42501',
  'permission denied for table vehicle_types',
  'a user cannot insert a vehicle type (reference data is select-only)'
);

reset role;

-- ============================================================
-- trips: select is unrestricted; insert requires created_by = auth.uid();
-- no update policy exists at all post-0008.
-- ============================================================

set local role authenticated;
set local request.jwt.claims = '{"sub": "a2222222-2222-2222-2222-222222222222", "role":"authenticated"}';

SELECT is(
  (select count(*) from public.trips where id = 'f1111111-0000-0000-0000-000000000001')::int,
  1,
  'any authenticated user can view a trip they did not create'
);

reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub": "a2222222-2222-2222-2222-222222222222", "role":"authenticated"}';

SELECT lives_ok(
  $$ insert into public.trips
     (id, direction, departure_time, pickup_location, dropoff_location,
      seat_capacity, bag_capacity, created_by)
     values
     ('f1111111-0000-0000-0000-000000000002', 'to_airport',
      now() + interval '3 hours', 'Dorm', 'Airport', 4, 4,
      'a2222222-2222-2222-2222-222222222222') $$,
  'user can insert a trip with created_by set to their own uid'
);

reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub": "a2222222-2222-2222-2222-222222222222", "role":"authenticated"}';

SELECT throws_ok(
  $$ insert into public.trips
     (id, direction, departure_time, pickup_location, dropoff_location,
      seat_capacity, bag_capacity, created_by)
     values
     ('f1111111-0000-0000-0000-000000000003', 'to_airport',
      now() + interval '3 hours', 'Dorm', 'Airport', 4, 4,
      'a1111111-1111-1111-1111-111111111111') $$,
  '42501',
  'new row violates row-level security policy for table "trips"',
  'user cannot insert a trip on another user''s behalf (WITH CHECK fails)'
);

reset role;

-- The trip's owner tries to update their own trip: no update policy exists
-- at all (0008 dropped the only one, and migration 0009 correspondingly
-- withholds the UPDATE grant on trips from authenticated, matching that no
-- policy is meant to allow it) -- rejected outright, not just filtered.
set local role authenticated;
set local request.jwt.claims = '{"sub": "a1111111-1111-1111-1111-111111111111", "role":"authenticated"}';

SELECT throws_ok(
  $$ update public.trips set pickup_location = 'Somewhere else'
     where id = 'f1111111-0000-0000-0000-000000000001' $$,
  '42501',
  'permission denied for table trips',
  'no update policy exists on trips; even the owner cannot update it directly'
);

reset role;

SELECT is(
  (select pickup_location from public.trips where id = 'f1111111-0000-0000-0000-000000000001'),
  'Dorm',
  'the rejected update left the trip row unchanged'
);

set local role anon;
reset request.jwt.claims;

SELECT is(
  (select count(*) from public.trips)::int,
  0,
  'anon has no access to trips'
);

reset role;

-- No DELETE grant on trips: a trip is only ever ended by moving it to a
-- terminal status ('expired'/'abandoned'), never removed. A hard delete would
-- also cascade away its signups (0002's on delete cascade), destroying the
-- history the soft-delete model exists to keep.
set local role authenticated;
set local request.jwt.claims = '{"sub": "a1111111-1111-1111-1111-111111111111", "role":"authenticated"}';

SELECT throws_ok(
  $$ delete from public.trips where id = 'f1111111-0000-0000-0000-000000000001' $$,
  '42501',
  'permission denied for table trips',
  'even the trip owner cannot delete a trip (no delete grant)'
);

reset role;

SELECT is(
  (select count(*) from public.trips where id = 'f1111111-0000-0000-0000-000000000001')::int,
  1,
  'the rejected delete left the trip row in place'
);

set local role anon;
reset request.jwt.claims;

-- anon has no INSERT grant on trips at all (0009 only grants it to
-- authenticated, matching that no insert policy targets anon) -- rejected
-- at the grant level before RLS is even consulted.
SELECT throws_ok(
  $$ insert into public.trips
     (id, direction, departure_time, pickup_location, dropoff_location,
      seat_capacity, bag_capacity, created_by)
     values
     ('f1111111-0000-0000-0000-000000000004', 'to_airport',
      now() + interval '3 hours', 'Dorm', 'Airport', 4, 4,
      'a1111111-1111-1111-1111-111111111111') $$,
  '42501',
  'permission denied for table trips',
  'anon cannot insert a trip (no insert grant, no insert policy targets anon)'
);

reset role;

-- ============================================================
-- signups: select is unrestricted; insert/update require user_id =
-- auth.uid().
-- ============================================================

set local role authenticated;
set local request.jwt.claims = '{"sub": "a2222222-2222-2222-2222-222222222222", "role":"authenticated"}';

SELECT is(
  (select count(*) from public.signups where id = 'f2222222-0000-0000-0000-000000000001')::int,
  1,
  'any authenticated user can view a signup that is not their own'
);

reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub": "a2222222-2222-2222-2222-222222222222", "role":"authenticated"}';

SELECT lives_ok(
  $$ insert into public.signups (id, trip_id, user_id, bag_count)
     values ('f2222222-0000-0000-0000-000000000002',
             'f1111111-0000-0000-0000-000000000001',
             'a2222222-2222-2222-2222-222222222222', 1) $$,
  'user can insert a signup for themselves'
);

reset role;

-- The other half of the profiles policy: B just joined A's trip, so A's
-- email now resolves where it didn't at the top of this file. This is what
-- keeps the roster rendering (DESIGN.md §4.3) after 0013 narrowed profiles.
set local role authenticated;
set local request.jwt.claims = '{"sub": "a2222222-2222-2222-2222-222222222222", "role":"authenticated"}';

SELECT is(
  (select count(*) from public.profiles
   where id in ('a1111111-1111-1111-1111-111111111111',
                'a2222222-2222-2222-2222-222222222222'))::int,
  2,
  'a user can view the profile of someone on the same trip'
);

reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub": "a2222222-2222-2222-2222-222222222222", "role":"authenticated"}';

SELECT throws_ok(
  $$ insert into public.signups (id, trip_id, user_id, bag_count)
     values ('f2222222-0000-0000-0000-000000000003',
             'f1111111-0000-0000-0000-000000000001',
             'a1111111-1111-1111-1111-111111111111', 1) $$,
  '42501',
  'new row violates row-level security policy for table "signups"',
  'user cannot insert a signup on another user''s behalf (WITH CHECK fails)'
);

reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub": "a1111111-1111-1111-1111-111111111111", "role":"authenticated"}';

SELECT lives_ok(
  $$ update public.signups set left_at = now()
     where id = 'f2222222-0000-0000-0000-000000000001' $$,
  'user can update (leave) their own signup'
);

reset role;

-- The other user's signup (inserted above) is left alone by user A trying
-- to leave it on their behalf -- USING clause filters the row out, zero
-- rows affected, not an error.
set local role authenticated;
set local request.jwt.claims = '{"sub": "a1111111-1111-1111-1111-111111111111", "role":"authenticated"}';

update public.signups
set left_at = now()
where id = 'f2222222-0000-0000-0000-000000000002';

reset role;

SELECT is(
  (select left_at from public.signups where id = 'f2222222-0000-0000-0000-000000000002'),
  null,
  'user cannot update another user''s signup (USING clause filters it out)'
);

-- Leaving is a soft delete (left_at set, 0002) and restrict_signup_updates
-- polices that transition. A DELETE grant would route straight around it --
-- a member could erase their signup instead of leaving, taking the row that
-- sync_trip_status and signups_one_active_per_user both read with it. No
-- delete grant exists, so this is rejected outright.
set local role authenticated;
set local request.jwt.claims = '{"sub": "a1111111-1111-1111-1111-111111111111", "role":"authenticated"}';

SELECT throws_ok(
  $$ delete from public.signups where id = 'f2222222-0000-0000-0000-000000000001' $$,
  '42501',
  'permission denied for table signups',
  'a user cannot delete their own signup; leaving must go through left_at'
);

reset role;

SELECT is(
  (select count(*) from public.signups where id = 'f2222222-0000-0000-0000-000000000001')::int,
  1,
  'the rejected delete left the signup row in place'
);

set local role anon;
reset request.jwt.claims;

SELECT is(
  (select count(*) from public.signups)::int,
  0,
  'anon has no access to signups'
);

reset role;

-- anon holds only a SELECT grant on signups (0009), so both write paths fail
-- at the grant level -- there is no anon-facing join or leave.
set local role anon;
reset request.jwt.claims;

SELECT throws_ok(
  $$ insert into public.signups (trip_id, user_id, bag_count)
     values ('f1111111-0000-0000-0000-000000000001',
             'a1111111-1111-1111-1111-111111111111', 1) $$,
  '42501',
  'permission denied for table signups',
  'anon cannot join a trip (no insert grant on signups)'
);

reset role;

set local role anon;
reset request.jwt.claims;

SELECT throws_ok(
  $$ update public.signups set left_at = now()
     where id = 'f2222222-0000-0000-0000-000000000002' $$,
  '42501',
  'permission denied for table signups',
  'anon cannot leave a trip (no update grant on signups)'
);

reset role;

-- ============================================================
-- Private trips (0013). "Private" means undiscoverable, not
-- unjoinable: the trip row is hidden from anyone not already connected to
-- it, and holding the (unguessable) UUID is what entitles a link-holder to
-- see it -- which they do through get_trip_for_view, not a direct select.
--
-- The join itself is deliberately unchanged: the signups insert policy
-- never consults visibility, because you cannot insert a signup without
-- already knowing the trip id. That's asserted below, and it's why
-- signup_capacity_test.sql needed no edits for this feature.
--
-- Users C (creator/member of the private trip) and D (a link-holder who
-- joins it) are separate from A and B because signups_one_active_per_user
-- allows each user only one active signup, and A and B are both already on
-- the public fixture trip.
-- ============================================================

insert into auth.users (id, email) values
  ('a3333333-3333-3333-3333-333333333333', 'rls-userC@nd.edu'),
  ('a4444444-4444-4444-4444-444444444444', 'rls-userD@nd.edu');

insert into public.trips
  (id, direction, departure_time, pickup_location, dropoff_location,
   seat_capacity, bag_capacity, created_by, status, visibility)
values
  ('f1111111-0000-0000-0000-000000000005', 'to_airport',
   now() + interval '4 hours', 'Dorm', 'Airport', 4, 4,
   'a3333333-3333-3333-3333-333333333333', 'open', 'private');

insert into public.signups (id, trip_id, user_id, bag_count)
values
  ('f2222222-0000-0000-0000-000000000005',
   'f1111111-0000-0000-0000-000000000005',
   'a3333333-3333-3333-3333-333333333333', 1);

-- B is signed in and unrelated to the private trip: it must not appear in a
-- plain select, which is the query a curious student would run against
-- PostgREST with the anon key that ships in the browser bundle.
set local role authenticated;
set local request.jwt.claims = '{"sub": "a2222222-2222-2222-2222-222222222222", "role":"authenticated"}';

SELECT is(
  (select count(*) from public.trips
   where id = 'f1111111-0000-0000-0000-000000000005')::int,
  0,
  'a private trip is invisible to an authenticated user with no connection to it'
);

-- Its roster is hidden by the same rule, since the signups policy inherits
-- the trip's visibility rather than restating it.
SELECT is(
  (select count(*) from public.signups
   where trip_id = 'f1111111-0000-0000-0000-000000000005')::int,
  0,
  'a private trip''s signups are hidden from the same user'
);

-- The public fixture trip is untouched by any of this.
SELECT is(
  (select count(*) from public.trips
   where id = 'f1111111-0000-0000-0000-000000000001')::int,
  1,
  'public trips stay visible to every authenticated user'
);

reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub": "a3333333-3333-3333-3333-333333333333", "role":"authenticated"}';

SELECT is(
  (select count(*) from public.trips
   where id = 'f1111111-0000-0000-0000-000000000005')::int,
  1,
  'the creator can see their own private trip'
);

reset role;

-- get_trip_for_view is the link-resolution path: security definer, so it
-- answers for a private trip the caller could not select directly. The UUID
-- is the credential.
set local role authenticated;
set local request.jwt.claims = '{"sub": "a2222222-2222-2222-2222-222222222222", "role":"authenticated"}';

SELECT is(
  (select public.get_trip_for_view('f1111111-0000-0000-0000-000000000005')
          -> 'trip' ->> 'id'),
  'f1111111-0000-0000-0000-000000000005',
  'a link-holder can resolve a private trip they cannot select directly'
);

-- Link-holders see who is already aboard before committing a seat.
SELECT is(
  jsonb_array_length(
    public.get_trip_for_view('f1111111-0000-0000-0000-000000000005') -> 'signups'
  ),
  1,
  'get_trip_for_view returns the roster alongside the trip'
);

SELECT ok(
  public.get_trip_for_view('f1111111-0000-0000-0000-0000000000ff') is null,
  'get_trip_for_view returns null for an id that matches no trip'
);

reset role;

-- Same shape as create_trip_with_signup: EXECUTE defaults to PUBLIC, so the
-- function's own auth.uid() guard is what actually holds the door.
set local role anon;
reset request.jwt.claims;

SELECT throws_ok(
  $$ select public.get_trip_for_view('f1111111-0000-0000-0000-000000000005') $$,
  'P0001',
  'Not authenticated',
  'anon reaching get_trip_for_view is stopped by its own auth.uid() guard'
);

reset role;

-- The join path itself: D holds the link and joins with the ordinary
-- signups insert -- the same statement joinTrip issues for a public trip,
-- against the same capacity trigger. No visibility check anywhere in it.
set local role authenticated;
set local request.jwt.claims = '{"sub": "a4444444-4444-4444-4444-444444444444", "role":"authenticated"}';

SELECT lives_ok(
  $$ insert into public.signups (id, trip_id, user_id, bag_count)
     values ('f2222222-0000-0000-0000-000000000006',
             'f1111111-0000-0000-0000-000000000005',
             'a4444444-4444-4444-4444-444444444444', 1) $$,
  'a link-holder joins a private trip through the ordinary signups insert'
);

-- And having joined, the trip resolves for them by plain select from then on.
SELECT is(
  (select count(*) from public.trips
   where id = 'f1111111-0000-0000-0000-000000000005')::int,
  1,
  'a member can select the private trip directly once they have joined'
);

reset role;

-- ============================================================
-- create_trip_with_signup: security definer, so it runs as the owner and
-- bypasses RLS entirely. Postgres grants EXECUTE on functions to PUBLIC by
-- default, which means anon can reach it despite 0003 only naming
-- `authenticated` -- its own auth.uid() guard is the thing actually holding
-- the door, so assert that directly.
-- ============================================================

set local role anon;
reset request.jwt.claims;

SELECT throws_ok(
  $$ select public.create_trip_with_signup(
       'to_airport', now() + interval '2 hours', 'Dorm', 'Airport',
       null, 4, 2, 40, null, 1
     ) $$,
  'P0001',
  'Not authenticated',
  'anon reaching create_trip_with_signup is stopped by its own auth.uid() guard'
);

reset role;

SELECT * FROM finish();
ROLLBACK;
