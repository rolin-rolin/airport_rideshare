-- The announcement email greets each student by first name ("Hi Alex,").
-- Nullable: not every row in an imported list has a usable name, and the
-- send script falls back to a generic greeting for those.
alter table public.email_campaign_recipients add column first_name text;
