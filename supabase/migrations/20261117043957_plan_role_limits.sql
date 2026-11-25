
-- Límites del plan sobre rubros y cargos (editables luego desde la consola del superadmin)
alter table public.plans
  add column if not exists max_niches int not null default 99,
  add column if not exists max_roles int not null default 9,
  add column if not exists max_custom_roles int not null default 99,
  add column if not exists max_role_combo int not null default 6;

update public.plans set max_niches = 1,  max_roles = 3, max_custom_roles = 1,  max_role_combo = 2 where code = 'basic';
update public.plans set max_niches = 1,  max_roles = 5, max_custom_roles = 2,  max_role_combo = 3 where code = 'starter';
update public.plans set max_niches = 2,  max_roles = 7, max_custom_roles = 5,  max_role_combo = 4 where code = 'pro';
update public.plans set max_niches = 4,  max_roles = 9, max_custom_roles = 15, max_role_combo = 5 where code = 'enterprise';
update public.plans set max_niches = 99, max_roles = 9, max_custom_roles = 99, max_role_combo = 6 where code = 'enterprise_plus';

-- Un rol propio respeta el plan: cuántos roles propios y cuántas funciones puede juntar
create or replace function public.custom_role_save(p_org uuid, p_id uuid, p_name text, p_base app_role, p_also app_role[], p_perms jsonb)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid; k text; clean jsonb := '{}'::jsonb; pl plans%rowtype; combo int; n int;
begin
  if not is_org_owner(p_org) then raise exception 'Solo el administrador crea roles'; end if;
  if p_base = 'owner' or 'owner' = any(coalesce(p_also, '{}')) then raise exception 'Un rol propio no puede ser administrador'; end if;
  select p.* into pl from organizations o join plans p on p.id = o.plan_id where o.id = p_org;
  combo := 1 + cardinality(array(select distinct x from unnest(coalesce(p_also, '{}')) x where x <> p_base));
  if found and combo > pl.max_role_combo then raise exception 'PLAN_COMBO_LIMIT:%', pl.max_role_combo; end if;
  if p_id is null then
    select count(*) into n from custom_roles where org_id = p_org and deleted_at is null;
    if found and n >= pl.max_custom_roles then raise exception 'PLAN_CUSTOM_LIMIT:%', pl.max_custom_roles; end if;
  end if;
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

-- Cargos distintos en uso (roles de los trabajadores + funciones que cubren sus roles propios) no pueden pasar del plan
create or replace function public.enforce_plan_roles() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare lim int; used int;
begin
  if new.role = 'owner' or new.deleted_at is not null then return new; end if;
  select p.max_roles into lim from organizations o join plans p on p.id = o.plan_id where o.id = new.org_id;
  if lim is null then return new; end if;
  select count(*) into used from (
    select m.role::text r from memberships m where m.org_id = new.org_id and m.id is distinct from new.id and m.deleted_at is null and m.is_active and m.role <> 'owner'
    union select new.role::text
    union select unnest(cr.also_roles)::text from memberships m join custom_roles cr on cr.id = m.custom_role_id and cr.deleted_at is null
           where m.org_id = new.org_id and m.id is distinct from new.id and m.deleted_at is null and m.is_active
    union select unnest(cr.also_roles)::text from custom_roles cr where cr.id = new.custom_role_id and cr.deleted_at is null
  ) u;
  if used > lim then raise exception 'PLAN_ROLES_LIMIT:%', lim; end if;
  return new;
end $$;
drop trigger if exists trg_enforce_plan_roles on public.memberships;
create trigger trg_enforce_plan_roles before insert or update of role, custom_role_id, is_active on public.memberships
  for each row execute function public.enforce_plan_roles();
