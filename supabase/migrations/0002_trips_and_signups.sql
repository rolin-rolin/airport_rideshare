-- Vehicle type reference list: seat/bag defaults suggested on the post-trip
-- form. Posters can override the actual numbers, so trips snapshots its own
-- seat_capacity/bag_capacity rather than reading these live (see below).
-- Values here mirror the tier table in DESIGN.md §4.2 (passenger cap /
-- suitcase cap; backpacks don't count). Where that table gives a range
-- (XL's 4–5 suitcases, XXL's 6+), the low end is used as the placeholder
-- default — tune after real usage, per DESIGN.md §9.
create table public.vehicle_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  default_seat_capacity int not null check (default_seat_capacity > 0),
  default_bag_capacity int not null check (default_bag_capacity >= 0),
  created_at timestamptz not null default now()
);

alter table public.vehicle_types enable row level security;

create policy "Anyone signed in can view vehicle types" on public.vehicle_types
  for select to authenticated using (true);

insert into public.vehicle_types (name, default_seat_capacity, default_bag_capacity) values
  ('Standard', 4, 2),
  ('XL', 6, 4),
  ('XXL', 6, 6);

-- Trips: vehicle_type_id is kept for display ("posted as an UberXL") but
-- seat_capacity/bag_capacity are the poster's actual numbers and are what
-- capacity enforcement below reads from — they may differ from the vehicle
-- type's defaults.
create table public.trips (
  id uuid primary key default gen_random_uuid(),
  direction text not null check (direction in ('to_airport', 'from_airport')),
  flight_time timestamptz not null,
  pickup_location text not null,
  dropoff_location text not null,
  vehicle_type_id uuid references public.vehicle_types(id),
  seat_capacity int not null check (seat_capacity > 0),
  bag_capacity int not null check (bag_capacity >= 0),
  estimated_total_cost numeric(10, 2),
  groupme_link text,
  status text not null default 'open'
    check (status in ('open', 'full', 'departed', 'expired')),
  departed_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.trips enable row level security;

create policy "Anyone signed in can view trips" on public.trips
  for select to authenticated using (true);

create policy "Users can create their own trip" on public.trips
  for insert to authenticated with check (created_by = auth.uid());

-- Signups: a row per person currently or formerly in a trip. Leaving is a
-- soft-delete (left_at set), not a row delete, so history and live counts
-- both derive from the same table.
create table public.signups (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  bag_count int not null default 0 check (bag_count >= 0),
  joined_at timestamptz not null default now(),
  left_at timestamptz
);

-- Enforces "one active group at a time" at the DB layer: a user can have
-- any number of past (left_at set) signups, but only one with left_at null.
create unique index signups_one_active_per_user
  on public.signups (user_id)
  where left_at is null;

alter table public.signups enable row level security;

create policy "Anyone signed in can view signups" on public.signups
  for select to authenticated using (true);

create policy "Users can join a trip themselves" on public.signups
  for insert to authenticated with check (user_id = auth.uid());

create policy "Users can update their own signup" on public.signups
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Only an active member of the trip may update it, and the only update an
-- app user is allowed to make directly is marking it departed (the open/full
-- flip is system-managed via sync_trip_status below, which runs as the
-- table owner and so bypasses this policy). Defined here, after signups
-- exists, since the policy's EXISTS subquery reads from it.
create policy "Active members can mark a trip departed" on public.trips
  for update to authenticated
  using (
    exists (
      select 1 from public.signups s
      where s.trip_id = trips.id
        and s.user_id = auth.uid()
        and s.left_at is null
    )
  )
  with check (status = 'departed');

-- Capacity is enforced here, not just recommended by the UI: reject a join
-- once the trip's seat or bag capacity would be exceeded. Locks the trip row
-- so concurrent joins can't both squeeze into the last spot.
create function public.check_signup_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seat_capacity int;
  v_bag_capacity int;
  v_used_seats int;
  v_used_bags int;
begin
  select seat_capacity, bag_capacity into v_seat_capacity, v_bag_capacity
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

  if v_used_bags + new.bag_count > v_bag_capacity then
    raise exception 'This trip is full: not enough bag capacity remaining.';
  end if;

  return new;
end;
$$;

create trigger signups_check_capacity
  before insert on public.signups
  for each row execute function public.check_signup_capacity();

-- Once joined, a signup is only allowed to transition left_at from null to
-- non-null (leaving). bag_count/trip_id/user_id are fixed at join time —
-- rejoining after leaving means a new row, not resurrecting the old one, so
-- the capacity trigger above always runs on the way back in.
create function public.restrict_signup_updates()
returns trigger
language plpgsql
as $$
begin
  if old.left_at is not null then
    raise exception 'This signup has already been left. Join again to create a new signup.';
  end if;

  if new.trip_id <> old.trip_id
    or new.user_id <> old.user_id
    or new.bag_count <> old.bag_count
    or new.joined_at <> old.joined_at
  then
    raise exception 'Only leaving a trip (setting left_at) is allowed after joining.';
  end if;

  return new;
end;
$$;

create trigger signups_restrict_updates
  before update on public.signups
  for each row execute function public.restrict_signup_updates();

-- Keeps trips.status in sync with live seat/bag counts whenever signups
-- change (join, leave, or a joined row being deleted). Only touches the
-- open/full pair — departed/expired are terminal and left alone.
create function public.sync_trip_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip_id uuid := coalesce(new.trip_id, old.trip_id);
  v_seat_capacity int;
  v_bag_capacity int;
  v_status text;
  v_used_seats int;
  v_used_bags int;
begin
  select seat_capacity, bag_capacity, status
  into v_seat_capacity, v_bag_capacity, v_status
  from public.trips
  where id = v_trip_id
  for update;

  if v_status not in ('open', 'full') then
    return coalesce(new, old);
  end if;

  select count(*), coalesce(sum(bag_count), 0)
  into v_used_seats, v_used_bags
  from public.signups
  where trip_id = v_trip_id and left_at is null;

  update public.trips
  set status = case
    when v_used_seats >= v_seat_capacity or v_used_bags >= v_bag_capacity
      then 'full'
    else 'open'
  end
  where id = v_trip_id;

  return coalesce(new, old);
end;
$$;

create trigger signups_sync_trip_status
  after insert or delete or update of left_at, bag_count on public.signups
  for each row execute function public.sync_trip_status();

-- Guards the trips.status state machine: open<->full is system-managed
-- (sync_trip_status above), departed is a one-way member action, expired is
-- reserved for the future auto-cleanup job. Anything else is rejected.
create function public.validate_trip_status_transition()
returns trigger
language plpgsql
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if old.status = 'open' and new.status = 'full' then
    return new;
  elsif old.status = 'full' and new.status = 'open' then
    return new;
  elsif old.status in ('open', 'full') and new.status = 'departed' then
    new.departed_at := now();
    return new;
  elsif old.status in ('open', 'full') and new.status = 'expired' then
    return new;
  else
    raise exception 'Invalid trip status transition from % to %', old.status, new.status;
  end if;
end;
$$;

create trigger trips_validate_status_transition
  before update of status on public.trips
  for each row execute function public.validate_trip_status_transition();
