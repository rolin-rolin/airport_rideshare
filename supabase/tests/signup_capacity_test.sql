-- pgTAP tests for signup capacity enforcement and the restrict-update guard
-- (DESIGN.md §4.3), covering the triggers defined in migration 0002 and the
-- current body of sync_trip_status (migration 0006):
--   1. check_signup_capacity (BEFORE INSERT on signups): rejects a join once
--      seat_capacity or bag_capacity would be exceeded.
--   2. sync_trip_status (AFTER INSERT/DELETE/UPDATE on signups): flips
--      trips.status to 'full' once capacity is reached, back to 'open' when
--      a departure frees room, and to 'abandoned' when the last active
--      member leaves -- even from 'full', not just 'open'.
--   3. restrict_signup_updates (BEFORE UPDATE on signups): once joined, only
--      left_at may change; re-leaving an already-left row is also rejected.
--
-- Run with: supabase test db --local
BEGIN;
SELECT plan(12);

-- Shared fixtures: six users. signups_one_active_per_user is a *global*
-- unique index (one active signup per user across all trips, not per trip),
-- so each case below that needs an active signup on a fresh trip gets its
-- own users rather than reusing one still active elsewhere.
insert into auth.users (id, email) values
  ('c1111111-1111-1111-1111-111111111111', 'cap-user1@nd.edu'),
  ('c2222222-2222-2222-2222-222222222222', 'cap-user2@nd.edu'),
  ('c3333333-3333-3333-3333-333333333333', 'cap-user3@nd.edu'),
  ('c4444444-4444-4444-4444-444444444444', 'cap-user4@nd.edu'),
  ('c5555555-5555-5555-5555-555555555555', 'cap-user5@nd.edu'),
  ('c6666666-6666-6666-6666-666666666666', 'cap-user6@nd.edu');

-- ============================================================
-- Case 1: seat boundary -- filling seat_capacity flips status to 'full',
-- and the next join is rejected outright.
-- ============================================================

insert into public.trips
  (id, direction, departure_time, pickup_location, dropoff_location,
   seat_capacity, bag_capacity, created_by, status)
values
  ('d1111111-0000-0000-0000-000000000001', 'to_airport',
   now() + interval '2 hours', 'Dorm', 'Airport', 2, 5,
   'c1111111-1111-1111-1111-111111111111', 'open');

insert into public.signups (id, trip_id, user_id, bag_count)
values
  ('e1111111-0000-0000-0000-000000000001',
   'd1111111-0000-0000-0000-000000000001',
   'c1111111-1111-1111-1111-111111111111', 1);

SELECT is(
  (select status from public.trips where id = 'd1111111-0000-0000-0000-000000000001'),
  'open',
  'trip with one of two seats filled stays open'
);

insert into public.signups (id, trip_id, user_id, bag_count)
values
  ('e1111111-0000-0000-0000-000000000002',
   'd1111111-0000-0000-0000-000000000001',
   'c2222222-2222-2222-2222-222222222222', 1);

SELECT is(
  (select status from public.trips where id = 'd1111111-0000-0000-0000-000000000001'),
  'full',
  'sync_trip_status flips open->full when seats reach capacity'
);

SELECT throws_ok(
  $$ insert into public.signups (trip_id, user_id, bag_count)
     values ('d1111111-0000-0000-0000-000000000001',
             'c3333333-3333-3333-3333-333333333333', 0) $$,
  'P0001',
  'This trip is full: no seats remaining.',
  'signup rejected once seat_capacity is reached'
);

-- ============================================================
-- Case 2: bag boundary -- filling bag_capacity flips status to 'full' even
-- with seats free, and the next join is rejected on bags alone.
-- ============================================================

insert into public.trips
  (id, direction, departure_time, pickup_location, dropoff_location,
   seat_capacity, bag_capacity, created_by, status)
values
  ('d1111111-0000-0000-0000-000000000002', 'to_airport',
   now() + interval '2 hours', 'Dorm', 'Airport', 5, 3,
   'c1111111-1111-1111-1111-111111111111', 'open');

insert into public.signups (id, trip_id, user_id, bag_count)
values
  ('e1111111-0000-0000-0000-000000000003',
   'd1111111-0000-0000-0000-000000000002',
   'c4444444-4444-4444-4444-444444444444', 2),
  ('e1111111-0000-0000-0000-000000000004',
   'd1111111-0000-0000-0000-000000000002',
   'c5555555-5555-5555-5555-555555555555', 1);

