-- The poster now names which rideshare service the trip is booked through
-- (Uber / Lyft / Other, with free text for Other) instead of the app
-- inferring or hardcoding a brand alongside the vehicle_types tier. Nullable
-- for the same reason contact_method/contact_value are (0016): existing
-- rows predate this field and the form only requires it going forward.
alter table public.trips
  add column rideshare_provider text
    check (rideshare_provider in ('uber', 'lyft', 'other')),
  add column rideshare_provider_other text,
  add constraint trips_rideshare_provider_other_consistency
    check ((rideshare_provider = 'other') = (rideshare_provider_other is not null));

-- New columns need their own column-privilege grant -- 0019 replaced the
-- table-wide select grant with an explicit column list, so anything added
-- to public.trips since then is invisible to authenticated/anon until
-- granted here too.
grant select (rideshare_provider, rideshare_provider_other)
  on public.trips to authenticated, anon;

-- Signature change (two new params), so drop and recreate rather than
-- `create or replace` -- same reasoning as prior signature changes to this
-- function (0013/0016/0018).
drop function public.create_trip_with_signup(
  text, timestamptz, text, text, text, uuid, int, int, numeric, text, text, int, int, text
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
  p_visibility text default 'public',
  p_rideshare_provider text default null,
  p_rideshare_provider_other text default null
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
    contact_method, contact_value, created_by, max_bags_per_person, visibility,
    rideshare_provider, rideshare_provider_other
  ) values (
    p_direction, p_departure_time, p_timezone, p_pickup_location, p_dropoff_location,
    p_vehicle_type_id, p_seat_capacity, p_bag_capacity, p_estimated_total_cost,
    p_contact_method, p_contact_value, auth.uid(), p_max_bags_per_person, p_visibility,
    p_rideshare_provider, p_rideshare_provider_other
  )
  returning id into v_trip_id;

  insert into public.signups (trip_id, user_id, bag_count)
  values (v_trip_id, auth.uid(), p_bag_count);

  return v_trip_id;
end;
$$;

grant execute on function public.create_trip_with_signup to authenticated;
