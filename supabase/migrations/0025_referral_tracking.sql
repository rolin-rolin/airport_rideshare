-- Referral tracking for tagged links (e.g. the Hall Presidents' Council
-- flyer QR code, which opens /dashboard?ref=hpc).
--
-- referral_visits: one row per page load that arrived with a valid ?ref=.
--   visitor_id is a random id kept in a first-party cookie (src/proxy.ts),
--   so unique visitors can be told apart from reloads. No IP, user agent or
--   user id is stored.
-- referral_signups: one row per account created after its browser arrived
--   through a tagged link. Claimed by /auth/callback right after sign-in;
--   only counts if the account is newer than the first tagged visit from
--   that browser, so an existing user who scans the flyer is not a signup.
--
-- Neither table is readable through the API: RLS is on with no policies and
-- table grants are revoked from anon/authenticated. Reads happen with the
-- service-role key (scripts/referral-report.mjs).
create table public.referral_visits (
  id bigint generated always as identity primary key,
  ref text not null check (ref ~ '^[a-z0-9_-]{1,32}$'),
  visitor_id uuid not null,
  path text not null check (char_length(path) <= 200),
  visited_at timestamptz not null default now()
);

create index referral_visits_visitor_ref_idx
  on public.referral_visits (visitor_id, ref, visited_at);

create table public.referral_signups (
  user_id uuid primary key references auth.users(id) on delete cascade,
  ref text not null check (ref ~ '^[a-z0-9_-]{1,32}$'),
  visitor_id uuid not null,
  first_visit_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.referral_visits enable row level security;
alter table public.referral_signups enable row level security;

revoke all on table public.referral_visits from anon, authenticated;
revoke all on table public.referral_signups from anon, authenticated;
grant select, insert on table public.referral_visits to service_role;
grant select, insert, delete on table public.referral_signups to service_role;

-- Called by the proxy for every tagged page load, signed in or not.
create function public.record_referral_visit(p_ref text, p_visitor_id uuid, p_path text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.referral_visits (ref, visitor_id, path)
  values (lower(p_ref), p_visitor_id, left(p_path, 200));
$$;

revoke all on function public.record_referral_visit(text, uuid, text) from public;
grant execute on function public.record_referral_visit(text, uuid, text) to anon, authenticated;

-- Called by /auth/callback after a successful sign-in. Attributes the
-- calling user to p_ref only if that browser has a recorded visit for it
-- and the account was created after the first such visit. First claim
-- wins; returns whether a row was written.
create function public.claim_referral_signup(p_ref text, p_visitor_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with first_visit as (
    select min(visited_at) as at
    from public.referral_visits
    where visitor_id = p_visitor_id and ref = lower(p_ref)
  ),
  inserted as (
    insert into public.referral_signups (user_id, ref, visitor_id, first_visit_at)
    select u.id, lower(p_ref), p_visitor_id, fv.at
    from first_visit fv
    join auth.users u on u.id = auth.uid()
    where fv.at is not null and u.created_at >= fv.at
    on conflict (user_id) do nothing
    returning 1
  )
  select exists (select 1 from inserted);
$$;

revoke all on function public.claim_referral_signup(text, uuid) from public;
grant execute on function public.claim_referral_signup(text, uuid) to authenticated;
