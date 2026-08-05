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
SELECT plan(23);

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

SELECT throws_ok(
  $$ update public.signups set joined_at = now() - interval '10 days'
     where id = 'e1111111-0000-0000-0000-000000000001' $$,
  'P0001',
  'Only leaving a trip (setting left_at) is allowed after joining.',
  'joined_at cannot be changed after joining'
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

-- ============================================================
-- Case 6: rejoining the trip you just left. restrict_signup_updates refuses
-- to resurrect a left row on purpose (0002), so rejoining must produce a
-- *second* row -- which is what puts the join back through
-- check_signup_capacity instead of sneaking in around it.
--
-- The trip keeps a second member throughout so it stays 'open' when c7
-- leaves; if it emptied out it would flip to 'abandoned' and the rejoin
-- would be testing a terminal trip rather than the rejoin path.
-- ============================================================

insert into auth.users (id, email) values
  ('c7777777-7777-7777-7777-777777777777', 'cap-user7@nd.edu'),
  ('c8888888-8888-8888-8888-888888888888', 'cap-user8@nd.edu');

insert into public.trips
  (id, direction, departure_time, pickup_location, dropoff_location,
   seat_capacity, bag_capacity, created_by, status)
values
  ('d1111111-0000-0000-0000-000000000004', 'to_airport',
   now() + interval '2 hours', 'Dorm', 'Airport', 2, 4,
   'c1111111-1111-1111-1111-111111111111', 'open');

insert into public.signups (id, trip_id, user_id, bag_count)
values
  ('e1111111-0000-0000-0000-000000000007',
   'd1111111-0000-0000-0000-000000000004',
   'c7777777-7777-7777-7777-777777777777', 1),
  ('e1111111-0000-0000-0000-000000000008',
   'd1111111-0000-0000-0000-000000000004',
   'c8888888-8888-8888-8888-888888888888', 1);

update public.signups
set left_at = now()
where id = 'e1111111-0000-0000-0000-000000000007';

SELECT is(
  (select status from public.trips where id = 'd1111111-0000-0000-0000-000000000004'),
  'open',
  'a full trip reopens when one of its two members leaves, setting up the rejoin'
);

SELECT lives_ok(
  $$ insert into public.signups (trip_id, user_id, bag_count)
     values ('d1111111-0000-0000-0000-000000000004',
             'c7777777-7777-7777-7777-777777777777', 1) $$,
  'a user who left a trip can rejoin that same trip'
);

SELECT is(
  (select count(*) from public.signups
   where trip_id = 'd1111111-0000-0000-0000-000000000004'
     and user_id = 'c7777777-7777-7777-7777-777777777777')::int,
  2,
  'rejoining creates a second signup row rather than reviving the left one'
);

SELECT is(
  (select status from public.trips where id = 'd1111111-0000-0000-0000-000000000004'),
  'full',
  'the rejoin counts toward capacity again and refills the trip'
);

-- ============================================================
-- Case 7: a trip in a terminal status cannot be joined (migration 0010).
-- The cutoff is status, not the clock -- a trip past its departure_time but
-- not yet swept is still 'open' and still joinable by design (DESIGN.md
-- line 16); only cleanup closes the door.
--
-- c6666666 is the one user in this file never successfully joined anything
-- (its Case 1 attempt was rejected on capacity), so it has no active signup
-- and these rejections can only be coming from the status guard, not from
-- signups_one_active_per_user.
-- ============================================================

-- d3 was left 'abandoned' by Case 5 when its last member left.
SELECT throws_ok(
  $$ insert into public.signups (trip_id, user_id, bag_count)
     values ('d1111111-0000-0000-0000-000000000003',
             'c6666666-6666-6666-6666-666666666666', 0) $$,
  'P0001',
  'This trip has already ended.',
  'an abandoned trip cannot be joined'
);

-- open -> expired is a valid transition (0008), so this reaches the same
-- state run_trip_cleanup() would produce, without depending on wall-clock
-- timing to get there.
insert into public.trips
  (id, direction, departure_time, pickup_location, dropoff_location,
   seat_capacity, bag_capacity, created_by, status)
values
  ('d1111111-0000-0000-0000-000000000005', 'to_airport',
   now() + interval '2 hours', 'Dorm', 'Airport', 4, 4,
   'c1111111-1111-1111-1111-111111111111', 'open');

update public.trips
set status = 'expired'
where id = 'd1111111-0000-0000-0000-000000000005';

SELECT throws_ok(
  $$ insert into public.signups (trip_id, user_id, bag_count)
     values ('d1111111-0000-0000-0000-000000000005',
             'c6666666-6666-6666-6666-666666666666', 0) $$,
  'P0001',
  'This trip has already ended.',
  'an expired trip cannot be joined'
);

-- The guard must not have made every join harder: an open trip with room
-- still accepts the same user that both rejections above turned away.
SELECT lives_ok(
  $$ insert into public.signups (trip_id, user_id, bag_count)
     values ('d1111111-0000-0000-0000-000000000001',
             'c6666666-6666-6666-6666-666666666666', 0) $$,
  'an open trip with room still accepts a join'
);

-- ============================================================
-- Case 8: the optional per-person bag cap (migration 0010), which is a
-- separate limit from the trip's total bag_capacity -- both trips below have
-- bag capacity to spare, so any rejection here is the per-person cap alone.
--
-- c2 and c3 are free at this point: both left their Case 5 signups.
-- ============================================================

insert into public.trips
  (id, direction, departure_time, pickup_location, dropoff_location,
   seat_capacity, bag_capacity, max_bags_per_person, created_by, status)
values
  ('d1111111-0000-0000-0000-000000000006', 'to_airport',
   now() + interval '2 hours', 'Dorm', 'Airport', 4, 10, 2,
   'c1111111-1111-1111-1111-111111111111', 'open');

SELECT throws_ok(
  $$ insert into public.signups (trip_id, user_id, bag_count)
     values ('d1111111-0000-0000-0000-000000000006',
             'c2222222-2222-2222-2222-222222222222', 3) $$,
  'P0001',
  'This trip limits riders to 2 bag(s) each.',
  'a rider bringing more than max_bags_per_person is rejected'
);

-- The cap is a maximum, not a strict bound: exactly max_bags_per_person is
-- allowed. Off-by-one here would be invisible without this case.
SELECT lives_ok(
  $$ insert into public.signups (trip_id, user_id, bag_count)
     values ('d1111111-0000-0000-0000-000000000006',
             'c2222222-2222-2222-2222-222222222222', 2) $$,
  'a rider bringing exactly max_bags_per_person is allowed'
);

-- Null means no per-person limit at all (0010 made the column nullable), so
-- the total bag_capacity is the only bag constraint left.
insert into public.trips
  (id, direction, departure_time, pickup_location, dropoff_location,
   seat_capacity, bag_capacity, max_bags_per_person, created_by, status)
values
  ('d1111111-0000-0000-0000-000000000007', 'to_airport',
   now() + interval '2 hours', 'Dorm', 'Airport', 4, 10, null,
   'c1111111-1111-1111-1111-111111111111', 'open');

SELECT lives_ok(
  $$ insert into public.signups (trip_id, user_id, bag_count)
     values ('d1111111-0000-0000-0000-000000000007',
             'c3333333-3333-3333-3333-333333333333', 5) $$,
  'a null max_bags_per_person imposes no per-person limit'
);

SELECT * FROM finish();
ROLLBACK;
