-- Posters can optionally cap how many bags any single rider brings (distinct
-- from bag_capacity, which caps the trip's total). Nullable: leaving it unset
-- means no per-person limit, only the overall trip bag_capacity applies.
alter table public.trips
  add column max_bags_per_person int
    check (max_bags_per_person is null or max_bags_per_person >= 0);

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
  p_bag_count int,
  p_max_bags_per_person int default null
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
    groupme_link, created_by, max_bags_per_person
  ) values (
    p_direction, p_departure_time, p_pickup_location, p_dropoff_location,
    p_vehicle_type_id, p_seat_capacity, p_bag_capacity, p_estimated_total_cost,
    p_groupme_link, auth.uid(), p_max_bags_per_person
  )
  returning id into v_trip_id;

  insert into public.signups (trip_id, user_id, bag_count)
  values (v_trip_id, auth.uid(), p_bag_count);

  return v_trip_id;
end;
$$;

grant execute on function public.create_trip_with_signup to authenticated;

-- Enforce the per-person cap the same place the overall bag_capacity is
-- enforced, so it can't be bypassed by joining directly instead of through
-- create_trip_with_signup.
create or replace function public.check_signup_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seat_capacity int;
  v_bag_capacity int;
  v_max_bags_per_person int;
  v_used_seats int;
  v_used_bags int;
begin
  select seat_capacity, bag_capacity, max_bags_per_person
  into v_seat_capacity, v_bag_capacity, v_max_bags_per_person
  from public.trips
  where id = new.trip_id
  for update;

  select count(*), coalesce(sum(bag_count), 0)
  into v_used_seats, v_used_bags
  from public.signups
  where trip_id = new.trip_id and left_at is null;

  if v_used_seats + 1 > v_seat_capacity then
    raise exception 'This trip is full: no seats remaining.';
  end if;

  if v_max_bags_per_person is not null and new.bag_count > v_max_bags_per_person then
    raise exception 'This trip limits riders to % bag(s) each.', v_max_bags_per_person;
  end if;

  if v_used_bags + new.bag_count > v_bag_capacity then
    raise exception 'This trip is full: not enough bag capacity remaining.';
  end if;

  return new;
end;
$$;
