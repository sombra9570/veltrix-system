create or replace function public.org_add_team_role(p_org uuid, p_role text)
returns text[]
language plpgsql security definer set search_path to 'public'
as $$
declare cur text[]; lim int; ok boolean;
begin
  if not is_org_owner(p_org) then raise exception 'Solo el administrador activa roles'; end if;
  if p_role not in ('supervisor','cashier','vendor','collector','waiter','kitchen','technician','storekeeper','accountant','reception','delivery') then
    raise exception 'ROLE_NOT_IN_NICHE';
  end if;
  -- el rol debe pertenecer al rubro: se exige el módulo que lo hace posible
  ok := case p_role
    when 'cashier' then module_enabled(p_org,'retail') or module_enabled(p_org,'distribution') or module_enabled(p_org,'restaurant') or module_enabled(p_org,'workshop')
    when 'vendor' then module_enabled(p_org,'retail') or module_enabled(p_org,'distribution')
    when 'waiter' then module_enabled(p_org,'restaurant')
    when 'kitchen' then module_enabled(p_org,'restaurant')
    when 'technician' then module_enabled(p_org,'workshop')
    when 'reception' then module_enabled(p_org,'workshop')
    when 'storekeeper' then module_enabled(p_org,'inventory')
    when 'delivery' then module_enabled(p_org,'retail') or module_enabled(p_org,'restaurant') or module_enabled(p_org,'distribution')
    when 'collector' then module_enabled(p_org,'field_collection')
    when 'supervisor' then module_enabled(p_org,'field_collection')
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
revoke all on function public.org_add_team_role(uuid, text) from public, anon;
grant execute on function public.org_add_team_role(uuid, text) to authenticated;
