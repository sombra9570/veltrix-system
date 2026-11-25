create table if not exists public.street_plan (
  id boolean primary key default true check (id),
  base_bs numeric(10,2) not null default 130 check (base_bs >= 0),
  collector_bs numeric(10,2) not null default 130 check (collector_bs >= 0),
  collectors_per_supervisor int not null default 3 check (collectors_per_supervisor between 1 and 100),
  manager_after_collectors int not null default 5 check (manager_after_collectors between 0 and 1000),
  manager_free boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.street_plan(id) values (true) on conflict do nothing;
alter table public.street_plan enable row level security;
revoke all on public.street_plan from anon, authenticated;

create or replace function public.public_street_plan() returns jsonb
language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object('base_bs', base_bs, 'collector_bs', collector_bs,
    'collectors_per_supervisor', collectors_per_supervisor,
    'manager_after_collectors', manager_after_collectors, 'manager_free', manager_free)
  from street_plan where id;
$$;
grant execute on function public.public_street_plan() to anon, authenticated;

create or replace function public.admin_save_street_plan(p_base_bs numeric, p_collector_bs numeric,
  p_collectors_per_supervisor int, p_manager_after_collectors int, p_manager_free boolean) returns void
language plpgsql security definer set search_path to 'public' as $$
begin
  if not is_platform_admin() then raise exception 'Solo el superadmin'; end if;
  if p_base_bs < 0 or p_collector_bs < 0 or p_collectors_per_supervisor not between 1 and 100
     or p_manager_after_collectors not between 0 and 1000 then raise exception 'STREET_INVALID'; end if;
  update street_plan set base_bs = round(p_base_bs,2), collector_bs = round(p_collector_bs,2),
    collectors_per_supervisor = p_collectors_per_supervisor, manager_after_collectors = p_manager_after_collectors,
    manager_free = coalesce(p_manager_free,true), updated_at = now() where id;
end $$;
revoke execute on function public.admin_save_street_plan(numeric,numeric,int,int,boolean) from public, anon;
grant execute on function public.admin_save_street_plan(numeric,numeric,int,int,boolean) to authenticated;
