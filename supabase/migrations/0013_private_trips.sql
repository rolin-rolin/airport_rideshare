-- Private trip postings (DESIGN.md §4.2): a poster can keep a trip off the
-- public board and instead share its link directly — e.g. into a dorm group
-- chat — so the car fills from people they already trust.
--
-- The rule this migration has to hold up: "private" is only about
-- *discoverability*. Joining a private trip runs the exact same path as
-- joining a public one — same signups insert, same check_signup_capacity
-- trigger, same one-active-signup index. Nothing below touches that path.
--
-- The access model is *unlisted*, not access-controlled: holding the trip's
-- UUID is the capability. A member forwarding the link past the original
-- group chat is expected behavior, not a hole. What the UUID must protect
-- against is a signed-in stranger who doesn't have it.
--
-- That protection has to live in RLS, not in the board query. The anon key
-- ships in the browser bundle (src/utils/supabase/client.ts), so any
-- authenticated student can query PostgREST directly with their own JWT.
-- Against 0002/0003's `using (true)` select policies that returns every
-- trip row and every rider's email regardless of what the UI asks for, so
-- filtering getBoardTrips alone would hide private trips from our own
-- interface and from nobody else.

alter table public.trips
  add column visibility text not null default 'public'
    check (visibility in ('public', 'private'));

-- Membership lookups used by the policies below. These must be SECURITY
-- DEFINER: the new trips policy needs to read signups and the new signups
-- policy needs to read trips, which as plain subqueries would recurse
-- through each other's RLS forever. Running as the owner skips RLS on the
-- inner read and breaks the cycle.
create function public.is_trip_member(p_trip_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.signups
    where trip_id = p_trip_id
      and user_id = p_user_id
      and left_at is null
  );
$$;

-- Two users "share a trip" if both currently sit in the same one. Used to
-- decide whose email you're allowed to see.
create function public.shares_active_trip(p_profile_id uuid, p_viewer_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.signups mine
    join public.signups theirs on theirs.trip_id = mine.trip_id
    where mine.user_id = p_viewer_id and mine.left_at is null
      and theirs.user_id = p_profile_id and theirs.left_at is null
  );
$$;

grant execute on function public.is_trip_member to authenticated;
grant execute on function public.shares_active_trip to authenticated;

-- A private trip is readable directly only by people already connected to
-- it. Everyone else reaches it through get_trip_for_view below, which takes
-- the UUID as proof they were given the link.
drop policy "Anyone signed in can view trips" on public.trips;

create policy "Signed-in users can view public and their own trips" on public.trips
  for select to authenticated
  using (
    visibility = 'public'
    or created_by = auth.uid()
    or public.is_trip_member(trips.id, auth.uid())
  );

-- Signups inherit their trip's visibility rather than restating it: the
-- EXISTS below is itself filtered by the trips policy above, so a private
-- trip's roster is hidden by the same rule that hides the trip. Your own
-- signup rows stay readable unconditionally so leaving a trip still works
-- once it's no longer visible to you.
--
-- This also closes a leak that predates private trips: 0002's
-- `using (true)` let any signed-in user dump every signup row for every
-- trip, past and present.
drop policy "Anyone signed in can view signups" on public.signups;

create policy "Users can view signups for trips they can see" on public.signups
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from public.trips t where t.id = signups.trip_id)
  );

-- 0003 widened profiles to "anyone signed in" on the reasoning that signups
-- were already world-readable, so a tighter profiles policy "doesn't add
-- real privacy and just breaks the roster." That premise is gone as of the
-- policy above, so the conclusion goes with it: emails are now visible only
-- to your current trip-mates. The roster still renders — everyone on it
-- shares a trip with you by definition.
drop policy "Anyone signed in can view profiles" on public.profiles;

create policy "Users can view their trip-mates' profiles" on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or public.shares_active_trip(profiles.id, auth.uid())
  );

-- The single reader behind the trip detail page, for public and private
-- trips alike. SECURITY DEFINER because a link-holder who hasn't joined yet
-- can't see a private trip under the policies above — knowing the UUID is
-- what entitles them to the page, and a UUID is not guessable.
--
-- Returns the trip and its active roster in the shape src/lib/trips.ts's
-- withCounts()/toMembers() already consume, so the detail view derives its
-- seat/bag counts through the same helpers the board uses.
create function public.get_trip_for_view(p_trip_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select jsonb_build_object(
    'trip', to_jsonb(t) || jsonb_build_object(
      'vehicle_types',
      case when vt.id is null then null else jsonb_build_object('name', vt.name) end
    ),
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

-- Carry visibility through the atomic post-and-join RPC. Signature change,
-- so drop and recreate rather than `create or replace` — the latter would
-- leave the 11-arg version behind as an overload (same pattern as 0004/0010).
drop function public.create_trip_with_signup(
  text, timestamptz, text, text, uuid, int, int, numeric, text, int, int
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
    groupme_link, created_by, max_bags_per_person, visibility
  ) values (
    p_direction, p_departure_time, p_pickup_location, p_dropoff_location,
    p_vehicle_type_id, p_seat_capacity, p_bag_capacity, p_estimated_total_cost,
    p_groupme_link, auth.uid(), p_max_bags_per_person, p_visibility
  )
  returning id into v_trip_id;

  insert into public.signups (trip_id, user_id, bag_count)
  values (v_trip_id, auth.uid(), p_bag_count);

  return v_trip_id;
end;
$$;

grant execute on function public.create_trip_with_signup to authenticated;
