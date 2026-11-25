create or replace function public.transfer_worker_post(p_org uuid, p_from uuid, p_to uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare m record; n integer := 0;
begin
  if not is_org_owner(p_org) then raise exception 'PERM_DENIED'; end if;
  if p_from = p_to then raise exception 'SAME_USER'; end if;
  if exists (select 1 from memberships where org_id = p_org and user_id in (p_from, p_to) and role = 'owner' and deleted_at is null) then
    raise exception 'OWNER_NOT_ALLOWED';
  end if;
  if not exists (select 1 from memberships where org_id = p_org and user_id = p_to and deleted_at is null) then
    raise exception 'TARGET_NOT_FOUND';
  end if;
  if not exists (select 1 from memberships where org_id = p_org and user_id = p_from and deleted_at is null) then
    raise exception 'SOURCE_NOT_FOUND';
  end if;
  -- Una caja abierta se cierra antes de pasar el cargo: así el efectivo no queda a nombre de otra persona
  if exists (select 1 from register_shifts s where s.org_id = p_org and s.cashier_id = p_from and s.status = 'open') then
    raise exception 'SHIFT_OPEN';
  end if;

  for m in select * from memberships where org_id = p_org and user_id = p_from and deleted_at is null loop
    insert into memberships (org_id, user_id, company_id, branch_id, role, is_active, permissions, limits, custom_role_id, extra_roles, created_by)
    values (p_org, p_to, m.company_id, m.branch_id, m.role, true, m.permissions, m.limits, m.custom_role_id, m.extra_roles, auth.uid())
    on conflict (user_id, branch_id, role) do update
      set is_active = true, deleted_at = null, custom_role_id = excluded.custom_role_id;
    n := n + 1;
  end loop;

  -- La persona anterior queda inactiva: su historial (ventas, cobros, turnos) sigue a su nombre
  update memberships set is_active = false where org_id = p_org and user_id = p_from and deleted_at is null;

  -- Los pedidos de tienda aún sin entregar pasan a la nueva persona
  update delivery_requests set assigned_to = p_to
   where assigned_to = p_from and fulfilled_at is null
     and branch_id in (select id from branches where org_id = p_org);
  return n;
end $function$;
revoke all on function public.transfer_worker_post(uuid, uuid, uuid) from public, anon;
grant execute on function public.transfer_worker_post(uuid, uuid, uuid) to authenticated;
