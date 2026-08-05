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
SELECT plan(16);

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

-- Also covers sync_trip_status's terminal guard, indirectly but for real:
-- expiring the trip closes its signups, and that left_at update fires
-- sync_trip_status. Without its `if v_status not in ('open','full') then
-- return` early exit it would recompute zero active seats, try to move the
-- trip to 'abandoned', and be rejected by validate_trip_status_transition --
-- failing the whole run_trip_cleanup() call before this assertion is reached.
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

-- Abandoned is terminal, and migration 0010 now enforces that on the way in:
-- the join is rejected outright rather than landing and relying on
-- sync_trip_status to decline to revive the trip. user1's own signup here was
-- closed when it left above, so it holds no active signup -- this rejection
-- is the status guard, not signups_one_active_per_user.
SELECT throws_ok(
  $$ insert into public.signups (trip_id, user_id, bag_count)
     values ('aaaaaaaa-0000-0000-0000-000000000004',
             '11111111-1111-1111-1111-111111111111', 1) $$,
  'P0001',
  'This trip has already ended.',
  'a cleaned-up trip cannot be joined'
);

SELECT is(
  (select status from public.trips where id = 'aaaaaaaa-0000-0000-0000-000000000004'),
  'abandoned',
  'the rejected join left the trip abandoned'
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
-- Case 3: run_trip_cleanup's WHERE covers `status in ('open','full')`, but
-- Case 1 only ever exercised the 'open' half. A trip that filled up and was
-- then never confirmed is exactly the case that must not get stranded.
-- Also proves expiry closes *every* active signup, not just the first.
--
-- The trip is created with a future departure_time and backdated afterward,
-- rather than inserted already-overdue: that keeps the fixture valid if a
-- join guard on past-departure trips lands later. Updating departure_time
-- doesn't fire validate_trip_status_transition (it's `before update of
-- status`), so the backdate is inert.
-- ============================================================

insert into auth.users (id, email) values
  ('33333333-3333-3333-3333-333333333333', 'user3@nd.edu'),
  ('44444444-4444-4444-4444-444444444444', 'user4@nd.edu');

insert into public.trips
  (id, direction, departure_time, pickup_location, dropoff_location,
   seat_capacity, bag_capacity, created_by, status)
values
  ('aaaaaaaa-0000-0000-0000-000000000005', 'to_airport',
   now() + interval '2 hours', 'Dorm', 'Airport', 2, 4,
   '33333333-3333-3333-3333-333333333333', 'open');

insert into public.signups (trip_id, user_id, bag_count)
values
  ('aaaaaaaa-0000-0000-0000-000000000005',
   '33333333-3333-3333-3333-333333333333', 1),
  ('aaaaaaaa-0000-0000-0000-000000000005',
   '44444444-4444-4444-4444-444444444444', 1);

SELECT is(
  (select status from public.trips where id = 'aaaaaaaa-0000-0000-0000-000000000005'),
  'full',
  'both seats taken puts the trip in full, setting up the expiry check'
);

update public.trips
set departure_time = now() - interval '2 hours'
where id = 'aaaaaaaa-0000-0000-0000-000000000005';

select public.run_trip_cleanup();

SELECT is(
  (select status from public.trips where id = 'aaaaaaaa-0000-0000-0000-000000000005'),
  'expired',
  'a full trip overdue by >1hr expires too, not just an open one'
);

SELECT is(
  (select count(*) from public.signups
   where trip_id = 'aaaaaaaa-0000-0000-0000-000000000005'
     and left_at is null)::int,
  0,
  'expiring a trip closes every active signup on it, not just one'
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

-- The BEFORE trigger is the outer gate: an unrecognized status is rejected by
-- the state machine with P0001 before trips_status_check (23514) ever gets a
-- look at it. Both layers exist; this pins down which one answers first.
SELECT throws_ok(
  $$ update public.trips set status = 'banana'
     where id = 'aaaaaaaa-0000-0000-0000-000000000002' $$,
  'P0001',
  'Invalid trip status transition from open to banana',
  'an unrecognized status is rejected by the state machine, ahead of the CHECK constraint'
);

-- ============================================================
-- The expiry rule is only as real as the schedule that runs it: every
-- assertion above calls run_trip_cleanup() by hand, so without this the
-- suite would still pass if migration 0006's cron.schedule were dropped.
-- ============================================================

SELECT is(
  (select schedule from cron.job where jobname = 'trip-cleanup'),
  '*/5 * * * *',
  'the trip-cleanup job is registered with pg_cron on a 5-minute schedule'
);

SELECT * FROM finish();
ROLLBACK;
