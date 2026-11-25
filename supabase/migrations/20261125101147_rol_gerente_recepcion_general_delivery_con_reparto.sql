-- Etapa 3 · Gerente, recepción general, delivery con reparto activo
-- Gerente ('manager'): gestiona la sucursal/empresa como un supervisor en cualquier rubro; no ocupa los cupos de supervisores de ruta.
-- Todo lugar que acepta 'supervisor' acepta también 'manager' (se centraliza en has_branch_role / has_company_role).

create or replace function public.has_branch_role(p_branch uuid, p_roles app_role[])
 returns boolean language sql stable security definer set search_path to 'public' as $$
  with r as (
    select p_roles
      || case when 'cashier'::app_role = any(p_roles) then array['reception']::app_role[] else '{}'::app_role[] end
      || case when 'collector'::app_role = any(p_roles) then array['delivery']::app_role[] else '{}'::app_role[] end
      || case when 'supervisor'::app_role = any(p_roles) then array['manager']::app_role[] else '{}'::app_role[] end as x
  )
  select exists (
    select 1 from r, memberships m
      join profiles p on p.id = m.user_id
      left join custom_roles cr on cr.id = m.custom_role_id and cr.deleted_at is null
    where m.user_id = auth.uid() and m.branch_id = p_branch
      and (m.role = any(r.x) or (cr.id is not null and (cr.base_role = any(r.x) or cr.also_roles && r.x)))
      and m.is_active and m.deleted_at is null and p.is_active);
$$;

create or replace function public.has_company_role(p_company uuid, p_roles app_role[])
 returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from companies c where c.id = p_company and is_org_owner(c.org_id))
      or exists (select 1 from memberships m join profiles p on p.id = m.user_id
                  where m.user_id = auth.uid() and m.company_id = p_company
                    and m.role = any(p_roles || case when 'supervisor'::app_role = any(p_roles) then array['manager']::app_role[] else '{}'::app_role[] end)
                    and m.is_active and m.deleted_at is null and p.is_active);
$$;

create or replace function public.has_perm(p_key text, p_branch uuid)
 returns boolean language sql stable security definer set search_path to 'public' as $$
  select case
    when is_platform_admin() then true
    when exists (select 1 from branches b where b.id = p_branch and is_org_owner(b.org_id)) then true
    when exists (select 1 from memberships m where m.user_id = auth.uid() and m.branch_id = p_branch and m.role in ('supervisor','manager') and m.is_active and m.deleted_at is null and m.permissions ? p_key)
      then (select bool_or((m.permissions->>p_key)::boolean) from memberships m where m.user_id = auth.uid() and m.branch_id = p_branch and m.role in ('supervisor','manager') and m.is_active and m.deleted_at is null and m.permissions ? p_key)
    when exists (select 1 from memberships m join organizations o on o.id = m.org_id
                  where m.user_id = auth.uid() and m.branch_id = p_branch and m.role in ('supervisor','manager') and m.is_active and m.deleted_at is null
                    and (o.role_permissions->(m.role::text)) ? p_key)
      then (select bool_or(coalesce((o.role_permissions->(m.role::text)->>p_key)::boolean, true)) from memberships m join organizations o on o.id = m.org_id
             where m.user_id = auth.uid() and m.branch_id = p_branch and m.role in ('supervisor','manager') and m.is_active and m.deleted_at is null)
    when (p_key not like 'routes.%' or p_key in ('routes.liquidate','routes.invest'))
         and exists (select 1 from memberships m where m.user_id = auth.uid() and m.branch_id = p_branch and m.role in ('supervisor','manager') and m.is_active and m.deleted_at is null)
      then supervisor_branch_default(p_branch, p_key)
    when is_branch_manager(p_branch) and p_key not like 'routes.%' then true
    else coalesce(
      (select bool_or((cr.permissions->>p_key)::boolean) from collection_routes cr
        where cr.branch_id = p_branch and cr.deleted_at is null and cr.is_active
          and (cr.collector_id = auth.uid() or cr.supervisor_id = auth.uid()) and cr.permissions ? p_key),
      (select bool_or((m.permissions->>p_key)::boolean) from memberships m
        where m.user_id = auth.uid() and m.branch_id = p_branch and m.is_active and m.deleted_at is null and m.permissions ? p_key),
      (select bool_or((cr.permissions->>p_key)::boolean) from memberships m
         join custom_roles cr on cr.id = m.custom_role_id and cr.deleted_at is null
        where m.user_id = auth.uid() and m.branch_id = p_branch and m.is_active and m.deleted_at is null and cr.permissions ? p_key),
      (select bool_or(coalesce((o.role_permissions->(m.role::text)->>p_key)::boolean, perm_default(m.role::text, p_key)))
         from memberships m join organizations o on o.id = m.org_id
        where m.user_id = auth.uid() and m.branch_id = p_branch and m.is_active and m.deleted_at is null),
      false)
  end;
