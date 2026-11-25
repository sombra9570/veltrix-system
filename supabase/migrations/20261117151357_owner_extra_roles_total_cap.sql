alter table memberships add column if not exists extra_roles app_role[] not null default '{}';
alter table plans add column if not exists max_total_roles int;
update plans set max_total_roles = 3 where code = 'basic';

create or replace function org_roles_used(p_org uuid, p_exclude uuid, p_extra app_role[], p_owner_extra app_role[] default null)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from (
    select m.role::text r from memberships m where m.org_id = p_org and m.id is distinct from p_exclude and m.deleted_at is null and m.is_active and m.role <> 'owner'
    union select unnest(cr.also_roles)::text from memberships m join custom_roles cr on cr.id = m.custom_role_id and cr.deleted_at is null
      where m.org_id = p_org and m.id is distinct from p_exclude and m.deleted_at is null and m.is_active
    union select unnest(coalesce(p_owner_extra, (select m.extra_roles from memberships m where m.org_id = p_org and m.role = 'owner' and m.deleted_at is null limit 1), '{}'))::text
    union select unnest(coalesce(p_extra,'{}'))::text
  ) u;
$$;
revoke all on function org_roles_used(uuid,uuid,app_role[],app_role[]) from public, anon, authenticated;

create or replace function enforce_plan_roles() returns trigger
language plpgsql security definer set search_path = public as $$
declare lim int; tot int; used int; ex app_role[];
begin
  if new.role = 'owner' or new.deleted_at is not null then return new; end if;
  select p.max_roles, p.max_total_roles into lim, tot from organizations o join plans p on p.id = o.plan_id where o.id = new.org_id;
  select coalesce(array_agg(x), '{}') into ex from (select new.role x union select unnest(cr.also_roles) from custom_roles cr where cr.id = new.custom_role_id and cr.deleted_at is null) q;
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
  select p.max_total_roles into tot from organizations o join plans p on p.id = o.plan_id where o.id = p_org;
  if tot is not null and org_roles_used(p_org, null, '{}', r) + 1 > tot then raise exception 'PLAN_TOTAL_ROLES_LIMIT:%', tot; end if;
  update memberships set extra_roles = r where org_id = p_org and role = 'owner' and user_id = auth.uid();
end $$;
grant execute on function set_owner_roles(uuid, app_role[]) to authenticated;
