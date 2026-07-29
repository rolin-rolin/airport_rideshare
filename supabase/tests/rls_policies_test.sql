-- pgTAP tests for the RLS policies active on profiles, vehicle_types,
-- trips, and signups (post migration 0008, which dropped the last update
-- policy on trips -- "Active members can mark a trip departed" -- with
-- nothing replacing it, so authenticated users can no longer UPDATE a trip
-- row directly at all).
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
-- Run with: supabase test db --local
BEGIN;
SELECT plan(17);

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
-- profiles: select-only, "to authenticated using (true)"
-- ============================================================

set local role authenticated;
set local request.jwt.claims = '{"sub": "a2222222-2222-2222-2222-222222222222", "role":"authenticated"}';

SELECT is(
  (select count(*) from public.profiles)::int,
  2,
  'authenticated user can view every profile row, not just their own'
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

set local role anon;
reset request.jwt.claims;

SELECT is(
  (select count(*) from public.signups)::int,
  0,
  'anon has no access to signups'
);

reset role;

SELECT * FROM finish();
ROLLBACK;
