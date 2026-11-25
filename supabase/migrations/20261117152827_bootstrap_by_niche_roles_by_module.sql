create or replace function bootstrap_company(p_company uuid, p_modules text[] default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare c companies%rowtype; v_branch uuid; m text;
begin
  select * into c from companies where id = p_company;
  if not found or not is_org_owner(c.org_id) then raise exception 'Sin permiso'; end if;

  -- Solo los módulos del nicho del negocio (y que permita el plan); sin lista: todos los que permita el plan
  for m in select unnest(array['inventory','purchasing','finance','retail','restaurant',
                               'workshop','field_collection','distribution','hr']) loop
    continue when p_modules is not null and not (m = any(p_modules));
    begin
      insert into org_modules (org_id, module) values (c.org_id, m) on conflict do nothing;
    exception when others then null;
    end;
  end loop;

  select id into v_branch from branches where company_id = c.id and deleted_at is null order by created_at limit 1;
  if v_branch is null then
    insert into branches (org_id, company_id, code, name)
    values (c.org_id, c.id, 'PRI', 'Sucursal Principal') returning id into v_branch;
  end if;
  if not exists (select 1 from cash_registers where branch_id = v_branch) then
    insert into cash_registers (org_id, company_id, branch_id, name) values (c.org_id, c.id, v_branch, 'Caja 01');
  end if;
  if module_enabled(c.org_id, 'inventory') and not exists (select 1 from warehouses where branch_id = v_branch) then
    insert into warehouses (org_id, company_id, branch_id, name, is_default)
    values (c.org_id, c.id, v_branch, 'Almacén principal', true);
  end if;
  return v_branch;
end $$;

create or replace function role_module_ok(p_org uuid, p_roles app_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from unnest(coalesce(p_roles,'{}')) r
    where (r in ('waiter','kitchen') and not module_enabled(p_org,'restaurant'))
       or (r = 'technician' and not module_enabled(p_org,'workshop'))
       or (r = 'collector' and not module_enabled(p_org,'field_collection'))
       or (r = 'storekeeper' and not module_enabled(p_org,'inventory')));
$$;
revoke all on function role_module_ok(uuid,app_role[]) from public, anon, authenticated;

create or replace function enforce_plan_roles() returns trigger
language plpgsql security definer set search_path = public as $$
declare lim int; tot int; used int; ex app_role[];
begin
  if new.role = 'owner' or new.deleted_at is not null then return new; end if;
  select p.max_roles, p.max_total_roles into lim, tot from organizations o join plans p on p.id = o.plan_id where o.id = new.org_id;
  select coalesce(array_agg(x), '{}') into ex from (select new.role x union select unnest(cr.also_roles) from custom_roles cr where cr.id = new.custom_role_id and cr.deleted_at is null) q;
  if not role_module_ok(new.org_id, ex) then raise exception 'ROLE_NOT_IN_NICHE'; end if;
  used := org_roles_used(new.org_id, new.id, ex, '{}');
  if lim is not null and used > lim then raise exception 'PLAN_ROLES_LIMIT:%', lim; end if;
  if tot is not null and org_roles_used(new.org_id, new.id, ex, null) + 1 > tot then raise exception 'PLAN_TOTAL_ROLES_LIMIT:%', tot; end if;
  return new;
end $$;

create or replace function set_owner_roles(p_org uuid, p_roles app_role[]) returns void
language plpgsql security definer set search_path = public as $$
declare tot int; r app_role[];
begin
  if not is_org_owner(p_org) then raise exception 'PERM_DENIED'; end if;
  select coalesce(array_agg(distinct x), '{}') into r from unnest(coalesce(p_roles,'{}')) x where x <> 'owner';
  if not role_module_ok(p_org, r) then raise exception 'ROLE_NOT_IN_NICHE'; end if;
  select p.max_total_roles into tot from organizations o join plans p on p.id = o.plan_id where o.id = p_org;
  if tot is not null and org_roles_used(p_org, null, '{}', r) + 1 > tot then raise exception 'PLAN_TOTAL_ROLES_LIMIT:%', tot; end if;
  update memberships set extra_roles = r where org_id = p_org and role = 'owner' and user_id = auth.uid();
end $$;
