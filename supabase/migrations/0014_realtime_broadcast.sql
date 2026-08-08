-- Switches TripsRealtimeListener's transport from postgres_changes (0012) to
-- Realtime Broadcast. postgres_changes depends on a CDC/wal2json replication
-- slot that the local dev stack currently fails to reattach after a
-- container restart (unrelated infra issue); Broadcast's replication slot is
-- the one that does come back up, so this unblocks local testing without
-- waiting on that to be fixed. 0012's publication grants are left in place
-- so postgres_changes keeps working wherever it does.
--
-- Pings carry no row data -- TripsRealtimeListener never reads an event's
-- payload, it only reacts to one arriving and calls router.refresh(), which
-- re-fetches through the normal RLS-checked server reads (getTripWithMembers
-- et al). So the only thing a ping can leak is its own existence/timing.
--
-- postgres_changes filters *delivery* itself via RLS on trips/signups: a
-- user whose SELECT policies don't cover a given row never receives an event
-- for it at all. Broadcast has no equivalent unless RLS is added on
-- realtime.messages, so that's done below, mirroring 0013's read policies:
--   - "board-public": any authenticated user, same as public trips already
--     being world-readable.
--   - "trip:<id>": gated to whoever 0013 already lets read that trip
--     (its creator, an active member, or anyone if it's public) -- so a
--     private trip's activity never pings a tab with no reason to know
--     about it.
--
-- realtime.messages is owned and RLS-enabled by the platform setup already
-- (not something a migration role can ALTER), so this only adds policies.
create policy "authenticated can subscribe to the public board topic"
on realtime.messages
for select
to authenticated
using (realtime.topic() = 'board-public');

create policy "trip participants can subscribe to their trip's topic"
on realtime.messages
for select
to authenticated
using (
  realtime.topic() like 'trip:%'
  and exists (
    select 1 from public.trips t
    where t.id = substring(realtime.topic() from 6)::uuid
      and (
        t.visibility = 'public'
        or t.created_by = (select auth.uid())
        or public.is_trip_member(t.id, (select auth.uid()))
      )
  )
);

-- Shared by both tables' triggers below. security definer because the
-- is_trip_member/visibility lookups it indirectly relies on (via the
-- policies above, at subscribe time) shouldn't gate whether the ping is
-- *sent* -- only whether a given subscriber is authorized to *receive* it.
create or replace function public.notify_trip_topic(p_trip_id uuid, p_visibility text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_visibility = 'public' then
    perform realtime.send('{}'::jsonb, 'change', 'board-public', true);
  end if;

  perform realtime.send('{}'::jsonb, 'change', 'trip:' || p_trip_id, true);
end;
$$;

create or replace function public.trips_notify_realtime()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.notify_trip_topic(coalesce(new.id, old.id), coalesce(new.visibility, old.visibility));
  return null;
end;
$$;

drop trigger if exists trips_notify_realtime on public.trips;
create trigger trips_notify_realtime
  after insert or update or delete on public.trips
  for each row execute function public.trips_notify_realtime();

-- signups has no visibility column of its own, so its trigger looks its
-- trip's up directly rather than reusing the trips-side coalesce(new,old)
-- trick.
create or replace function public.signups_notify_realtime()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip_id uuid := coalesce(new.trip_id, old.trip_id);
  v_visibility text;
begin
  select visibility into v_visibility from public.trips where id = v_trip_id;
  perform public.notify_trip_topic(v_trip_id, v_visibility);
  return null;
end;
$$;

drop trigger if exists signups_notify_realtime on public.signups;
create trigger signups_notify_realtime
  after insert or update or delete on public.signups
  for each row execute function public.signups_notify_realtime();
