-- Reverts the "departed" half of migration 0006's grace window: members
-- should be freed to join/post a new trip the instant a trip departs, not
-- 30 minutes later. The board-visibility grace window (a departed trip
-- staying on the board for 30 min, per DEPARTED_GRACE_MINUTES in
-- src/lib/trips.ts) is untouched — this only concerns signups.left_at.
--
-- close_trip_signups_on_departure (0005) already does exactly what's
-- needed; 0006 just retargeted its trigger from 'departed' to 'expired'.
-- Re-point the trigger to fire on both.
drop trigger trips_close_signups_on_terminal on public.trips;

create trigger trips_close_signups_on_terminal
  after update of status on public.trips
  for each row
  when (new.status in ('departed', 'expired') and old.status is distinct from new.status)
  execute function public.close_trip_signups_on_departure();

-- Rule 2 (delayed signup-closing for departed trips) is now redundant:
-- signups close instantly on the transition above, so by the time this
-- would run there's nothing left_at is null to update. Drop it, keeping
-- only Rule 1 (expiring stale unconfirmed trips).
create or replace function public.run_trip_cleanup()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.trips
  set status = 'expired'
  where status in ('open', 'full')
    and departure_time < now() - interval '1 hour';
end;
$$;