$$;

create or replace function public.ai_can_use(p_org uuid)
 returns boolean language sql stable security definer set search_path to 'public' as $$
  select is_org_owner(p_org) or exists (
    select 1 from memberships m where m.user_id = auth.uid() and m.org_id = p_org
       and m.role in ('supervisor','manager') and m.is_active and m.deleted_at is null);
$$;

create or replace function public.can_post_channel(p_channel uuid)
 returns boolean language sql stable security definer set search_path to 'public' as $$
  select can_read_channel(p_channel) and exists (
    select 1 from chat_channels c where c.id = p_channel
       and (c.kind <> 'announce' or is_org_owner(c.org_id)
            or exists (select 1 from memberships m where m.user_id = auth.uid() and m.org_id = c.org_id
                         and m.role in ('supervisor','manager') and m.is_active and m.deleted_at is null)));
$$;

-- Rubros: gerente en cualquiera; recepción donde hay caja o taller; delivery solo si el negocio tiene reparto activo
create or replace function public.role_allowed_in_company(p_company uuid, p_role text)
 returns boolean language sql stable security definer set search_path to 'public' as $$
  with m as (select company_modules(p_company) as mods)
  select case p_role
    when 'cashier' then mods && array['retail','distribution','restaurant','workshop']
    when 'vendor' then mods && array['retail','distribution']
    when 'waiter' then 'restaurant' = any(mods)
    when 'kitchen' then 'restaurant' = any(mods)
    when 'technician' then 'workshop' = any(mods)
    when 'reception' then mods && array['retail','distribution','restaurant','workshop']
    when 'storekeeper' then 'inventory' = any(mods)
    when 'delivery' then mods && array['retail','restaurant','distribution']
                         and exists (select 1 from branches b where b.company_id = p_company and b.delivery_enabled and b.deleted_at is null)
    when 'collector' then 'field_collection' = any(mods)
    when 'supervisor' then true
    when 'manager' then true
    when 'accountant' then true
    when 'director' then true
    when 'secretary' then true
    else false end
  from m;
$$;

create or replace function public.org_add_team_role(p_org uuid, p_role text)
 returns text[] language plpgsql security definer set search_path to 'public' as $$
declare cur text[]; lim int; ok boolean;
begin
  if not is_org_owner(p_org) then raise exception 'Solo el administrador activa roles'; end if;
  if p_role not in ('supervisor','manager','cashier','vendor','collector','waiter','kitchen','technician','storekeeper','accountant','reception','delivery') then
    raise exception 'ROLE_NOT_IN_NICHE';
  end if;
  ok := case p_role
    when 'cashier' then module_enabled(p_org,'retail') or module_enabled(p_org,'distribution') or module_enabled(p_org,'restaurant') or module_enabled(p_org,'workshop')
    when 'vendor' then module_enabled(p_org,'retail') or module_enabled(p_org,'distribution')
    when 'waiter' then module_enabled(p_org,'restaurant')
    when 'kitchen' then module_enabled(p_org,'restaurant')
    when 'technician' then module_enabled(p_org,'workshop')
    when 'reception' then module_enabled(p_org,'retail') or module_enabled(p_org,'distribution') or module_enabled(p_org,'restaurant') or module_enabled(p_org,'workshop')
    when 'storekeeper' then module_enabled(p_org,'inventory')
    when 'delivery' then (module_enabled(p_org,'retail') or module_enabled(p_org,'restaurant') or module_enabled(p_org,'distribution'))
                         and exists (select 1 from branches b where b.org_id = p_org and b.delivery_enabled and b.deleted_at is null)
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

