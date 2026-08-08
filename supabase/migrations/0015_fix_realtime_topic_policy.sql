-- Fixes a real bug in 0014's "trip participants" policy: it cast
-- substring(realtime.topic() from 6) straight to uuid, guarded only by
-- `realtime.topic() like 'trip:%'`. That guard doesn't actually protect the
-- cast -- Postgres doesn't guarantee AND (or even CASE, tried first and
-- still reproduced the failure below) evaluates left-to-right when one side
-- is an uncorrelated subquery: the planner can hoist an EXISTS() that
-- doesn't reference the outer table into an InitPlan and evaluate it
-- unconditionally, before any branch/guard decides whether it should run at
-- all. So subscribing to "board-public" -- authorized by the *other*
-- policy -- could still blow up with `invalid input syntax for type uuid`
-- while this policy's cast runs on "-public", and one policy erroring fails
-- the whole authorization check regardless of what the other would have
-- allowed (policies combine with OR, but an exception isn't a false).
--
-- Fixed by moving the cast inside a plpgsql function that traps the cast
-- exception and returns null instead -- null never equals a real trip id,
-- so a non-UUID suffix just fails the match like any other non-existent
-- trip, instead of raising.
create or replace function public.uuid_or_null(p_text text)
returns uuid
language plpgsql
immutable
as $$
begin
  return p_text::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

drop policy "trip participants can subscribe to their trip's topic" on realtime.messages;

create policy "trip participants can subscribe to their trip's topic"
on realtime.messages
for select
to authenticated
using (
  realtime.topic() like 'trip:%'
  and exists (
    select 1 from public.trips t
    where t.id = public.uuid_or_null(substring(realtime.topic() from 6))
      and (
        t.visibility = 'public'
        or t.created_by = (select auth.uid())
        or public.is_trip_member(t.id, (select auth.uid()))
      )
  )
);
