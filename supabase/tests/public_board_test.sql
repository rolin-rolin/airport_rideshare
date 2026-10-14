-- pgTAP tests for 0024's signed-out board: get_board_trips must hand anon
-- the public board (with seat/bag counts) and nothing else -- no private
-- trips, no contact info, no user ids -- while the tables themselves stay
-- closed to anon.
--
-- Run with: supabase test db --local
BEGIN;
SELECT plan(9);

insert into auth.users (id, email) values
  ('f1111111-1111-1111-1111-111111111111', 'pb-poster@nd.edu'),
  ('f2222222-2222-2222-2222-222222222222', 'pb-rider@nd.edu'),
  ('f3333333-3333-3333-3333-333333333333', 'pb-private@nd.edu');

insert into public.trips
  (id, direction, departure_time, pickup_location, dropoff_location,
   seat_capacity, bag_capacity, created_by, status, visibility,
   contact_method, contact_value)
values
  ('a1111111-0000-0000-0000-000000000001', 'to_airport',
   now() + interval '2 days', 'PB public', 'ORD', 4, 4,
   'f1111111-1111-1111-1111-111111111111', 'open', 'public', 'phone', '555-PB-SECRET'),
  ('a1111111-0000-0000-0000-000000000002', 'to_airport',
   now() + interval '2 days', 'PB private', 'MDW', 4, 4,
   'f3333333-3333-3333-3333-333333333333', 'open', 'private', 'phone', '555-PB-SECRET');

insert into public.signups (trip_id, user_id, bag_count) values
  ('a1111111-0000-0000-0000-000000000001', 'f1111111-1111-1111-1111-111111111111', 1),
  ('a1111111-0000-0000-0000-000000000001', 'f2222222-2222-2222-2222-222222222222', 2),
  ('a1111111-0000-0000-0000-000000000002', 'f3333333-3333-3333-3333-333333333333', 0);

set local role anon;
reset request.jwt.claims;

SELECT ok(
  exists(select 1 from public.get_board_trips('to_airport')
         where id = 'a1111111-0000-0000-0000-000000000001'),
  'anon sees the public trip on the board'
);

SELECT ok(
  not exists(select 1 from public.get_board_trips('to_airport')
             where id = 'a1111111-0000-0000-0000-000000000002'),
  'anon does not see the private trip on the board'
);

SELECT results_eq(
  $$ select seats_filled, bags_filled from public.get_board_trips('to_airport')
     where id = 'a1111111-0000-0000-0000-000000000001' $$,
  $$ values (2, 3) $$,
  'board rows carry seat and bag counts'
);

SELECT ok(
  (select coalesce(jsonb_agg(to_jsonb(b))::text, '') from public.get_board_trips('to_airport') b)
    !~ '555-PB-SECRET|contact_|created_by|user_id|f1111111|f2222222|f3333333',
  'board rows carry no contact info and no user ids'
);

SELECT is_empty(
  $$ select id from public.trips $$,
  'anon still reads zero trips rows directly'
);

SELECT throws_ok(
  $$ select contact_value from public.trips $$,
  '42501',
  NULL,
  'anon cannot select trips.contact_value'
);

SELECT is_empty(
  $$ select user_id from public.signups $$,
  'anon still reads zero signups rows directly'
);

SELECT is_empty(
  $$ select id from public.profiles $$,
  'anon still reads zero profiles rows directly'
);

SELECT throws_ok(
  $$ select public.get_trip_for_view('a1111111-0000-0000-0000-000000000001') $$,
  NULL,
  'Not authenticated',
  'anon cannot use get_trip_for_view'
);

reset role;

SELECT * FROM finish();
ROLLBACK;
