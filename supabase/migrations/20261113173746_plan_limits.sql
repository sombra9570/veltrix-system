-- Veltrix · Límites por plan (nada ilimitado) + extras pagados
alter table plans add column if not exists max_storage_mb int;

update plans set price_usd = 19,  max_companies = 1, max_branches = 1,  max_users = 3,  max_storage_mb = 1024  where code = 'starter';
update plans set price_usd = 40,  max_companies = 1, max_branches = 3,  max_users = 15, max_storage_mb = 5120  where code = 'pro';
update plans set price_usd = 115, max_companies = 3, max_branches = 10, max_users = 50, max_storage_mb = 20480 where code = 'enterprise';

alter table organizations add column if not exists extra_branches int not null default 0 check (extra_branches >= 0);
alter table organizations add column if not exists extra_users    int not null default 0 check (extra_users >= 0);
alter table organizations add column if not exists extra_storage_mb int not null default 0 check (extra_storage_mb >= 0);

create or replace function guard_org_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not is_platform_admin() and
     (new.subscription_status, new.plan_id, new.next_billing_date, new.grace_ends_at,
      new.payment_method_token, new.trial_ends_at,
      new.extra_branches, new.extra_users, new.extra_storage_mb)
     is distinct from
     (old.subscription_status, old.plan_id, old.next_billing_date, old.grace_ends_at,
      old.payment_method_token, old.trial_ends_at,
      old.extra_branches, old.extra_users, old.extra_storage_mb) then
    raise exception 'Los datos de suscripción solo los cambia la pasarela de pago';
  end if;
  return new;
end $$;

create or replace function org_limits(p_org uuid)
returns table (
  max_companies int, max_branches int, max_users int, max_storage_mb int,
  used_companies int, used_branches int, used_users int
)
language sql stable security definer set search_path = public as $$
  select p.max_companies,
         p.max_branches + o.extra_branches,
         p.max_users + o.extra_users,
         p.max_storage_mb + o.extra_storage_mb,
         (select count(*)::int from companies c where c.org_id = o.id and c.deleted_at is null),
         (select count(*)::int from branches b where b.org_id = o.id and b.deleted_at is null and b.is_active),
         (select count(distinct m.user_id)::int from memberships m
           where m.org_id = o.id and m.is_active and m.deleted_at is null)
    from organizations o join plans p on p.id = o.plan_id
   where o.id = p_org;
$$;

create or replace function my_plan_usage(p_org uuid)
returns table (
  max_companies int, max_branches int, max_users int, max_storage_mb int,
  used_companies int, used_branches int, used_users int
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (is_org_owner(p_org) or is_platform_admin()) then
    raise exception 'Sin permiso';
  end if;
  return query select * from org_limits(p_org);
end $$;

revoke all on function org_limits(uuid) from public, anon, authenticated;
revoke all on function my_plan_usage(uuid) from public, anon;
grant execute on function my_plan_usage(uuid) to authenticated;

create or replace function enforce_plan_limits() returns trigger
language plpgsql security definer set search_path = public as $$
declare l record;
begin
  if tg_op = 'UPDATE' then
    if tg_table_name = 'companies' then
      if not (old.deleted_at is not null and new.deleted_at is null) then return new; end if;
    else
      if not ((not old.is_active or old.deleted_at is not null) and new.is_active and new.deleted_at is null) then
        return new;
      end if;
    end if;
  end if;

  select * into l from org_limits(new.org_id);
  if not found then return new; end if;

  if tg_table_name = 'companies' and l.max_companies is not null and l.used_companies >= l.max_companies then
    raise exception 'PLAN_LIMIT_COMPANIES: tu plan permite % empresa(s). Mejora tu plan para agregar más.', l.max_companies
      using errcode = 'P0001';
  end if;

  if tg_table_name = 'branches' and l.max_branches is not null and l.used_branches >= l.max_branches then
    raise exception 'PLAN_LIMIT_BRANCHES: tu plan permite % sucursal(es). Compra una sucursal extra o mejora tu plan.', l.max_branches
      using errcode = 'P0001';
  end if;

  if tg_table_name = 'memberships' then
    if l.max_users is not null and l.used_users >= l.max_users
       and not exists (select 1 from memberships m
                        where m.org_id = new.org_id and m.user_id = new.user_id
                          and m.is_active and m.deleted_at is null and m.id <> new.id) then
      raise exception 'PLAN_LIMIT_USERS: tu plan permite % usuario(s). Compra usuarios extra o mejora tu plan.', l.max_users
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists companies_plan_limit on companies;
drop trigger if exists branches_plan_limit on branches;
drop trigger if exists memberships_plan_limit on memberships;
create trigger companies_plan_limit   before insert or update on companies   for each row execute function enforce_plan_limits();
create trigger branches_plan_limit    before insert or update on branches    for each row execute function enforce_plan_limits();
create trigger memberships_plan_limit before insert or update on memberships for each row execute function enforce_plan_limits();
