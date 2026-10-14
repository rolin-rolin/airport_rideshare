-- Makes the trip board viewable without signing in.
--
-- Signed-out visitors (the `anon` role) get no new access to any table:
-- trips/signups/profiles/vehicle_types keep their `to authenticated` select
-- policies, so a direct anon PostgREST read of any of them still returns
-- zero rows. Instead, the board is served through get_board_trips() below,
-- a SECURITY DEFINER function that returns only the columns a card shows:
--
--   * never contact_method / contact_value (column-restricted since 0019),
--   * never created_by or any signup's user_id -- no user identity at all;
--     signups are reduced to seats_filled / bags_filled aggregates,
--   * only visibility = 'public' trips (0013: a private trip is reachable
--     only by its link, so it must never be listed -- signed in or out),
--   * only open/full trips, the same set getBoardTrips always showed.
--
-- The app uses this one function for signed-in viewers too, so the board
-- has a single data path and no viewer's browser receives created_by for
-- trips it merely browses.
create function public.get_board_trips(p_direction text)
returns table (
  id uuid,
  direction text,
  departure_time timestamptz,
  timezone text,
  pickup_location text,
  dropoff_location text,
  vehicle_type_id uuid,
  vehicle_type_name text,
  seat_capacity int,
  bag_capacity int,
  max_bags_per_person int,
  estimated_total_cost numeric,
  status text,
  visibility text,
  created_at timestamptz,
  seats_filled int,
  bags_filled int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    t.id,
    t.direction,
    t.departure_time,
    t.timezone,
    t.pickup_location,
    t.dropoff_location,
    t.vehicle_type_id,
    vt.name,
    t.seat_capacity,
    t.bag_capacity,
    t.max_bags_per_person,
    t.estimated_total_cost,
    t.status,
    t.visibility,
    t.created_at,
    coalesce(c.seats_filled, 0),
    coalesce(c.bags_filled, 0)
  from public.trips t
  left join public.vehicle_types vt on vt.id = t.vehicle_type_id
  left join lateral (
    select count(*)::int as seats_filled, coalesce(sum(s.bag_count), 0)::int as bags_filled
    from public.signups s
    where s.trip_id = t.id and s.left_at is null
  ) c on true
  where t.direction = p_direction
    and t.visibility = 'public'
    and t.status in ('open', 'full')
  order by t.departure_time asc;
$$;

revoke execute on function public.get_board_trips(text) from public;
grant execute on function public.get_board_trips(text) to anon, authenticated;

-- Keeps the signed-out board live. The "board-public" Realtime Broadcast
-- topic (0014) carries only an empty '{}' payload -- it says "something on
-- the public board changed", never which trip or who -- and it's only sent
-- for public trips (notify_trip_topic skips it for private ones). A
-- signed-out viewer can already see everything that ping refers to through
-- get_board_trips, so letting anon subscribe leaks nothing new. The
-- per-trip "trip:<id>" topics stay authenticated-only.
create policy "anon can subscribe to the public board topic"
on realtime.messages
for select
to anon
using (realtime.topic() = 'board-public');
