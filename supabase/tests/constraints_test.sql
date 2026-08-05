-- pgTAP tests for the table-level CHECK and FOREIGN KEY constraints on trips
-- and signups (migrations 0002, 0006, 0008). These are the declarative floor
-- underneath the trigger logic covered elsewhere: the capacity triggers and
-- the status state machine all assume capacities are sane numbers, statuses
-- come from a fixed set, and every trip/signup points at rows that exist.
-- Nothing else in the suite exercises them, so a dropped constraint would go
-- unnoticed.
--
-- Two SQLSTATEs show up below:
--   * 23514 -- CHECK constraint violation.
--   * 23503 -- foreign key violation.
-- Both are raised by Postgres itself, so the assertions name the constraint
-- that fired rather than an application message.
--
-- Note on the signups FK cases: check_signup_capacity (a BEFORE INSERT
-- trigger) runs first and looks the trip up. For a nonexistent trip it finds
-- no row, leaving its capacity variables null; the comparisons then evaluate
-- to null rather than true, so it raises nothing and the FK is what actually
-- rejects the row.
--
-- Run with: supabase test db --local
BEGIN;
SELECT plan(11);

insert into auth.users (id, email) values
  ('b1111111-1111-1111-1111-111111111111', 'constraints-user1@nd.edu');

insert into public.trips
  (id, direction, departure_time, pickup_location, dropoff_location,
   seat_capacity, bag_capacity, created_by, status)
values
  ('b9999999-0000-0000-0000-000000000001', 'to_airport',
   now() + interval '2 hours', 'Dorm', 'Airport', 4, 4,
   'b1111111-1111-1111-1111-111111111111', 'open');

-- ============================================================
-- trips: CHECK constraints
-- ============================================================

SELECT throws_ok(
  $$ insert into public.trips
     (direction, departure_time, pickup_location, dropoff_location,
      seat_capacity, bag_capacity, created_by)
     values ('sideways', now() + interval '2 hours', 'Dorm', 'Airport', 4, 4,
             'b1111111-1111-1111-1111-111111111111') $$,
  '23514',
  'new row for relation "trips" violates check constraint "trips_direction_check"',
  'direction is limited to to_airport / from_airport'
);

-- A zero-seat trip would be created already at capacity: check_signup_capacity
-- would reject the poster's own auto-join, so create_trip_with_signup could
-- never succeed on one. The constraint stops it a layer earlier.
SELECT throws_ok(
  $$ insert into public.trips
     (direction, departure_time, pickup_location, dropoff_location,
      seat_capacity, bag_capacity, created_by)
     values ('to_airport', now() + interval '2 hours', 'Dorm', 'Airport', 0, 4,
             'b1111111-1111-1111-1111-111111111111') $$,
  '23514',
  'new row for relation "trips" violates check constraint "trips_seat_capacity_check"',
  'seat_capacity must be greater than zero'
);

-- bag_capacity may be 0 (a trip taking no luggage is legitimate), so only
-- negative values are rejected -- a different bound from seat_capacity above.
SELECT throws_ok(
  $$ insert into public.trips
     (direction, departure_time, pickup_location, dropoff_location,
      seat_capacity, bag_capacity, created_by)
     values ('to_airport', now() + interval '2 hours', 'Dorm', 'Airport', 4, -1,
             'b1111111-1111-1111-1111-111111111111') $$,
  '23514',
  'new row for relation "trips" violates check constraint "trips_bag_capacity_check"',
  'bag_capacity may not be negative'
);

SELECT lives_ok(
  $$ insert into public.trips
     (direction, departure_time, pickup_location, dropoff_location,
      seat_capacity, bag_capacity, created_by)
     values ('from_airport', now() + interval '2 hours', 'Airport', 'Dorm', 4, 0,
             'b1111111-1111-1111-1111-111111111111') $$,
  'bag_capacity of zero is allowed (a trip with no luggage room)'
);

