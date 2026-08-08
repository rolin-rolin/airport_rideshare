-- pgTAP tests for the realtime.messages RLS policies added in 0014 and
-- fixed in 0015 (Realtime Broadcast authorization for TripsRealtimeListener).
--
-- What's under test is *authorization*, not content delivery: Realtime's
-- websocket fanout to subscribers is a separate mechanism (driven by
-- logical replication of realtime.messages, matching each row's topic
-- column against open channel subscriptions) that these tests can't reach
-- from plain SQL. What RLS on realtime.messages actually gates is the
-- subscribe-time authorization check Realtime runs against Postgres: it
-- sets the `realtime.topic` GUC (read back by realtime.topic()) to the
-- channel being joined and asks "can this role see anything here at all,"
-- which is exactly reproduced below via:
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub": "<uuid>", "role":"authenticated"}';
--   set local realtime.topic = '<topic>';
--   select exists(select 1 from realtime.messages);
-- A prior message must already exist for "authorized" to read true --
-- fixture trip/signup inserts below trigger 0014's triggers, which call
-- realtime.send() and so populate real rows to authorize against, the same
-- way TripsRealtimeListener's own activity would in the app.
--
-- 0015 exists because the "trip:<uuid>" policy originally cast
-- substring(realtime.topic() from 6) straight to uuid, guarded only by a
-- `like 'trip:%'` check that doesn't reliably protect the cast --
-- Postgres can hoist an uncorrelated EXISTS() into an InitPlan and
-- evaluate it before any guard decides whether it should run, so
-- subscribing to "board-public" (authorized by the *other* policy) could
-- still throw `invalid input syntax for type uuid` evaluating this one.
-- Since policies combine with OR, one erroring breaks the whole check
-- regardless of what the other allows -- the "board-public" and malformed
-- topic cases below are what would have caught that before it shipped.
--
-- Run with: supabase test db --local
BEGIN;
SELECT plan(11);

-- Fixtures: A creates both a public and a private trip; B joins the private
-- one; C is a bystander with no connection to either. Inserting the trips
-- and the signup fires 0014's triggers, so realtime.messages already has
-- real rows on "board-public" and both "trip:<id>" topics by the time the
-- assertions below run.
insert into auth.users (id, email) values
  ('e1111111-1111-1111-1111-111111111111', 'rt-userA@nd.edu'),
  ('e2222222-2222-2222-2222-222222222222', 'rt-userB@nd.edu'),
  ('e3333333-3333-3333-3333-333333333333', 'rt-userC@nd.edu');

insert into public.trips
  (id, direction, departure_time, pickup_location, dropoff_location,
   seat_capacity, bag_capacity, created_by, status, visibility)
values
  ('d1111111-0000-0000-0000-000000000001', 'to_airport',
   now() + interval '2 hours', 'Dorm', 'Airport', 4, 4,
   'e1111111-1111-1111-1111-111111111111', 'open', 'public'),
  ('d1111111-0000-0000-0000-000000000002', 'to_airport',
   now() + interval '2 hours', 'Dorm', 'Airport', 4, 4,
   'e1111111-1111-1111-1111-111111111111', 'open', 'private');

insert into public.signups (id, trip_id, user_id, bag_count)
values
  ('d2222222-0000-0000-0000-000000000001',
   'd1111111-0000-0000-0000-000000000002',
   'e2222222-2222-2222-2222-222222222222', 1);

-- ============================================================
-- "board-public" topic: any authenticated user, regardless of connection
-- to any particular trip.
-- ============================================================

set local role authenticated;
set local request.jwt.claims = '{"sub": "e3333333-3333-3333-3333-333333333333", "role":"authenticated"}';
set local realtime.topic = 'board-public';

SELECT ok(
  exists(select 1 from realtime.messages),
  'any authenticated user is authorized for the board-public topic'
);

reset role;

set local role anon;
reset request.jwt.claims;
set local realtime.topic = 'board-public';