-- Panel: el gerente ofrece lo mismo que el supervisor y recepción suma lo de caja del rubro
create or replace function public.role_offered_keys(p_role text)
 returns text[] language sql immutable set search_path to 'public' as $$
  select case p_role
    when 'supervisor' then array['cash.see_expected','cash.expense','cash.deposit','cash.change_fund','payments.reverse','sales.credit','inv.see_cost','inv.adjust','products.price','products.delete','customers.edit','reports.export','store.publish','loans.create','loans.interest','loans.cancel','loans.reschedule','routes.invest','routes.liquidate','routes.approve_loans']
    when 'manager' then array['cash.see_expected','cash.expense','cash.deposit','cash.change_fund','payments.reverse','sales.credit','inv.see_cost','inv.adjust','products.price','products.delete','customers.edit','reports.export','store.publish','loans.create','loans.interest','loans.cancel','loans.reschedule','routes.invest','routes.liquidate','routes.approve_loans']
    when 'cashier' then array['products.see_code','cash.see_expected','cash.expense','cash.deposit','cash.change_fund','customers.view_docs','customers.upload_docs','payments.reverse','sales.cancel_request','store.photo','store.publish','store.edit_info','store.orders','store.assign']
    when 'vendor' then array['products.see_code','sales.credit','inv.see_cost','customers.create','customers.edit','customers.view_docs','customers.upload_docs','payments.reverse','sales.cancel_request','store.photo','store.publish','store.edit_info','store.orders','store.assign']
    when 'collector' then array['collector.expenses','collector.pay_out','collector.portfolio','loans.create','loans.customers','loans.interest','loans.cancel','loans.reschedule','payments.reverse','routes.liquidate','routes.invest']
    when 'storekeeper' then array['products.see_code','products.create','products.edit','products.price','products.delete','inv.receive','inv.purchase','inv.adjust','inv.out_waste','inv.out_damaged','inv.out_expired','inv.out_internal','inv.out_supplier_return','inv.out_other','inv.transfer','inv.see_cost','inv.photo','store.photo','store.publish','store.edit_info','store.orders','store.assign']
    when 'accountant' then array['reports.export','inv.see_cost','products.see_code','customers.view_docs']
    when 'director' then array['reports.export','inv.see_cost','products.see_code','customers.view_docs']
    when 'secretary' then array['reports.export','products.see_code','customers.view_docs']
    when 'waiter' then array['products.see_code','sales.cancel_request','tables.remove_item']
    when 'kitchen' then array['products.see_code']
    when 'technician' then array['customers.create','customers.edit','customers.view_docs','customers.upload_docs','products.see_code','workshop.remove_line']
    when 'delivery' then array['products.see_code']
    when 'reception' then array['customers.create','customers.edit','customers.view_docs','customers.upload_docs','products.see_code','sales.cancel_request','store.orders','cash.expense','cash.deposit','cash.change_fund','payments.reverse']
    else '{}'::text[] end;
$$;

-- El gerente parte con los mismos valores que el supervisor; el administrador los ajusta por rol
create or replace function public.perm_default(p_role text, p_key text)
 returns boolean language sql immutable set search_path to 'public' as $$
  select case
    when p_role = 'manager' then perm_default_base('supervisor', p_key)
    when p_key in ('tables.remove_item', 'workshop.remove_line') then p_role = 'supervisor' or p_key = any(role_offered_keys(p_role))
    when p_role in ('cashier','storekeeper','accountant','director','secretary','waiter','kitchen','technician','delivery','reception')
         and p_key = any(perm_catalog()) then p_key = any(role_default_keys(p_role))
    else perm_default_base(p_role, p_key) end;
$$;

create or replace function public.permissions_admin(p_org uuid)
 returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v_roles text[] := array['manager','supervisor','cashier','vendor','collector','waiter','kitchen','technician','storekeeper','accountant','director','secretary','reception','delivery'];
begin
  if not (is_org_owner(p_org) or is_platform_admin()) then raise exception 'Sin permiso'; end if;
  return jsonb_build_object(
    'keys', to_jsonb(perm_catalog()),
    'offered', (select jsonb_object_agg(r, to_jsonb(role_offered_keys(r))) from unnest(v_roles) r),
    'roles', (select jsonb_object_agg(r, (select jsonb_object_agg(k,
                coalesce((o.role_permissions->r->>k)::boolean, perm_default(r, k))) from unnest(perm_catalog()) k))
              from unnest(v_roles) r, organizations o where o.id = p_org),
    'users', (select coalesce(jsonb_agg(jsonb_build_object(
                'membership_id', m.id, 'name', p.full_name, 'role', m.role, 'branch', b.name,
                'permissions', m.permissions) order by p.full_name, m.role), '[]'::jsonb)
                from memberships m
                join profiles p on p.id = m.user_id
                left join branches b on b.id = m.branch_id
               where m.org_id = p_org and m.is_active and m.deleted_at is null
                 and m.role <> 'owner')
  );
end $$;
