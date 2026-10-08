-- Recipient list for the launch announcement email (scripts/send-campaign.mjs).
-- One row per address: `token` is the unguessable handle its unsubscribe
-- link carries, `sent_at` makes the daily batches resumable without ever
-- emailing the same address twice, and `unsubscribed_at` is the opt-out the
-- send script checks before every send.
--
-- These are addresses of people who have NOT signed up, so nothing here is
-- readable through the API: RLS is on with no policies, and the table
-- grants are revoked from anon/authenticated outright rather than relying
-- on RLS alone. Only the service-role key (the send script, run locally)
-- reads or writes rows directly.
create table public.email_campaign_recipients (
  email text primary key check (email = lower(email)),
  token uuid not null unique default gen_random_uuid(),
  -- Order from the imported CSV; batches go out lowest-first.
  position integer not null,
  sent_at timestamptz,
  resend_id text,
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.email_campaign_recipients enable row level security;

revoke all on table public.email_campaign_recipients from anon, authenticated;
grant select, insert, update on table public.email_campaign_recipients to service_role;

-- The only way in for the public site. Unsubscribe links are opened by
-- people who are not logged in (and one-click unsubscribe is a bare POST
-- from the recipient's mail provider), so this must be callable by anon;
-- possession of the token is the authorization. Returns whether the token
-- matched so the page can tell a bad link from a real opt-out. Idempotent:
-- a repeat click keeps the original timestamp.
create function public.unsubscribe_email(p_token uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with updated as (
    update public.email_campaign_recipients
    set unsubscribed_at = coalesce(unsubscribed_at, now())
    where token = p_token
    returning 1
  )
  select exists (select 1 from updated);
$$;

revoke all on function public.unsubscribe_email(uuid) from public;
grant execute on function public.unsubscribe_email(uuid) to anon, authenticated;
