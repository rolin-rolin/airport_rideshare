-- pgTAP tests for the trip cleanup rules (DESIGN.md §4.4), covering the
-- current behavior after migration 0008 (the "departed" status and its
-- manual mark-departed action were removed entirely):
--   1. Expired: an open/full trip whose departure_time is >1hr in the past
--      is flipped to 'expired' by run_trip_cleanup() (cron), which closes
--      every active signup on it (trips_close_signups_on_terminal).
--   2. Abandoned: the moment the last active signup on an open/full trip
--      leaves, sync_trip_status flips it straight to 'abandoned' — no cron
--      involved.
--
-- Run with: supabase test db --local
BEGIN;
SELECT plan(10);

-- Shared fixtures: two users, one vehicle type, reused across both cases.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'user1@nd.edu'),
  ('22222222-2222-2222-2222-222222222222', 'user2@nd.edu');

-- ============================================================
-- Case 1: expired (cron-driven, departure_time > 1hr in the past)
-- ============================================================

insert into public.trips
  (id, direction, departure_time, pickup_location, dropoff_location,
   seat_capacity, bag_capacity, created_by, status)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'to_airport',
   now() - interval '2 hours', 'Dorm', 'Airport', 4, 2,
   '11111111-1111-1111-1111-111111111111', 'open');

insert into public.signups (trip_id, user_id, bag_count)
values ('aaaaaaaa-0000-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111', 1);

-- A trip that's overdue but still inside the 1hr grace window must not be
-- touched yet, so we can prove the cutoff is actually respected.
insert into public.trips
  (id, direction, departure_time, pickup_location, dropoff_location,
   seat_capacity, bag_capacity, created_by, status)
values
  ('aaaaaaaa-0000-0000-0000-000000000002', 'to_airport',
   now() - interval '30 minutes', 'Dorm', 'Airport', 4, 2,
   '11111111-1111-1111-1111-111111111111', 'open');

select public.run_trip_cleanup();

SELECT is(
  (select status from public.trips where id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  'expired',
  'trip overdue by >1hr is flipped to expired by run_trip_cleanup()'
);

SELECT is(
  (select left_at is not null from public.signups
   where trip_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  true,
  'expiring a trip closes its active signups'
);

SELECT is(
  (select status from public.trips where id = 'aaaaaaaa-0000-0000-0000-000000000002'),
  'open',
  'trip overdue by <1hr is left untouched by run_trip_cleanup()'
);

-- ============================================================
-- Case 2: abandoned (instant, last-member-leaves trigger)
-- ============================================================

insert into public.trips
  (id, direction, departure_time, pickup_location, dropoff_location,
   seat_capacity, bag_capacity, created_by, status)
values
  ('aaaaaaaa-0000-0000-0000-000000000004', 'to_airport',
   now() + interval '2 hours', 'Dorm', 'Airport', 4, 2,
   '11111111-1111-1111-1111-111111111111', 'open');

insert into public.signups (id, trip_id, user_id, bag_count)
values
  ('bbbbbbbb-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000004',
   '11111111-1111-1111-1111-111111111111', 1),
  ('bbbbbbbb-0000-0000-0000-000000000002',
   'aaaaaaaa-0000-0000-0000-000000000004',
   '22222222-2222-2222-2222-222222222222', 0);

-- One of two members leaves: trip should stay open, not abandoned.
update public.signups
set left_at = now()
where id = 'bbbbbbbb-0000-0000-0000-000000000001';

SELECT is(
  (select status from public.trips where id = 'aaaaaaaa-0000-0000-0000-000000000004'),
  'open',
  'trip with a remaining active member stays open, not abandoned'
);

-- The last member leaves: trip should flip to abandoned instantly.
update public.signups
set left_at = now()
where id = 'bbbbbbbb-0000-0000-0000-000000000002';

SELECT is(
  (select status from public.trips where id = 'aaaaaaaa-0000-0000-0000-000000000004'),
  'abandoned',
  'trip with zero active members flips to abandoned the instant the last one leaves'
);

-- Abandoned is terminal: a stray signup-table change shouldn't move it
-- back to open/full (sync_trip_status only acts when status in open/full).
insert into public.signups (trip_id, user_id, bag_count)
values ('aaaaaaaa-0000-0000-0000-000000000004',
        '11111111-1111-1111-1111-111111111111', 1);

SELECT is(
  (select status from public.trips where id = 'aaaaaaaa-0000-0000-0000-000000000004'),
  'abandoned',
  'abandoned is terminal: a new signup on the trip does not revive it to open/full'
);

-- ============================================================
-- run_trip_cleanup() must not disturb non-open/full trips
-- ============================================================

select public.run_trip_cleanup();

SELECT is(
  (select status from public.trips where id = 'aaaaaaaa-0000-0000-0000-000000000004'),
  'abandoned',
  'run_trip_cleanup does not touch an already-abandoned trip'
);

-- ============================================================
-- State machine guard: invalid transitions are still rejected
-- ============================================================

SELECT throws_ok(
  $$ update public.trips set status = 'open'
     where id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  'P0001',
  'Invalid trip status transition from expired to open',
  'expired -> open is rejected by validate_trip_status_transition'
);

SELECT throws_ok(
  $$ update public.trips set status = 'full'
     where id = 'aaaaaaaa-0000-0000-0000-000000000004' $$,
  'P0001',
  'Invalid trip status transition from abandoned to full',
  'abandoned -> full is rejected by validate_trip_status_transition'
);

-- 'departed' no longer exists as a valid transition target — the BEFORE
-- trigger's state-machine guard runs ahead of the CHECK constraint and
-- rejects it first, same as any other unrecognized status.
SELECT throws_ok(
  $$ update public.trips set status = 'departed'
     where id = 'aaaaaaaa-0000-0000-0000-000000000002' $$,
  'P0001',
  'Invalid trip status transition from open to departed',
  'departed is not a reachable status (rejected by validate_trip_status_transition)'
);

SELECT * FROM finish();
ROLLBACK;
