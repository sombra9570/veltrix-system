-- Recepción cuenta como caja (cobra, abre turno); Delivery cuenta como cobrador de ruta y además ve/marca despacho.
create or replace function public.has_branch_role(p_branch uuid, p_roles app_role[])
returns boolean language sql stable security definer set search_path = public as $$
  with r as (
    select p_roles
      || case when 'cashier'::app_role = any(p_roles) then array['reception']::app_role[] else '{}'::app_role[] end
      || case when 'collector'::app_role = any(p_roles) then array['delivery']::app_role[] else '{}'::app_role[] end as x
  )
  select exists (
    select 1 from r, memberships m
      join profiles p on p.id = m.user_id
      left join custom_roles cr on cr.id = m.custom_role_id and cr.deleted_at is null
    where m.user_id = auth.uid() and m.branch_id = p_branch
      and (m.role = any(r.x) or (cr.id is not null and (cr.base_role = any(r.x) or cr.also_roles && r.x)))
      and m.is_active and m.deleted_at is null and p.is_active);
$$;

create or replace function public.assert_staff(p_user uuid, p_branch uuid, p_role app_role)
returns void language plpgsql as $$
begin
  if p_user is not null and not exists (
      select 1 from memberships where user_id = p_user and branch_id = p_branch
        and (role = p_role or (p_role = 'cashier' and role = 'reception') or (p_role = 'collector' and role = 'delivery'))
        and is_active and deleted_at is null) then
    raise exception 'El usuario no tiene el rol % en esta sucursal', p_role;
  end if;
end $$;

create or replace function public.role_module_ok(p_org uuid, p_roles app_role[])
returns boolean language sql stable as $$
  select not exists (
    select 1 from unnest(coalesce(p_roles,'{}')) r
    where (r in ('waiter','kitchen') and not module_enabled(p_org,'restaurant'))
       or (r = 'technician' and not module_enabled(p_org,'workshop'))
       or (r = 'collector' and not module_enabled(p_org,'field_collection'))
       or (r = 'storekeeper' and not module_enabled(p_org,'inventory'))
       or (r = 'delivery' and not (module_enabled(p_org,'retail') or module_enabled(p_org,'restaurant') or module_enabled(p_org,'field_collection'))));
$$;

do $$
declare f text; d text;
begin
  for f in select unnest(array['dispatch_queue','dispatch_mark','routes_admin']) loop
    select pg_get_functiondef(p.oid) into d from pg_proc p where p.pronamespace='public'::regnamespace and p.proname=f;
    if f = 'routes_admin' then
      d := replace(d, 'm.role = ''collector''', 'm.role in (''collector'',''delivery'')');
    else
      d := replace(d, 'not can_stock(p_branch)', 'not (can_stock(p_branch) or has_branch_role(p_branch, ''{delivery}''))');
      d := replace(d, 'not can_stock(o.branch_id)', 'not (can_stock(o.branch_id) or has_branch_role(o.branch_id, ''{delivery}''))');
    end if;
    execute d;
  end loop;
end $$;
