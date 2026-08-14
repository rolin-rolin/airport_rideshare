-- 0013/0016's comments already flagged this: RLS on public.trips is
-- row-level only ("can this role see this trip row at all"), gated on
-- visibility/membership. It was never meant to gate individual columns, but
-- 0009 granted `select` on the whole trips table to authenticated (and
-- anon), which includes contact_method/contact_value. get_trip_for_view
-- (0016) strips those two columns for a non-member/non-poster viewer, but
-- that's an application-layer convention, not an enforced boundary -- any
-- authenticated user can bypass it with a direct PostgREST request
-- (`select=contact_method,contact_value` against a public trip) and read
-- every public trip's contact info, joined or not.
--
-- Fix: revoke table-wide select on trips and re-grant it column-by-column,
-- omitting contact_method/contact_value. Direct/PostgREST reads of those
-- two columns now fail with "permission denied for column" for both
-- authenticated and anon, regardless of RLS. The only way to read them is
-- through a SECURITY DEFINER function (get_trip_for_view,
-- create_trip_with_signup, set_trip_contact_info, sync_trip_status), which
-- runs as the function owner and so is unaffected by this grant -- those
-- already do their own membership check before exposing the value.
revoke select on public.trips from authenticated, anon;

grant select (
  id, direction, departure_time, timezone, pickup_location, dropoff_location,
  vehicle_type_id, seat_capacity, bag_capacity, max_bags_per_person,
  estimated_total_cost, status, visibility, created_by, created_at
) on public.trips to authenticated, anon;
