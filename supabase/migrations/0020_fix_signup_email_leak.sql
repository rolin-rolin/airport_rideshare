-- get_trip_for_view already gates contact_method/contact_value behind
-- v_can_see_contact (0016), but the signups array's profiles.email was
-- built unconditionally -- any authenticated user opening a trip's detail
-- page, joined or not, got every active rider's email. That contradicts
-- the boundary 0013 itself draws on public.profiles RLS (emails visible
-- only to current trip-mates); this closes the same gap for this
-- SECURITY DEFINER reader, which bypasses that table-level RLS.
create or replace function public.get_trip_for_view(p_trip_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_result jsonb;
  v_can_see_contact boolean;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select (t.created_by = auth.uid()) or public.is_trip_member(t.id, auth.uid())
  into v_can_see_contact
  from public.trips t
  where t.id = p_trip_id;

  select jsonb_build_object(
    'trip', (to_jsonb(t) || jsonb_build_object(
      'vehicle_types',
      case when vt.id is null then null else jsonb_build_object('name', vt.name) end
    )) || case
      when v_can_see_contact then '{}'::jsonb
      else jsonb_build_object('contact_method', null, 'contact_value', null)
    end,
    'signups', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'trip_id', s.trip_id,
        'user_id', s.user_id,
        'bag_count', s.bag_count,
        'joined_at', s.joined_at,
        'profiles', jsonb_build_object(
          'email', case when v_can_see_contact then p.email else null end
        )
      ))
      from public.signups s
      join public.profiles p on p.id = s.user_id
      where s.trip_id = t.id and s.left_at is null
    ), '[]'::jsonb)
  )
  into v_result
  from public.trips t
  left join public.vehicle_types vt on vt.id = t.vehicle_type_id
  where t.id = p_trip_id;

  return v_result;
end;
$$;

-- Supabase's default project-bootstrap ACLs grant TRUNCATE on public
-- tables to anon/authenticated (not something any prior migration here
-- issued). PostgREST exposes no verb that maps to TRUNCATE, so this isn't
-- reachable through the app's actual client surface today -- but it costs
-- nothing to close and removes the risk if either role's credentials are
-- ever usable for a direct DB connection.
revoke truncate on public.profiles from authenticated, anon;
revoke truncate on public.vehicle_types from authenticated, anon;
revoke truncate on public.trips from authenticated, anon;
revoke truncate on public.signups from authenticated, anon;
