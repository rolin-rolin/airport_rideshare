-- Profiles table: public-schema mirror of auth.users, needed as an FK
-- target for trips/signups in a later milestone.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can view their own profile" on public.profiles
  for select using (auth.uid() = id);

-- Domain gate + profile provisioning, run inside the same transaction as
-- auth.users insert so a rejected signup rolls back cleanly (no orphaned
-- auth user with no profile row).
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed_domain text := 'nd.edu';
begin
  if split_part(new.email, '@', 2) <> allowed_domain then
    raise exception 'Email domain not allowed. Please use your % school email.', allowed_domain;
  end if;

  insert into public.profiles (id, email)
  values (new.id, new.email);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
