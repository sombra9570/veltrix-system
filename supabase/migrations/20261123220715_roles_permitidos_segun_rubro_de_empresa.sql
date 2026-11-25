create or replace function public.company_modules(p_company uuid)
returns text[] language sql stable security definer set search_path to 'public' as $$
  select coalesce(array(select distinct unnest(category_modules(c)) from companies co, unnest(co.business_categories) as c where co.id = p_company), '{}'::text[]);
$$;

create or replace function public.role_allowed_in_company(p_company uuid, p_role text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  with m as (select company_modules(p_company) as mods)
  select case p_role
    when 'cashier' then mods && array['retail','distribution','restaurant','workshop']
    when 'vendor' then mods && array['retail','distribution']
    when 'waiter' then 'restaurant' = any(mods)
    when 'kitchen' then 'restaurant' = any(mods)
    when 'technician' then 'workshop' = any(mods)
    when 'reception' then 'workshop' = any(mods)
    when 'storekeeper' then 'inventory' = any(mods)
    when 'delivery' then mods && array['retail','restaurant','distribution']
    when 'collector' then 'field_collection' = any(mods)
    when 'supervisor' then true
    when 'accountant' then true
    when 'director' then true
    when 'secretary' then true
    else false end
  from m;
$$;

create or replace function public.set_member_role(p_membership uuid, p_role text, p_custom uuid default null, p_branch uuid default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare m memberships%rowtype; c custom_roles%rowtype; v_role app_role;
begin
  select * into m from memberships where id = p_membership and deleted_at is null;
  if not found or m.role = 'owner' or not is_org_owner(m.org_id) then raise exception 'Solo el administrador asigna roles'; end if;
  if p_custom is not null then
    select * into c from custom_roles where id = p_custom and org_id = m.org_id and deleted_at is null;
    if not found then raise exception 'Rol no encontrado'; end if;
    v_role := c.base_role;
  else
    if p_role is null or p_role = 'owner' then raise exception 'Rol no permitido'; end if;
    v_role := p_role::app_role;
  end if;
  if p_branch is not null and not exists (select 1 from branches where id = p_branch and org_id = m.org_id and company_id = m.company_id and deleted_at is null) then
    raise exception 'Sucursal no encontrada';
  end if;
  if m.company_id is not null and not role_allowed_in_company(m.company_id, v_role::text) then
    raise exception 'ROLE_NOT_IN_NICHE';
  end if;
  if not role_plan_ok(m.org_id, array[v_role]) then raise exception 'ROLE_NOT_IN_PLAN'; end if;
  update memberships set role = v_role, custom_role_id = p_custom, branch_id = coalesce(p_branch, branch_id), updated_at = now() where id = p_membership;
  insert into audit_log(org_id, branch_id, table_name, row_id, action, actor_id, old_data, new_data)
    values (m.org_id, coalesce(p_branch, m.branch_id), 'memberships', p_membership, 'set_role', auth.uid(),
            jsonb_build_object('role', m.role, 'custom_role_id', m.custom_role_id, 'branch_id', m.branch_id),
            jsonb_build_object('role', v_role, 'custom_role_id', p_custom, 'branch_id', coalesce(p_branch, m.branch_id)));
end $$;
