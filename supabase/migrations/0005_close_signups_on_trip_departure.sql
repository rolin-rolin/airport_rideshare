-- Bug: marking a trip "departed" (markDeparted in src/app/dashboard/actions.ts)
-- only flips trips.status. It never touches signups, so every member who
-- didn't separately click "Leave trip" keeps a signups row with left_at
-- still null. getMyActiveTrip() (src/lib/trips.ts) determines the
-- persistent "Your trip" status bar purely from left_at IS NULL, and the
-- signups_one_active_per_user unique index (0002) uses the same left_at IS
-- NULL condition to block joining/posting a new trip. Net effect: after a
-- trip departs, every member is stuck seeing a stale status bar for a
-- ride that's gone, and can't join or post anything new until they
-- explicitly leave.
--
-- Per DESIGN.md §4.4, departure is a terminal state for the trip/ride —
-- everyone who was in it should be freed to join/post a new trip
-- immediately. Fix at the root, DB-side, consistent with how every other
-- invariant here (capacity, one-active-group, status transitions) is
-- enforced by a trigger rather than trusted to the calling client:
-- whenever a trip's status transitions *into* 'departed', close out every
-- still-active signup on that trip by setting left_at = now().
--
-- This piggybacks on existing behavior rather than fighting it:
-- - getMyActiveTrip() needs no changes: once left_at is set, its
--   `left_at IS NULL` query simply stops finding the row.
-- - signups_one_active_per_user (0002) is a partial unique index on
--   left_at IS NULL, so closing the row also frees the user to join/post
--   elsewhere immediately.
-- - sync_trip_status (0002) fires on this same update (it triggers on
--   `update of left_at`), but its own guard (`if v_status not in ('open',
--   'full') then return`) is a no-op here since the trip is already
--   'departed' by the time this trigger's update lands — it can't flip
--   status back to open/full.
create function public.close_trip_signups_on_departure()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.signups
  set left_at = now()
  where trip_id = new.id
    and left_at is null;

  return new;
end;
$$;

-- AFTER, not BEFORE: validate_trip_status_transition (0002) is a BEFORE
-- trigger on the same column that sets departed_at, and must run first so
-- this trigger's UPDATE on signups happens once the trip row itself is
-- already committed to 'departed'. Guarded to the actual open/full ->
-- departed transition so this doesn't fire redundantly on unrelated
-- updates or re-fire if status is ever touched again.
create trigger trips_close_signups_on_departure
  after update of status on public.trips
  for each row
  when (new.status = 'departed' and old.status is distinct from 'departed')
  execute function public.close_trip_signups_on_departure();
