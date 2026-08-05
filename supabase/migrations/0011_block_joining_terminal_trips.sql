-- Nothing stopped a user joining a trip that had already ended. Capacity was
-- the only gate on an insert into signups: check_signup_capacity (0002) reads
-- seat_capacity/bag_capacity and never looks at trips.status, and no RLS
-- policy narrows which trip a signup may target (0002's insert policy only
-- checks user_id = auth.uid()). So an 'expired' or 'abandoned' trip -- one
-- DESIGN.md §4.4 describes as "removed from the board" -- still accepted
-- joins.
--
-- Reachable without doing anything unusual: getBoardTrips (src/lib/trips.ts)
-- filters to open/full, but getTripWithMembers does not, so a bookmarked or
-- shared trip URL renders a cleaned-up trip with a working Join button.
--
-- Deliberately NOT guarded here: departure_time. A trip stays joinable right
-- up until cleanup sweeps it, including the hour it sits past its scheduled
-- departure, per DESIGN.md line 16 ("anyone can join at any time up until the
-- vehicle's capacity is reached"). Someone joining that late knows they're at
-- or past the departure time and is expected to confirm with the group over
-- GroupMe, which §4.1 already makes the coordination channel. Terminal status
-- is the line, not the clock.
--
-- Folded into check_signup_capacity rather than added as a second trigger:
-- it already does `select ... from trips where id = new.trip_id for update`,
-- so status comes along in that same row fetch and inherits the lock it
-- already holds -- the guard can't race a concurrent expiry. A separate
-- trigger would need its own locking SELECT, and would also fire *after* this
-- one (Postgres runs BEFORE ROW triggers in trigger-name order, and
-- 'signups_check_capacity' sorts ahead of anything obvious), reporting an
-- ended-and-full trip as "full" instead of ended.
--
-- NOTE: this restates the whole function body, including the
-- max_bags_per_person cap added by 0010. Because CREATE OR REPLACE takes the
-- last writer, any future change to one of these checks has to be made
-- against this version -- editing 0010's copy alone would have no effect on a
-- database that has run this migration.
create or replace function public.check_signup_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_seat_capacity int;
  v_bag_capacity int;
  v_max_bags_per_person int;
  v_used_seats int;
  v_used_bags int;
begin
  select status, seat_capacity, bag_capacity, max_bags_per_person
  into v_status, v_seat_capacity, v_bag_capacity, v_max_bags_per_person
  from public.trips
  where id = new.trip_id
  for update;

  -- Checked before the capacity math so an ended trip that also happens to be
  -- full reports why it actually rejected the join.
  --
  -- A nonexistent trip_id leaves v_status null, making this `not in`
  -- comparison null rather than true, so nothing is raised and the row falls
  -- through to signups_trip_id_fkey -- which is the constraint that should be
  -- answering for a bad trip id, not this one.
  if v_status not in ('open', 'full') then
    raise exception 'This trip has already ended.';
  end if;

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
