-- El repartidor solo se asigna si el negocio tiene reparto activo; el error lo dice con claridad
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
    if v_role = 'delivery' and company_modules(m.company_id) && array['retail','restaurant','distribution'] then raise exception 'ROLE_NEEDS_DELIVERY'; end if;
    raise exception 'ROLE_NOT_IN_NICHE';
  end if;
  if not role_plan_ok(m.org_id, array[v_role]) then raise exception 'ROLE_NOT_IN_PLAN'; end if;
  update memberships set role = v_role, custom_role_id = p_custom, branch_id = coalesce(p_branch, branch_id), updated_at = now() where id = p_membership;
  insert into audit_log(org_id, branch_id, table_name, row_id, action, actor_id, old_data, new_data)
    values (m.org_id, coalesce(p_branch, m.branch_id), 'memberships', p_membership, 'set_role', auth.uid(),
            jsonb_build_object('role', m.role, 'custom_role_id', m.custom_role_id, 'branch_id', m.branch_id),
            jsonb_build_object('role', v_role, 'custom_role_id', p_custom, 'branch_id', coalesce(p_branch, m.branch_id)));
end $$;

create or replace function public.org_add_team_role(p_org uuid, p_role text)
 returns text[] language plpgsql security definer set search_path to 'public' as $$
declare cur text[]; lim int; ok boolean;
begin
  if not is_org_owner(p_org) then raise exception 'Solo el administrador activa roles'; end if;
  if p_role not in ('supervisor','manager','cashier','vendor','collector','waiter','kitchen','technician','storekeeper','accountant','reception','delivery') then
    raise exception 'ROLE_NOT_IN_NICHE';
  end if;
  if p_role = 'delivery' and (module_enabled(p_org,'retail') or module_enabled(p_org,'restaurant') or module_enabled(p_org,'distribution'))
     and not exists (select 1 from branches b where b.org_id = p_org and b.delivery_enabled and b.deleted_at is null) then
    raise exception 'ROLE_NEEDS_DELIVERY';
  end if;
  ok := case p_role
    when 'cashier' then module_enabled(p_org,'retail') or module_enabled(p_org,'distribution') or module_enabled(p_org,'restaurant') or module_enabled(p_org,'workshop')
    when 'vendor' then module_enabled(p_org,'retail') or module_enabled(p_org,'distribution')
    when 'waiter' then module_enabled(p_org,'restaurant')
    when 'kitchen' then module_enabled(p_org,'restaurant')
    when 'technician' then module_enabled(p_org,'workshop')
    when 'reception' then module_enabled(p_org,'retail') or module_enabled(p_org,'distribution') or module_enabled(p_org,'restaurant') or module_enabled(p_org,'workshop')
    when 'storekeeper' then module_enabled(p_org,'inventory')
    when 'delivery' then module_enabled(p_org,'retail') or module_enabled(p_org,'restaurant') or module_enabled(p_org,'distribution')
    when 'collector' then module_enabled(p_org,'field_collection')
    when 'supervisor' then module_enabled(p_org,'field_collection')
    when 'manager' then true
    when 'accountant' then true
    else false end;
  if not ok then raise exception 'ROLE_NOT_IN_NICHE'; end if;
  if not role_plan_ok(p_org, array[p_role::app_role]) then raise exception 'ROLE_NOT_IN_PLAN'; end if;
  select coalesce(array(select jsonb_array_elements_text(o.onboarding->'roles')), '{}'), p.max_roles into cur, lim
    from organizations o join plans p on p.id = o.plan_id where o.id = p_org;
  if p_role = any(cur) then return cur; end if;
  if lim is not null and cardinality(cur) + 1 > lim then raise exception 'PLAN_ROLES_LIMIT:%', lim; end if;
  cur := cur || p_role;
  update organizations set onboarding = jsonb_set(coalesce(onboarding,'{}'::jsonb), '{roles}', to_jsonb(cur)), updated_at = now() where id = p_org;
  insert into audit_log(org_id, table_name, row_id, action, actor_id, new_data)
    values (p_org, 'organizations', p_org, 'add_team_role', auth.uid(), jsonb_build_object('role', p_role));
  return cur;
end $$;
