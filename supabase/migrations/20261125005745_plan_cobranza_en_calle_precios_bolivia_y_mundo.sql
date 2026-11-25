alter table public.street_plan add column if not exists base_usd numeric(10,2) not null default 12 check (base_usd >= 0);
alter table public.street_plan add column if not exists collector_usd numeric(10,2) not null default 12 check (collector_usd >= 0);
update public.street_plan set base_bs = 140, collector_bs = 140, base_usd = 12, collector_usd = 12, updated_at = now() where id;

create or replace function public.public_street_plan() returns jsonb
language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object('base_bs', base_bs, 'collector_bs', collector_bs, 'base_usd', base_usd, 'collector_usd', collector_usd,
    'collectors_per_supervisor', collectors_per_supervisor,
    'manager_after_collectors', manager_after_collectors, 'manager_free', manager_free)
  from street_plan where id;
$$;

drop function if exists public.admin_save_street_plan(numeric, numeric, int, int, boolean);
create or replace function public.admin_save_street_plan(p_base_bs numeric, p_collector_bs numeric, p_base_usd numeric, p_collector_usd numeric,
  p_collectors_per_supervisor int, p_manager_after_collectors int, p_manager_free boolean) returns void
language plpgsql security definer set search_path to 'public' as $$
begin
  if not is_platform_admin() then raise exception 'Solo el superadmin'; end if;
  if p_base_bs < 0 or p_collector_bs < 0 or p_base_usd < 0 or p_collector_usd < 0
     or p_collectors_per_supervisor not between 1 and 100 or p_manager_after_collectors not between 0 and 1000 then raise exception 'STREET_INVALID'; end if;
  update street_plan set base_bs = round(p_base_bs,2), collector_bs = round(p_collector_bs,2),
    base_usd = round(p_base_usd,2), collector_usd = round(p_collector_usd,2),
    collectors_per_supervisor = p_collectors_per_supervisor, manager_after_collectors = p_manager_after_collectors,
    manager_free = coalesce(p_manager_free,true), updated_at = now() where id;
end $$;
revoke execute on function public.admin_save_street_plan(numeric,numeric,numeric,numeric,int,int,boolean) from public, anon;
grant execute on function public.admin_save_street_plan(numeric,numeric,numeric,numeric,int,int,boolean) to authenticated;

create or replace function public.my_street_state(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
declare o record; c record; used_c int; used_s int; pend record;
begin
  if not exists (select 1 from memberships m where m.org_id = p_org and m.user_id = auth.uid() and m.role = 'owner' and m.is_active and m.deleted_at is null) then
    raise exception 'PERM_DENIED'; end if;
  select street_collectors into o from organizations where id = p_org;
  if o.street_collectors is null then return null; end if;
  select * into c from street_plan where id;
  select count(*) filter (where role = 'collector'), count(*) filter (where role = 'supervisor') into used_c, used_s
    from memberships where org_id = p_org and is_active and deleted_at is null;
  select extra into pend from street_requests where org_id = p_org and status = 'pending';
  return jsonb_build_object('contracted', o.street_collectors, 'collectors_used', used_c,
    'supervisors_allowed', o.street_collectors / c.collectors_per_supervisor, 'supervisors_used', used_s,
    'price_bs', c.base_bs + c.collector_bs * (o.street_collectors - 1), 'collector_bs', c.collector_bs,
    'price_usd', c.base_usd + c.collector_usd * (o.street_collectors - 1), 'collector_usd', c.collector_usd,
    'pending_extra', pend.extra);
end $$;
