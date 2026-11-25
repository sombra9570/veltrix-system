create or replace function public.route_growth(p_org uuid)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select case when is_org_owner(p_org) or is_platform_admin() then coalesce((
    select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name,
      'currency', (select base_currency from companies where id = r.company_id),
      'days', route_days(r.id, 21)) order by r.name)
      from collection_routes r where r.org_id = p_org and r.is_active and r.deleted_at is null), '[]'::jsonb) else '[]'::jsonb end;
$$;
