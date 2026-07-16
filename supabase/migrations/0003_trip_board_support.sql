-- Two app-layer gaps found while building the trip board's data layer:

-- 1. profiles was locked to "view your own row only", but the group-status
-- indicator and trip roster (DESIGN.md §4.3) need to show *other* members'
-- emails to everyone in the same trip. Signups are already visible to any
-- signed-in user (see 0002's "Anyone signed in can view signups" policy),
-- so restricting profiles more tightly than that doesn't add real privacy
-- and just breaks the roster. Match the same "anyone signed in" pattern.
drop policy "Users can view their own profile" on public.profiles;

create policy "Anyone signed in can view profiles" on public.profiles
  for select to authenticated using (true);

-- 2. Posting a trip implicitly makes the poster its first member (they
-- declare their own bag count same as anyone else joining, DESIGN.md §4.3).
-- That's two inserts (trips, then signups) that need to succeed or fail
-- together — e.g. if the poster already has an active signup elsewhere,
-- the one-active-group-at-a-time constraint should reject the whole post,
-- not leave an orphaned trip with zero members. Wrapping both inserts in a
-- single function call gives that atomicity for free (a raised exception
-- rolls back everything the function did).
create function public.create_trip_with_signup(
  p_direction text,
  p_flight_time timestamptz,
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
    direction, flight_time, pickup_location, dropoff_location,
    vehicle_type_id, seat_capacity, bag_capacity, estimated_total_cost,
    groupme_link, created_by
  ) values (
    p_direction, p_flight_time, p_pickup_location, p_dropoff_location,
    p_vehicle_type_id, p_seat_capacity, p_bag_capacity, p_estimated_total_cost,
    p_groupme_link, auth.uid()
  )
  returning id into v_trip_id;

  -- Runs the same signups_check_capacity / one-active-group-at-a-time
  -- constraints as a normal join, since it's a normal insert on the same
  -- table (this function is security definer, but the triggers themselves
  -- are not policy checks, so they still fire).
  insert into public.signups (trip_id, user_id, bag_count)
  values (v_trip_id, auth.uid(), p_bag_count);

  return v_trip_id;
end;
$$;

grant execute on function public.create_trip_with_signup to authenticated;
