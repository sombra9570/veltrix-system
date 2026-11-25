-- Puestos de trabajador: desde el 2.º rol de una persona, cada rol suma un puesto (el plan Básico no suma extra)
create or replace function user_slots(p_org uuid, p_user uuid, p_new_role app_role default null, p_new_custom uuid default null)
returns int language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from organizations o join plans p on p.id = o.plan_id where o.id = p_org and p.code = 'basic') then 1
    else greatest(1, (select count(*)::int from (
      select m.role::text r from memberships m where m.org_id = p_org and m.user_id = p_user and m.is_active and m.deleted_at is null and m.role <> 'owner'
      union select unnest(cr.also_roles)::text from memberships m join custom_roles cr on cr.id = m.custom_role_id and cr.deleted_at is null
        where m.org_id = p_org and m.user_id = p_user and m.is_active and m.deleted_at is null
      union select p_new_role::text where p_new_role is not null and p_new_role <> 'owner'
      union select unnest(cr.also_roles)::text from custom_roles cr where cr.id = p_new_custom and cr.deleted_at is null
    ) u))
  end;
$$;
revoke all on function user_slots(uuid,uuid,app_role,uuid) from public, anon, authenticated;

create or replace function org_limits(p_org uuid)
returns table(max_companies integer, max_branches integer, max_users integer, max_storage_mb integer, used_companies integer, used_branches integer, used_users integer)
language sql stable security definer set search_path to 'public' as $$
  select p.max_companies,
         p.max_branches + o.extra_branches,
         p.max_users + o.extra_users,
         p.max_storage_mb + o.extra_storage_mb,
         (select count(*)::int from companies c where c.org_id = o.id and c.deleted_at is null),
         (select count(*)::int from branches b where b.org_id = o.id and b.deleted_at is null and b.is_active),
         (select coalesce(sum(case when x.is_owner then 1 else user_slots(o.id, x.user_id) end), 0)::int from (
            select m.user_id, bool_or(m.role = 'owner') is_owner from memberships m
             where m.org_id = o.id and m.is_active and m.deleted_at is null group by m.user_id) x)
    from organizations o join plans p on p.id = o.plan_id
   where o.id = p_org;
$$;

create or replace function enforce_worker_slots() returns trigger
language plpgsql security definer set search_path = public as $$
declare l record; others int; mine int;
begin
  if new.role = 'owner' or new.deleted_at is not null or not new.is_active then return new; end if;
  select * into l from org_limits(new.org_id);
  if not found or l.max_users is null then return new; end if;
  -- puestos que ocupan las demás personas + los de esta persona con el rol que recibe
  others := l.used_users - case when exists (select 1 from memberships m where m.org_id = new.org_id and m.user_id = new.user_id and m.is_active and m.deleted_at is null and m.id is distinct from new.id)
                                then user_slots(new.org_id, new.user_id) else 0 end;
  mine := user_slots(new.org_id, new.user_id, new.role, new.custom_role_id);
  -- al actualizar, la fila vieja ya cuenta en used_users: se descuenta con user_slots (que la incluye)
  if tg_op = 'UPDATE' and old.is_active and old.deleted_at is null and old.role <> 'owner' then
    others := l.used_users - user_slots(new.org_id, new.user_id);
  end if;
  if others + mine > l.max_users then
    raise exception 'PLAN_LIMIT_USERS: tu plan permite % puestos de trabajo (cada rol extra de una persona cuenta uno). Compra extras o mejora tu plan.', l.max_users using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists trg_enforce_worker_slots on memberships;
create trigger trg_enforce_worker_slots before insert or update of role, custom_role_id, is_active, deleted_at on memberships
  for each row execute function enforce_worker_slots();