-- max_bags_per_person (0010) is nullable-or-non-negative: null means "no
-- per-person limit", so the constraint has to permit null while still
-- rejecting a negative cap, which would make the trip unjoinable by anyone.
SELECT throws_ok(
  $$ insert into public.trips
     (direction, departure_time, pickup_location, dropoff_location,
      seat_capacity, bag_capacity, max_bags_per_person, created_by)
     values ('to_airport', now() + interval '2 hours', 'Dorm', 'Airport', 4, 4, -1,
             'b1111111-1111-1111-1111-111111111111') $$,
  '23514',
  'new row for relation "trips" violates check constraint "trips_max_bags_per_person_check"',
  'max_bags_per_person may not be negative'
);

SELECT lives_ok(
  $$ insert into public.trips
     (direction, departure_time, pickup_location, dropoff_location,
      seat_capacity, bag_capacity, max_bags_per_person, created_by)
     values ('to_airport', now() + interval '2 hours', 'Dorm', 'Airport', 4, 4, null,
             'b1111111-1111-1111-1111-111111111111') $$,
  'max_bags_per_person accepts null (no per-person limit)'
);

-- On INSERT there is no state machine to consult (0002's guard is a BEFORE
-- UPDATE OF status trigger), so the CHECK constraint is the only thing
-- keeping a trip from being born in a bogus status.
SELECT throws_ok(
  $$ insert into public.trips
     (direction, departure_time, pickup_location, dropoff_location,
      seat_capacity, bag_capacity, created_by, status)
     values ('to_airport', now() + interval '2 hours', 'Dorm', 'Airport', 4, 4,
             'b1111111-1111-1111-1111-111111111111', 'banana') $$,
  '23514',
  'new row for relation "trips" violates check constraint "trips_status_check"',
  'a trip cannot be inserted directly into an unrecognized status'
);

-- ============================================================
-- trips: foreign keys
-- ============================================================

SELECT throws_ok(
  $$ insert into public.trips
     (direction, departure_time, pickup_location, dropoff_location,
      seat_capacity, bag_capacity, created_by, vehicle_type_id)
     values ('to_airport', now() + interval '2 hours', 'Dorm', 'Airport', 4, 4,
             'b1111111-1111-1111-1111-111111111111',
             '00000000-0000-0000-0000-0000000000ff') $$,
  '23503',
  'insert or update on table "trips" violates foreign key constraint "trips_vehicle_type_id_fkey"',
  'vehicle_type_id must reference a real vehicle type'
);

-- created_by points at profiles, not auth.users -- so a user who somehow
-- never got provisioned by the domain gate cannot own a trip.
SELECT throws_ok(
  $$ insert into public.trips
     (direction, departure_time, pickup_location, dropoff_location,
      seat_capacity, bag_capacity, created_by)
     values ('to_airport', now() + interval '2 hours', 'Dorm', 'Airport', 4, 4,
             '00000000-0000-0000-0000-0000000000aa') $$,
  '23503',
  'insert or update on table "trips" violates foreign key constraint "trips_created_by_fkey"',
  'created_by must reference an existing profile'
);

-- ============================================================
-- signups: CHECK constraint and foreign keys
-- ============================================================

SELECT throws_ok(
  $$ insert into public.signups (trip_id, user_id, bag_count)
     values ('b9999999-0000-0000-0000-000000000001',
             'b1111111-1111-1111-1111-111111111111', -1) $$,
  '23514',
  'new row for relation "signups" violates check constraint "signups_bag_count_check"',
  'bag_count may not be negative'
);

SELECT throws_ok(
  $$ insert into public.signups (trip_id, user_id, bag_count)
     values ('00000000-0000-0000-0000-0000000000bb',
             'b1111111-1111-1111-1111-111111111111', 0) $$,
  '23503',
  'insert or update on table "signups" violates foreign key constraint "signups_trip_id_fkey"',
  'a signup must reference a real trip'
);

SELECT * FROM finish();
ROLLBACK;
