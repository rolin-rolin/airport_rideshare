-- Auto-cleanup for stale trips (DESIGN.md §4.4), plus an "abandoned" case
-- not in the original design doc: a trip that fizzles out because everyone
-- leaves before it ever departs. Three rules, two cron-driven (time-based),
-- one trigger-driven (instant, same pattern as capacity/status elsewhere):
--
-- 1. Expired: open/full trip whose departure_time is >1hr in the past with
--    no one confirming departure -> status = 'expired', signups closed.
-- 2. Departed + grace window: marking a trip departed no longer instantly
--    frees its members (that was migration 0005's behavior) - it now stays
--    visible/locked-in for 30 minutes after departed_at, then a cron sweep
--    closes out any signups still open on it.
-- 3. Abandoned: the instant the last active signup on an open/full trip
--    leaves, that trip flips to a new terminal status, 'abandoned' - no
--    polling delay, enforced by the same trigger that already recomputes
--    open/full on every signup change.
--
-- Rows are never hard-deleted here - kept for audit, table size isn't a
-- concern at this app's scale (see plan discussion).

alter table public.trips drop constraint trips_status_check;
alter table public.trips add constraint trips_status_check
  check (status in ('open', 'full', 'departed', 'expired', 'abandoned'));

-- Extends 0002's state machine guard: 'abandoned' is reachable the same way
-- 'expired' is, from either open or full.
create or replace function public.validate_trip_status_transition()
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
  elsif old.status in ('open', 'full') and new.status = 'abandoned' then
    return new;
  else
    raise exception 'Invalid trip status transition from % to %', old.status, new.status;
  end if;
end;
$$;

-- Extends 0002's sync_trip_status: zero active members flips the trip to
-- 'abandoned' instead of computing an open/full seat count that no longer
-- means anything.
create or replace function public.sync_trip_status()
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
    when v_used_seats = 0 then 'abandoned'
    when v_used_seats >= v_seat_capacity or v_used_bags >= v_bag_capacity then 'full'
    else 'open'
  end
  where id = v_trip_id;

  return coalesce(new, old);
end;
$$;

-- Replaces 0005's trips_close_signups_on_departure: closing signups on
-- 'departed' is no longer instant (see rule 2 above), so this now fires on
-- 'expired' instead. The function body itself (close every active signup
-- on new.id) is unchanged and works for either status.
drop trigger trips_close_signups_on_departure on public.trips;

create trigger trips_close_signups_on_terminal
  after update of status on public.trips
  for each row
  when (new.status = 'expired' and old.status is distinct from 'expired')
  execute function public.close_trip_signups_on_departure();

-- The two time-based rules, run periodically by pg_cron (see below).
create function public.run_trip_cleanup()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Rule 1: expire trips whose scheduled departure passed over an hour ago
  -- with no confirmation. Firing this update also fires
  -- trips_close_signups_on_terminal above, closing those signups.
  update public.trips
  set status = 'expired'
  where status in ('open', 'full')
    and departure_time < now() - interval '1 hour';

  -- Rule 2: free members of a departed trip once its 30-minute grace
  -- window has passed.
  update public.signups
  set left_at = now()
  where left_at is null
    and trip_id in (
      select id from public.trips
      where status = 'departed'
        and departed_at < now() - interval '30 minutes'
    );
end;
$$;

create extension if not exists pg_cron;

select cron.schedule('trip-cleanup', '*/5 * * * *', $$select public.run_trip_cleanup();$$);
