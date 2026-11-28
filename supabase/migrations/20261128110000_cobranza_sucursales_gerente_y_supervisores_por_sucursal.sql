-- Cobranza en calle: sucursales con su propio equipo.
-- · La sucursal no tiene costo propio (no cuenta en el límite de sucursales del plan): solo se paga por cobrador.
-- · Un gerente por sucursal (la principal conserva la regla de 5 cobradores).
-- · Supervisores por sucursal según sus cobradores (1 por cada N, sin contar al administrador); sin cobradores no se activa supervisor.

create or replace function public.street_workers_in_branch(p_org uuid, p_branch uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from memberships m
   where m.org_id = p_org and m.role = 'collector' and m.is_active and m.deleted_at is null and m.branch_id is not distinct from p_branch
     and not exists (select 1 from memberships o where o.org_id = p_org and o.user_id = m.user_id and o.role = 'owner' and o.is_active and o.deleted_at is null);
$$;

create or replace function public.street_supervisors_allowed(p_org uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(sum(ceil(street_workers_in_branch(p_org, b.id)::numeric / (select collectors_per_supervisor from street_plan where id)))::int, 0)
    from branches b where b.org_id = p_org and b.deleted_at is null and b.is_active;
$$;

create or replace function public.enforce_street_limits() returns trigger
language plpgsql security definer set search_path = public as $$
declare sc int; per int; used int; mgr int; main_branch uuid; allowed int;
begin
  if new.deleted_at is not null or not new.is_active or new.role not in ('collector','supervisor','manager') then return new; end if;
  if tg_op = 'UPDATE' and old.is_active and old.deleted_at is null and old.role = new.role then return new; end if;
  select street_collectors into sc from organizations where id = new.org_id;
  if sc is null then return new; end if;
  select collectors_per_supervisor, manager_after_collectors into per, mgr from street_plan where id;
  if new.role = 'manager' then
    select id into main_branch from branches where org_id = new.org_id and deleted_at is null order by created_at limit 1;
    if new.branch_id is not distinct from main_branch and sc <= mgr then raise exception 'STREET_MANAGER_LOCKED:%', mgr + 1; end if;
    if exists (select 1 from memberships where org_id = new.org_id and role = 'manager' and is_active and deleted_at is null
                  and branch_id is not distinct from new.branch_id and id <> new.id) then raise exception 'STREET_MANAGER_LIMIT'; end if;
    return new;
  end if;
  if new.role = 'collector' then
    select count(*) into used from memberships where org_id = new.org_id and role = 'collector' and is_active and deleted_at is null and id <> new.id;
    if used + 1 > sc then raise exception 'STREET_COLLECTORS_LIMIT:%', sc; end if;
    return new;
  end if;
  -- supervisor: según los cobradores de su sucursal
  allowed := ceil(street_workers_in_branch(new.org_id, new.branch_id)::numeric / per)::int;
  select count(*) into used from memberships where org_id = new.org_id and role = 'supervisor' and is_active and deleted_at is null
     and branch_id is not distinct from new.branch_id and id <> new.id;
  if allowed = 0 then raise exception 'STREET_SUPERVISOR_NEEDS_WORKER'; end if;
  if used + 1 > allowed then raise exception 'STREET_SUPERVISORS_LIMIT:%', allowed; end if;
  return new;
end $$;

do $$
declare src text; src2 text;
begin
  select pg_get_functiondef(p.oid) into src from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='my_street_state';
  src2 := replace(src, 'greatest(1, ceil(o.street_collectors::numeric / c.collectors_per_supervisor)::int)', 'street_supervisors_allowed(p_org)');
  if src2 = src then raise exception 'my_street_state'; end if; execute src2;

  select pg_get_functiondef(p.oid) into src from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='owner_overview';
  src2 := replace(src, 'greatest(1, ceil(sc::numeric / per)::int)', 'street_supervisors_allowed(p_org)');
  if src2 = src then raise exception 'owner_overview'; end if; execute src2;

  select pg_get_functiondef(p.oid) into src from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='enforce_plan_limits';
  src2 := replace(src, 'if tg_table_name = ''branches'' and l.max_branches is not null and l.used_branches >= l.max_branches then',
                       'if tg_table_name = ''branches'' and l.max_branches is not null and l.used_branches >= l.max_branches and not street_org(new.org_id) then');
  if src2 = src then raise exception 'enforce_plan_limits'; end if; execute src2;
end $$;
