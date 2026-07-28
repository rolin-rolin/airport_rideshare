-- Removes the "departed" concept entirely, per product decision: trips no
-- longer have a manual "mark departed" action or terminal 'departed'
-- status. They only end via 'expired' (no confirmation within 1hr, cron)
-- or 'abandoned' (last active member leaves, instant trigger) — both
-- already existed and are untouched by this migration.

-- No user-facing UPDATE path is left on trips: open/full is system-managed
-- (sync_trip_status), expired/abandoned are system-managed (run_trip_cleanup
-- / sync_trip_status). This policy was the only way an authenticated user
-- could directly UPDATE a trip row, and it existed solely to allow marking
-- 'departed'.
drop policy "Active members can mark a trip departed" on public.trips;

-- Drop the 'departed' branch of the trigger that closes out every signup on
-- a trip the instant it hits a terminal status — only 'expired' remains.
-- Renamed from close_trip_signups_on_departure (0005): with 'departed' gone,
-- the old name no longer describes what it does.
drop trigger trips_close_signups_on_terminal on public.trips;
alter function public.close_trip_signups_on_departure()
  rename to close_trip_signups_on_expiry;

create trigger trips_close_signups_on_terminal
  after update of status on public.trips
  for each row
  when (new.status = 'expired' and old.status is distinct from 'expired')
  execute function public.close_trip_signups_on_expiry();

-- Drop the 'departed' branch of the status state-machine guard, along with
-- the departed_at assignment it used to make.
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
  elsif old.status in ('open', 'full') and new.status = 'expired' then
    return new;
  elsif old.status in ('open', 'full') and new.status = 'abandoned' then
    return new;
  else
    raise exception 'Invalid trip status transition from % to %', old.status, new.status;
  end if;
end;
$$;

alter table public.trips drop constraint trips_status_check;
alter table public.trips add constraint trips_status_check
  check (status in ('open', 'full', 'expired', 'abandoned'));

-- No longer set by anything now that 'departed' is gone.
alter table public.trips drop column departed_at;

-- Rule 2 (delayed signup-closing for departed trips) is gone along with
-- 'departed' itself — only Rule 1 (expiring stale unconfirmed trips)
-- remains. Function body already matches this from migration 0007; this is
-- a no-op re-statement kept for a complete, self-contained migration file.
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
