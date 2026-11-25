
-- Roles propios: un nombre + el rol base que da la pantalla principal + otros roles cuyas funciones también cubre + permisos finos.
create table if not exists public.custom_roles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 40),
  base_role public.app_role not null check (base_role <> 'owner'),
  also_roles public.app_role[] not null default '{}' check (not ('owner' = any(also_roles))),
  permissions jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (org_id, name)
);
alter table public.custom_roles enable row level security;
drop policy if exists custom_roles_read on public.custom_roles;
create policy custom_roles_read on public.custom_roles for select to authenticated
  using (deleted_at is null and (is_org_owner(org_id) or exists (select 1 from memberships m where m.user_id = auth.uid() and m.org_id = custom_roles.org_id and m.is_active and m.deleted_at is null)));

alter table public.memberships add column if not exists custom_role_id uuid references public.custom_roles(id) on delete set null;

-- Todas las puertas existentes (vender, inventario, lectura...) pasan por aquí: un rol propio abre también las funciones de los roles que cubre.
create or replace function public.has_branch_role(p_branch uuid, p_roles app_role[])
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from memberships m
      join profiles p on p.id = m.user_id
      left join custom_roles cr on cr.id = m.custom_role_id and cr.deleted_at is null
    where m.user_id = auth.uid() and m.branch_id = p_branch
      and (m.role = any(p_roles) or (cr.id is not null and (cr.base_role = any(p_roles) or cr.also_roles && p_roles)))
      and m.is_active and m.deleted_at is null and p.is_active);
$$;

-- Permisos finos: ajuste individual > permisos del rol propio > ajuste del rol en la empresa > valor por defecto
create or replace function public.has_perm(p_key text, p_branch uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select case
    when is_platform_admin() then true
    when exists (select 1 from branches b where b.id = p_branch and is_org_owner(b.org_id)) then true
    when is_branch_manager(p_branch) and p_key not like 'routes.%' then true
    else coalesce(
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

create or replace function public.custom_roles_list(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not (is_org_owner(p_org) or is_platform_admin()) then raise exception 'Solo el administrador ve los roles'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'base_role', c.base_role, 'also_roles', c.also_roles,
           'permissions', c.permissions, 'members', (select count(*) from memberships m where m.custom_role_id = c.id and m.deleted_at is null))
           order by c.name) from custom_roles c where c.org_id = p_org and c.deleted_at is null), '[]'::jsonb);
end $$;

create or replace function public.custom_role_save(p_org uuid, p_id uuid, p_name text, p_base app_role, p_also app_role[], p_perms jsonb)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid; k text; clean jsonb := '{}'::jsonb;
begin
  if not is_org_owner(p_org) then raise exception 'Solo el administrador crea roles'; end if;
  if p_base = 'owner' or 'owner' = any(coalesce(p_also, '{}')) then raise exception 'Un rol propio no puede ser administrador'; end if;
  for k in select jsonb_object_keys(coalesce(p_perms, '{}'::jsonb)) loop
    if not (k = any(perm_catalog())) then raise exception 'Permiso inexistente: %', k; end if;
    clean := clean || jsonb_build_object(k, (p_perms->>k)::boolean);
  end loop;
  if p_id is null then
    insert into custom_roles(org_id, name, base_role, also_roles, permissions)
    values (p_org, btrim(p_name), p_base, coalesce(p_also, '{}'), clean) returning id into v_id;
  else
    update custom_roles set name = btrim(p_name), base_role = p_base, also_roles = coalesce(p_also, '{}'), permissions = clean, updated_at = now()
     where id = p_id and org_id = p_org and deleted_at is null returning id into v_id;
    if v_id is null then raise exception 'Rol no encontrado'; end if;
  end if;
  insert into audit_log(org_id, table_name, row_id, action, actor_id, new_data)
    values (p_org, 'custom_roles', v_id, case when p_id is null then 'create' else 'update' end, auth.uid(),
            jsonb_build_object('name', btrim(p_name), 'base_role', p_base, 'also_roles', p_also, 'permissions', clean));
  return v_id;
end $$;

create or replace function public.custom_role_delete(p_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare r custom_roles%rowtype;
begin
  select * into r from custom_roles where id = p_id and deleted_at is null;
  if not found or not is_org_owner(r.org_id) then raise exception 'Solo el administrador borra roles'; end if;
  if exists (select 1 from memberships where custom_role_id = p_id and deleted_at is null) then
    raise exception 'ROLE_IN_USE: hay trabajadores con este rol; cámbiales el rol primero';
  end if;
  update custom_roles set deleted_at = now() where id = p_id;
  insert into audit_log(org_id, table_name, row_id, action, actor_id, old_data)
    values (r.org_id, 'custom_roles', p_id, 'delete', auth.uid(), jsonb_build_object('name', r.name));
end $$;

create or replace function public.set_member_custom_role(p_membership uuid, p_role uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare m memberships%rowtype; c custom_roles%rowtype;
begin
  select * into m from memberships where id = p_membership and deleted_at is null;
  if not found or not is_org_owner(m.org_id) then raise exception 'Solo el administrador asigna roles'; end if;
  if p_role is not null then
    select * into c from custom_roles where id = p_role and org_id = m.org_id and deleted_at is null;
    if not found then raise exception 'Rol no encontrado'; end if;
  end if;
  update memberships set custom_role_id = p_role, role = coalesce(c.base_role, m.role), updated_at = now() where id = p_membership;
  insert into audit_log(org_id, branch_id, table_name, row_id, action, actor_id, old_data, new_data)
    values (m.org_id, m.branch_id, 'memberships', p_membership, 'custom_role', auth.uid(),
            jsonb_build_object('custom_role_id', m.custom_role_id, 'role', m.role), jsonb_build_object('custom_role_id', p_role, 'role', coalesce(c.base_role, m.role)));
end $$;

revoke all on function public.custom_roles_list(uuid), public.custom_role_save(uuid, uuid, text, app_role, app_role[], jsonb), public.custom_role_delete(uuid), public.set_member_custom_role(uuid, uuid) from public, anon;
grant execute on function public.custom_roles_list(uuid), public.custom_role_save(uuid, uuid, text, app_role, app_role[], jsonb), public.custom_role_delete(uuid), public.set_member_custom_role(uuid, uuid) to authenticated;
