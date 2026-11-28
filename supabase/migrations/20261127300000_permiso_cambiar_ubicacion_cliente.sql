-- Permiso del cobrador: cambiar la ubicación de un cliente (apagado por defecto). Aparece la pestaña "Cambiar ubicación" solo si lo tiene.
do $$
declare src text; src2 text;
begin
  select pg_get_functiondef(p.oid) into src from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='perm_catalog';
  src2 := replace(src, '''customers.photo_gallery'', ''loans.set_cap'']', '''customers.photo_gallery'', ''loans.set_cap'', ''customers.change_location'']');
  if src2 = src then raise exception 'perm_catalog'; end if;
  execute src2;

  select pg_get_functiondef(p.oid) into src from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='role_offered_keys_base';
  src2 := replace(src, '''routes.invest'',''customers.photo_gallery'']', '''routes.invest'',''customers.photo_gallery'',''customers.change_location'']');
  if src2 = src then raise exception 'role_offered_keys_base'; end if;
  execute src2;

  select pg_get_functiondef(p.oid) into src from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='perm_default_base';
  src2 := replace(src, '''reports.supervisors'', ''loans.set_cap'')', '''reports.supervisors'', ''loans.set_cap'', ''customers.change_location'')');
  if src2 = src then raise exception 'perm_default_base'; end if;
  execute src2;

  select pg_get_functiondef(p.oid) into src from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='collector_day';
  src2 := replace(src, '''can_gallery'', coalesce((r.permissions->>''customers.photo_gallery'')::boolean, has_perm(''customers.photo_gallery'', r.branch_id)),',
    '''can_gallery'', coalesce((r.permissions->>''customers.photo_gallery'')::boolean, has_perm(''customers.photo_gallery'', r.branch_id)),
        ''can_change_loc'', coalesce((r.permissions->>''customers.change_location'')::boolean, has_perm(''customers.change_location'', r.branch_id)),');
  if src2 = src then raise exception 'collector_day'; end if;
  execute src2;
end $$;

create or replace function public.collector_set_customer_location(p_route uuid, p_customer uuid, p_lat numeric, p_lng numeric)
returns void language plpgsql security definer set search_path = public as $$
declare r collection_routes;
begin
  r := _route_actor(p_route);
  if not (r.collector_id = auth.uid() or is_org_owner(r.org_id)) then raise exception 'LOAN_NO_PERMISSION'; end if;
  if not coalesce((r.permissions->>'customers.change_location')::boolean, has_perm('customers.change_location', r.branch_id)) then
    raise exception 'LOAN_NO_PERMISSION';
  end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then raise exception 'GPS_INVALID'; end if;
  perform assert_route_open(r.id);
  update customers set gps_lat = p_lat, gps_lng = p_lng where id = p_customer and route_id = r.id and deleted_at is null;
  if not found then raise exception 'Sin permiso'; end if;
end $$;
revoke all on function public.collector_set_customer_location(uuid,uuid,numeric,numeric) from public, anon;
grant execute on function public.collector_set_customer_location(uuid,uuid,numeric,numeric) to authenticated;
