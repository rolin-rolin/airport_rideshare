-- When the trip's creator leaves, trips.created_by/contact_method/
-- contact_value previously stayed pointed at them forever -- remaining
-- riders were left with a "contact" who was no longer in the trip.
--
-- Extends 0006's sync_trip_status (itself extending 0002's), which already
-- fires on every signup leave and already computes the post-leave active
-- count. If this particular firing is a genuine leave (left_at going from
-- null to non-null) by the current creator, and the trip isn't now empty
-- (the existing 'abandoned' branch already covers that case), ownership
-- passes to whichever remaining rider joined earliest. Their contact info
-- is unknown, so it's cleared rather than left showing the ex-creator's --
-- the new owner is prompted to set their own (see set_trip_contact_info
-- below and its caller in the app).
create or replace function public.sync_trip_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip_id uuid := coalesce(new.trip_id, old.trip_id);
  v_seat_capacity int;
  v_bag_capacity int;
  v_status text;
  v_used_seats int;
  v_used_bags int;
  v_is_creator_leaving boolean;
  v_new_owner uuid;
begin
  select seat_capacity, bag_capacity, status
  into v_seat_capacity, v_bag_capacity, v_status
  from public.trips
  where id = v_trip_id
  for update;

  if v_status not in ('open', 'full') then
    return coalesce(new, old);
  end if;

  select count(*), coalesce(sum(bag_count), 0)
  into v_used_seats, v_used_bags
  from public.signups
  where trip_id = v_trip_id and left_at is null;

  v_is_creator_leaving :=
    tg_op = 'UPDATE'
    and old.left_at is null
    and new.left_at is not null
    and exists (
      select 1 from public.trips
      where id = v_trip_id and created_by = old.user_id
    );

  if v_is_creator_leaving and v_used_seats > 0 then
    select user_id into v_new_owner
    from public.signups
    where trip_id = v_trip_id and left_at is null
    order by joined_at asc
    limit 1;

    update public.trips
    set created_by = v_new_owner, contact_method = null, contact_value = null
    where id = v_trip_id;
  end if;

  update public.trips
  set status = case
    when v_used_seats = 0 then 'abandoned'
    when v_used_seats >= v_seat_capacity or v_used_bags >= v_bag_capacity then 'full'
    else 'open'
  end
  where id = v_trip_id;

  return coalesce(new, old);
end;
$$;

-- Lets the (possibly newly reassigned) owner set contact info outside of
-- trip creation. trips has no UPDATE grant/RLS policy (0009 only grants
-- SELECT/INSERT), so this is security definer like create_trip_with_signup.
create function public.set_trip_contact_info(
  p_trip_id uuid,
  p_contact_method text,
  p_contact_value text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_contact_method not in ('phone', 'link', 'email') then
    raise exception 'Invalid contact method';
  end if;

  if p_contact_value is null or btrim(p_contact_value) = '' then
    raise exception 'Contact value is required';
  end if;

  update public.trips
  set contact_method = p_contact_method, contact_value = p_contact_value
  where id = p_trip_id and created_by = auth.uid();

  if not found then
    raise exception 'Only the trip owner can set contact info';
  end if;
end;
$$;

grant execute on function public.set_trip_contact_info to authenticated;
