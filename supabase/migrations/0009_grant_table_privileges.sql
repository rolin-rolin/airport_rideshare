-- RLS policies alone don't grant access -- Postgres still requires the
-- underlying SQL-level GRANT before a policy is even consulted. No prior
-- migration ever issued one for these tables, so on a database built
-- purely from this migration history (fresh local dev, self-host, CI),
-- `authenticated` has zero SELECT/INSERT/UPDATE on any app table: every
-- request fails with "permission denied for table ..." before RLS runs.
-- (The linked production project has likely been working regardless,
-- because Supabase's dashboard-driven project bootstrap grants this
-- automatically at creation time, outside of anything tracked here.)
--
-- Grants below mirror exactly what the existing RLS policies already
-- imply is allowed -- this widens nothing beyond what those policies (see
-- 0001-0003, 0008) already describe as intended access.
--
-- anon also needs a base SELECT grant, even though none of the select
-- policies apply "to anon": in the standard Supabase/PostgREST model, RLS
-- -- not the SQL grant -- is meant to be the real gate for anon requests,
-- so an anon read against a table it has no policy for returns an empty
-- result (200, zero rows), not a permission error. Without this grant
-- every anon-key request would 500 instead.
grant select on public.profiles to authenticated, anon;
grant select on public.vehicle_types to authenticated, anon;
grant select on public.trips to authenticated, anon;
grant insert on public.trips to authenticated;
grant select on public.signups to authenticated, anon;
grant insert, update on public.signups to authenticated;