SELECT ok(
  not exists(select 1 from realtime.messages),
  'anon is not authorized for the board-public topic (policy is to authenticated only)'
);

reset role;

-- ============================================================
-- "trip:<id>" topic: gated to the trip's creator, an active member, or
-- anyone if the trip is public -- mirrors 0013's trips select policy
-- exactly, since this is the same "can you see this trip" question applied
-- to delivery instead of to a row read.
-- ============================================================

set local role authenticated;
set local request.jwt.claims = '{"sub": "e1111111-1111-1111-1111-111111111111", "role":"authenticated"}';
set local realtime.topic = 'trip:d1111111-0000-0000-0000-000000000001';

SELECT ok(
  exists(select 1 from realtime.messages),
  'the creator is authorized for their public trip''s topic'
);

reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub": "e3333333-3333-3333-3333-333333333333", "role":"authenticated"}';
set local realtime.topic = 'trip:d1111111-0000-0000-0000-000000000001';

SELECT ok(
  exists(select 1 from realtime.messages),
  'a bystander is authorized for a public trip''s topic (public trips are world-readable)'
);

reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub": "e1111111-1111-1111-1111-111111111111", "role":"authenticated"}';
set local realtime.topic = 'trip:d1111111-0000-0000-0000-000000000002';

SELECT ok(
  exists(select 1 from realtime.messages),
  'the creator is authorized for their private trip''s topic'
);

reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub": "e2222222-2222-2222-2222-222222222222", "role":"authenticated"}';
set local realtime.topic = 'trip:d1111111-0000-0000-0000-000000000002';

SELECT ok(
  exists(select 1 from realtime.messages),
  'an active member is authorized for a private trip''s topic'
);

reset role;

-- The key privacy guarantee: a bystander with no connection to the private
-- trip gets nothing -- not even a "something changed" ping -- matching
-- what a direct select against public.trips would already hide from them.
set local role authenticated;
set local request.jwt.claims = '{"sub": "e3333333-3333-3333-3333-333333333333", "role":"authenticated"}';
set local realtime.topic = 'trip:d1111111-0000-0000-0000-000000000002';

SELECT ok(
  not exists(select 1 from realtime.messages),
  'a bystander is not authorized for a private trip''s topic'
);

reset role;

set local role anon;
reset request.jwt.claims;
set local realtime.topic = 'trip:d1111111-0000-0000-0000-000000000001';

SELECT ok(
  not exists(select 1 from realtime.messages),
  'anon is not authorized for any trip topic, public or private'
);

reset role;

-- Nonexistent trip id: same shape as the bystander case, just no row to
-- match at all.
set local role authenticated;
set local request.jwt.claims = '{"sub": "e1111111-1111-1111-1111-111111111111", "role":"authenticated"}';
set local realtime.topic = 'trip:00000000-0000-0000-0000-000000000000';

SELECT ok(
  not exists(select 1 from realtime.messages),
  'a topic naming a trip that does not exist authorizes nobody'
);

reset role;

-- ============================================================
-- 0015's regression case: a malformed "trip:" topic must be denied
-- cleanly, not raise `invalid input syntax for type uuid`. throws_ok would
-- report this test as failed (not erroring) if 0015's fix regressed, since
-- an uncaught exception here fails the whole test file, not just one case.
-- ============================================================

set local role authenticated;
set local request.jwt.claims = '{"sub": "e1111111-1111-1111-1111-111111111111", "role":"authenticated"}';
set local realtime.topic = 'trip:not-a-uuid';

SELECT lives_ok(
  $$ select exists(select 1 from realtime.messages) $$,
  'a malformed trip topic does not raise (0015 regression guard)'
);

SELECT ok(
  not exists(select 1 from realtime.messages),
  'a malformed trip topic is denied rather than erroring'
);

reset role;

SELECT * FROM finish();
ROLLBACK;
