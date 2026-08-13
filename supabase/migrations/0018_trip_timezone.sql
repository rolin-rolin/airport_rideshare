-- Trips depart from locations in different timezones (e.g. O'Hare is
-- Central, South Bend is Eastern), so departure_time can no longer be
-- assumed to belong to one fixed zone. The poster now picks the timezone
-- their departure time is in, and it's stored alongside it so display and
-- date filtering can always resolve against the trip's own zone instead of
-- silently converting to whichever zone a viewer happens to be browsing
-- from.
alter table public.trips
  add column timezone text not null default 'America/Chicago'
    check (timezone in ('America/Chicago', 'America/New_York'));

-- Signature change (new p_timezone param), so drop and recreate rather than
-- `create or replace` -- same reasoning as 0013/0016's own replacements of
-- this function.
drop function public.create_trip_with_signup(
  text, timestamptz, text, text, uuid, int, int, numeric, text, text, int, int, text
);

create function public.create_trip_with_signup(
  p_direction text,
  p_departure_time timestamptz,
  p_timezone text,
  p_pickup_location text,
  p_dropoff_location text,
  p_vehicle_type_id uuid,
  p_seat_capacity int,
  p_bag_capacity int,
  p_estimated_total_cost numeric,
  p_contact_method text,
  p_contact_value text,
  p_bag_count int,
  p_max_bags_per_person int default null,
  p_visibility text default 'public'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.trips (
    direction, departure_time, timezone, pickup_location, dropoff_location,
    vehicle_type_id, seat_capacity, bag_capacity, estimated_total_cost,
    contact_method, contact_value, created_by, max_bags_per_person, visibility
  ) values (
    p_direction, p_departure_time, p_timezone, p_pickup_location, p_dropoff_location,
    p_vehicle_type_id, p_seat_capacity, p_bag_capacity, p_estimated_total_cost,
    p_contact_method, p_contact_value, auth.uid(), p_max_bags_per_person, p_visibility
  )
  returning id into v_trip_id;

  insert into public.signups (trip_id, user_id, bag_count)
  values (v_trip_id, auth.uid(), p_bag_count);

  return v_trip_id;
end;
$$;

grant execute on function public.create_trip_with_signup to authenticated;