SELECT is(
  (select status from public.trips where id = 'd1111111-0000-0000-0000-000000000002'),
  'full',
  'sync_trip_status flips open->full when bags reach capacity, seats still free'
);

SELECT throws_ok(
  $$ insert into public.signups (trip_id, user_id, bag_count)
     values ('d1111111-0000-0000-0000-000000000002',
             'c6666666-6666-6666-6666-666666666666', 1) $$,
  'P0001',
  'This trip is full: not enough bag capacity remaining.',
  'signup rejected once bag_capacity is reached even though seats remain'
);

-- ============================================================
-- Case 3: a departure frees room -- 'full' reverts to 'open'.
-- ============================================================

update public.signups
set left_at = now()
where id = 'e1111111-0000-0000-0000-000000000002';

SELECT is(
  (select status from public.trips where id = 'd1111111-0000-0000-0000-000000000001'),
  'open',
  'reopening when a member leaves'
);

-- ============================================================
-- Case 4: restrict_signup_updates guards the signups row after joining.
-- ============================================================

SELECT throws_ok(
  $$ update public.signups set left_at = now()
     where id = 'e1111111-0000-0000-0000-000000000002' $$,
  'P0001',
  'This signup has already been left. Join again to create a new signup.',
  'leaving an already-left signup is rejected'
);

SELECT throws_ok(
  $$ update public.signups set bag_count = 4
     where id = 'e1111111-0000-0000-0000-000000000001' $$,
  'P0001',
  'Only leaving a trip (setting left_at) is allowed after joining.',
  'bag_count cannot be changed after joining'
);

SELECT throws_ok(
  $$ update public.signups set trip_id = 'd1111111-0000-0000-0000-000000000002'
     where id = 'e1111111-0000-0000-0000-000000000001' $$,
  'P0001',
  'Only leaving a trip (setting left_at) is allowed after joining.',
  'trip_id cannot be changed after joining'
);

SELECT throws_ok(
  $$ update public.signups set user_id = 'c3333333-3333-3333-3333-333333333333'
     where id = 'e1111111-0000-0000-0000-000000000001' $$,
  'P0001',
  'Only leaving a trip (setting left_at) is allowed after joining.',
  'user_id cannot be changed after joining'
);

-- ============================================================
-- Case 5: last member leaving a FULL trip goes straight to 'abandoned', not
-- back to 'open' -- the used_seats = 0 branch takes priority.
-- ============================================================

insert into public.trips
  (id, direction, departure_time, pickup_location, dropoff_location,
   seat_capacity, bag_capacity, created_by, status)
values
  ('d1111111-0000-0000-0000-000000000003', 'to_airport',
   now() + interval '2 hours', 'Dorm', 'Airport', 2, 5,
   'c1111111-1111-1111-1111-111111111111', 'open');

-- c2 freed up in Case 3 (its earlier signup left); c3's earlier insert
-- attempt in Case 1 was rejected, so it never held a row -- both are free.
insert into public.signups (id, trip_id, user_id, bag_count)
values
  ('e1111111-0000-0000-0000-000000000005',
   'd1111111-0000-0000-0000-000000000003',
   'c2222222-2222-2222-2222-222222222222', 0),
  ('e1111111-0000-0000-0000-000000000006',
   'd1111111-0000-0000-0000-000000000003',
   'c3333333-3333-3333-3333-333333333333', 0);

SELECT is(
  (select status from public.trips where id = 'd1111111-0000-0000-0000-000000000003'),
  'full',
  'two-seat trip with both seats filled is full, setting up the abandon check'
);

-- Two separate statements (not a single multi-row UPDATE) so
-- sync_trip_status's per-row recompute sees each departure in turn.
update public.signups
set left_at = now()
where id = 'e1111111-0000-0000-0000-000000000005';

update public.signups
set left_at = now()
where id = 'e1111111-0000-0000-0000-000000000006';

SELECT is(
  (select status from public.trips where id = 'd1111111-0000-0000-0000-000000000003'),
  'abandoned',
  'last member leaving a full trip goes straight to abandoned, not open'
);

SELECT * FROM finish();
ROLLBACK;
