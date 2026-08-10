-- Replaces the single free-text `groupme_link` with a typed contact method:
-- the poster now picks phone / group chat link / email, and only that one
-- value is stored. Existing groupme_link values are preserved as the 'link'
-- method rather than dropped.
--
-- Unlike groupme_link (readable by anyone who could read the trip row —
-- see 0013's comment on RLS being the real gate), contact info is riders-
-- only: get_trip_for_view below now nulls it out for a viewer who isn't an
-- active member or the poster, the same boundary 0013 already draws around
-- trip-mates' emails.

alter table public.trips
  add column contact_method text check (contact_method in ('phone', 'link', 'email')),
  add column contact_value text,
  add constraint trips_contact_consistency
    check ((contact_method is null) = (contact_value is null));

update public.trips
set contact_method = 'link', contact_value = groupme_link
where groupme_link is not null;

alter table public.trips drop column groupme_link;

-- Signature change (groupme_link -> contact_method/contact_value), so drop
-- and recreate rather than `create or replace` — same reasoning as 0013's
-- own replacement of this function.
drop function public.create_trip_with_signup(
  text, timestamptz, text, text, uuid, int, int, numeric, text, int, int, text
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
    direction, departure_time, pickup_location, dropoff_location,
    vehicle_type_id, seat_capacity, bag_capacity, estimated_total_cost,
    contact_method, contact_value, created_by, max_bags_per_person, visibility
  ) values (
    p_direction, p_departure_time, p_pickup_location, p_dropoff_location,
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

-- Same reader as 0013, with contact_method/contact_value stripped out of
-- the returned trip unless the caller is an active member or the poster —
-- a browsing, not-yet-joined viewer (the whole point of get_trip_for_view:
-- a private trip's link-holder, or anyone reading a public trip's detail
-- page) must not see it.
create or replace function public.get_trip_for_view(p_trip_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_result jsonb;
  v_can_see_contact boolean;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select (t.created_by = auth.uid()) or public.is_trip_member(t.id, auth.uid())
  into v_can_see_contact
  from public.trips t
  where t.id = p_trip_id;

  select jsonb_build_object(
    'trip', (to_jsonb(t) || jsonb_build_object(
      'vehicle_types',
      case when vt.id is null then null else jsonb_build_object('name', vt.name) end
    )) || case
      when v_can_see_contact then '{}'::jsonb
      else jsonb_build_object('contact_method', null, 'contact_value', null)
    end,
    'signups', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'trip_id', s.trip_id,
        'user_id', s.user_id,
        'bag_count', s.bag_count,
        'joined_at', s.joined_at,
        'profiles', jsonb_build_object('email', p.email)
      ))
      from public.signups s
      join public.profiles p on p.id = s.user_id
      where s.trip_id = t.id and s.left_at is null
    ), '[]'::jsonb)
  )
  into v_result
  from public.trips t
  left join public.vehicle_types vt on vt.id = t.vehicle_type_id
  where t.id = p_trip_id;

  return v_result;
end;
$$;

grant execute on function public.get_trip_for_view to authenticated;
