-- pgTAP tests for signups_one_active_per_user (migration 0002), the
-- partial unique index enforcing "one active group at a time" per user:
--   unique index on (user_id) where left_at is null.
-- This is the constraint public.friendlyError() (src/lib/friendly-error.ts)
-- assumes exists and maps its 23505 code to ONE_ACTIVE_GROUP_MESSAGE, so
-- these tests confirm the DB actually raises that violation, not just that
-- the app-layer message-mapping logic is internally consistent.
--
-- Run with: supabase test db --local
BEGIN;
SELECT plan(5);

insert into auth.users (id, email) values
  ('f1111111-1111-1111-1111-111111111111', 'oneactive-user1@nd.edu'),
  ('f2222222-2222-2222-2222-222222222222', 'oneactive-user2@nd.edu');

insert into public.trips
  (id, direction, departure_time, pickup_location, dropoff_location,
   seat_capacity, bag_capacity, created_by, status)
values
  ('11111111-0000-0000-0000-000000000001', 'to_airport',
   now() + interval '2 hours', 'Dorm', 'Airport', 4, 4,
   'f1111111-1111-1111-1111-111111111111', 'open'),
  ('11111111-0000-0000-0000-000000000002', 'to_airport',
   now() + interval '3 hours', 'Dorm', 'Airport', 4, 4,
   'f1111111-1111-1111-1111-111111111111', 'open');

-- ============================================================
-- Case 1: a user with no active signup can join a trip.
-- ============================================================

SELECT lives_ok(
  $$ insert into public.signups (id, trip_id, user_id, bag_count)
     values ('22222222-0000-0000-0000-000000000001',
             '11111111-0000-0000-0000-000000000001',
             'f1111111-1111-1111-1111-111111111111', 0) $$,
  'a user with no active signup can join a trip'
);

-- ============================================================
-- Case 2: that same user cannot also join a second trip while still active
-- on the first -- the partial unique index rejects it with 23505.
-- ============================================================

SELECT throws_ok(
  $$ insert into public.signups (trip_id, user_id, bag_count)
     values ('11111111-0000-0000-0000-000000000002',
             'f1111111-1111-1111-1111-111111111111', 0) $$,
  '23505',
  'duplicate key value violates unique constraint "signups_one_active_per_user"',
  'joining a second trip while already active elsewhere is rejected'
);

SELECT is(
  (select count(*) from public.signups where trip_id = '11111111-0000-0000-0000-000000000002')::int,
  0,
  'the rejected join left no signup row on the second trip'
);

-- ============================================================
-- Case 3: once the first signup is left (left_at set), the index no longer
-- applies to it, so the user is free to join a new trip.
-- ============================================================

update public.signups
set left_at = now()
where id = '22222222-0000-0000-0000-000000000001';

SELECT lives_ok(
  $$ insert into public.signups (trip_id, user_id, bag_count)
     values ('11111111-0000-0000-0000-000000000002',
             'f1111111-1111-1111-1111-111111111111', 0) $$,
  'after leaving the prior trip, the user can join a new one'
);

-- ============================================================
-- Case 4: the index is scoped per-user, not global -- a different user can
-- hold an active signup on the first trip at the same time.
-- ============================================================

SELECT lives_ok(
  $$ insert into public.signups (trip_id, user_id, bag_count)
     values ('11111111-0000-0000-0000-000000000001',
             'f2222222-2222-2222-2222-222222222222', 0) $$,
  'the unique index is scoped per-user: a different user can be active concurrently'
);

SELECT * FROM finish();
ROLLBACK;
