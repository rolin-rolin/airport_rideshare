-- flight_time conflated "when the flight is" with "when this group's ride
-- actually leaves." Two students on the same flight can want different
-- pickup times (buffer before an outbound flight varies by person), so
-- flight time isn't actually what should group people on the board.
-- DESIGN.md §4.4's expiry rule ("no confirmation within 1 hour after the
-- scheduled departure time") was already written in terms of departure
-- time, not flight time — this rename makes the column match what it's
-- actually used for on both counts: matching and expiry.
alter table public.trips rename column flight_time to departure_time;

drop function public.create_trip_with_signup(
  text, timestamptz, text, text, uuid, int, int, numeric, text, int
);

create function public.create_trip_with_signup(
  p_direction text,
  p_departure_time timestamptz,
  p_pickup_location text,
  p_dropoff_location text,
  p_vehicle_type_id uuid,
  p_seat_capacity int,
  p_bag_capacity int,
  p_estimated_total_cost numeric,
  p_groupme_link text,
  p_bag_count int
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
    direction, departure_time, pickup_location, dropoff_location,
    vehicle_type_id, seat_capacity, bag_capacity, estimated_total_cost,
    groupme_link, created_by
  ) values (
    p_direction, p_departure_time, p_pickup_location, p_dropoff_location,
    p_vehicle_type_id, p_seat_capacity, p_bag_capacity, p_estimated_total_cost,
    p_groupme_link, auth.uid()
  )
  returning id into v_trip_id;

  insert into public.signups (trip_id, user_id, bag_count)
  values (v_trip_id, auth.uid(), p_bag_count);

  return v_trip_id;
end;
$$;

grant execute on function public.create_trip_with_signup to authenticated;
