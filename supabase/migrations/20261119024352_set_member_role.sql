create or replace function set_member_role(p_membership uuid, p_role text, p_custom uuid default null, p_branch uuid default null) returns void
language plpgsql security definer set search_path = public as $$
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
  update memberships set role = v_role, custom_role_id = p_custom, branch_id = coalesce(p_branch, branch_id), updated_at = now() where id = p_membership;
  insert into audit_log(org_id, branch_id, table_name, row_id, action, actor_id, old_data, new_data)
    values (m.org_id, coalesce(p_branch, m.branch_id), 'memberships', p_membership, 'set_role', auth.uid(),
            jsonb_build_object('role', m.role, 'custom_role_id', m.custom_role_id, 'branch_id', m.branch_id),
            jsonb_build_object('role', v_role, 'custom_role_id', p_custom, 'branch_id', coalesce(p_branch, m.branch_id)));
end $$;
revoke all on function set_member_role(uuid, text, uuid, uuid) from public, anon;
grant execute on function set_member_role(uuid, text, uuid, uuid) to authenticated;

-- El trabajador de prueba "delivery" se había creado como Delivery y un cambio de rol propio lo dejó en Técnico
update memberships set role = 'delivery', custom_role_id = null
 where user_id = (select id from profiles where email = 'giraldofgh+delivery@gmail.com') and org_id = 'be0f51c4-3518-4f89-a3c0-586c5f52c0bf' and deleted_at is null;
