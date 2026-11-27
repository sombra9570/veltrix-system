-- 1) Permisos delegables del gerente (apagados por defecto) y calificación mensual del cobrador por criterios.

-- Catálogo, ofrecidos y valores por defecto
do $$
declare src text; src2 text;
begin
  select pg_get_functiondef(p.oid) into src from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='perm_catalog';
  src2 := replace(src, '''collector.delete_expenses'']', '''collector.delete_expenses'', ''perms.manage'', ''routes.assign'', ''reports.supervisors'', ''collectors.rate'']');
  if src2 = src then raise exception 'perm_catalog'; end if;
  execute src2;

  select pg_get_functiondef(p.oid) into src from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='role_offered_keys_base';
  src2 := replace(src, '''collector.delete_expenses'']
    when ''manager''', '''collector.delete_expenses'',''collectors.rate'']
    when ''manager''');
  src2 := replace(src2, '''routes.approve_loans'']
    when ''cashier''', '''routes.approve_loans'',''loans.customers'',''payments.record_installment'',''payments.record_partial'',''collector.expenses'',''collector.pay_out'',''collector.delete_installments'',''collector.delete_credits'',''collector.delete_customers'',''collector.delete_expenses'',''perms.manage'',''routes.assign'',''reports.supervisors'']
    when ''cashier''');
  if src2 = src then raise exception 'role_offered_keys_base'; end if;
  execute src2;

  select pg_get_functiondef(p.oid) into src from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='perm_default_base';
  src2 := replace(src, 'select case when p_key = ''cash.see_expected'' then p_role = ''supervisor''',
    'select case when p_key in (''perms.manage'', ''routes.assign'', ''reports.supervisors'') then false
              when p_key = ''collectors.rate'' then p_role = ''supervisor''
              when p_key = ''cash.see_expected'' then p_role = ''supervisor''');
  if src2 = src then raise exception 'perm_default_base'; end if;
  execute src2;
end $$;

-- Ayudantes
create or replace function public.street_org(p_org uuid) returns boolean
language sql stable security definer set search_path to 'public' as
$$ select exists (select 1 from organizations where id = p_org and street_collectors is not null); $$;

-- El administrador siempre puede; el gerente solo si el administrador le activó ese permiso
create or replace function public.org_delegate_can(p_org uuid, p_key text) returns boolean
language sql stable security definer set search_path to 'public' as
$$ select is_org_owner(p_org) or exists (
     select 1 from memberships m join organizations o on o.id = m.org_id
      where m.org_id = p_org and m.user_id = auth.uid() and m.role = 'manager' and m.is_active and m.deleted_at is null
        and coalesce((m.permissions->>p_key)::boolean, (o.role_permissions->'manager'->>p_key)::boolean, false)); $$;

-- Cambiar permisos: el gerente solo los de cobradores y supervisores, nunca los suyos ni los del administrador
do $$
declare src text; src2 text;
begin
  select pg_get_functiondef(p.oid) into src from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='set_role_permission';
  src2 := replace(src, 'if not is_org_owner(p_org) then raise exception ''Solo el administrador cambia los permisos''; end if;',
    'if not (is_org_owner(p_org) or (org_delegate_can(p_org, ''perms.manage'') and p_role in (''collector'', ''supervisor''))) then raise exception ''Solo el administrador cambia los permisos''; end if;');
  if src2 = src then raise exception 'set_role_permission'; end if; execute src2;

  select pg_get_functiondef(p.oid) into src from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='set_user_permission';
  src2 := replace(src, 'if not found or not is_org_owner(m.org_id) then raise exception ''Solo el administrador cambia los permisos''; end if;',
    'if not found or not (is_org_owner(m.org_id) or (m.role in (''collector'', ''supervisor'') and org_delegate_can(m.org_id, ''perms.manage''))) then raise exception ''Solo el administrador cambia los permisos''; end if;');
  if src2 = src then raise exception 'set_user_permission'; end if; execute src2;

  select pg_get_functiondef(p.oid) into src from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='supervisor_set_permission';
  src2 := replace(src, 'if not found or not is_org_owner(m.org_id) then raise exception ''PERM_DENIED''; end if;',
    'if not found or not org_delegate_can(m.org_id, ''perms.manage'') then raise exception ''PERM_DENIED''; end if;');
  if src2 = src then raise exception 'supervisor_set_permission'; end if; execute src2;

  select pg_get_functiondef(p.oid) into src from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='route_set_permissions';
  src2 := replace(src, 'not (is_org_owner(r.org_id) or is_platform_admin())', 'not (org_delegate_can(r.org_id, ''perms.manage'') or is_platform_admin())');
  if src2 = src then raise exception 'route_set_permissions'; end if; execute src2;

  select pg_get_functiondef(p.oid) into src from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='supervisor_set_routes';
  src2 := replace(src, 'not is_org_owner(m.org_id)', 'not org_delegate_can(m.org_id, ''routes.assign'')');
  if src2 = src then raise exception 'supervisor_set_routes'; end if; execute src2;

  select pg_get_functiondef(p.oid) into src from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='save_route';
  src2 := replace(src, 'not is_branch_manager(b.id)', 'not (is_org_owner(b.org_id) or org_delegate_can(b.org_id, ''routes.assign'') or (is_branch_manager(b.id) and not street_org(b.org_id)))');
  if src2 = src then raise exception 'save_route'; end if; execute src2;

  select pg_get_functiondef(p.oid) into src from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='supervisor_reports_admin';
  src2 := replace(src, 'case when is_org_owner(p_org) then', 'case when org_delegate_can(p_org, ''reports.supervisors'') then');
  if src2 = src then raise exception 'supervisor_reports_admin'; end if; execute src2;
end $$;

-- 2) Calificación mensual del cobrador por criterios (1 a 5): la hace el supervisor en ruta, la ve solo el administrador
create table if not exists public.collector_ratings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  route_id uuid not null,
  collector_id uuid not null,
  rated_by uuid not null,
  period date not null,
  overall smallint not null check (overall between 1 and 5),
  punctuality smallint not null check (punctuality between 1 and 5),
  temperament smallint not null check (temperament between 1 and 5),
  efficiency smallint not null check (efficiency between 1 and 5),
  responsibility smallint not null check (responsibility between 1 and 5),
  communication smallint not null check (communication between 1 and 5),
  condition smallint not null check (condition between 1 and 5),
  vehicle_care smallint not null check (vehicle_care between 1 and 5),
  notes text,
  created_at timestamptz not null default now(),
  unique (collector_id, period)
);
alter table public.collector_ratings enable row level security;

create or replace function public.sup_rate_collector(p_route uuid, p_scores jsonb, p_notes text default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare r collection_routes; k text; v int; v_period date;
begin
  r := _sup_route(p_route);
  if r.collector_id is null then raise exception 'ROUTE_NO_COLLECTOR'; end if;
  if not has_perm('collectors.rate', r.branch_id) then raise exception 'PERM_DENIED'; end if;
  if not exists (select 1 from route_supervisions s where s.route_id = r.id and s.supervisor_id = auth.uid() and s.ended_at is null) then
    raise exception 'RATING_NEEDS_SUPERVISION';
  end if;
  foreach k in array array['overall','punctuality','temperament','efficiency','responsibility','communication','condition','vehicle_care'] loop
    v := (p_scores->>k)::int;
    if v is null or v not between 1 and 5 then raise exception 'RATING_INVALID'; end if;
  end loop;
  v_period := date_trunc('month', branch_today(r.branch_id))::date;
  if exists (select 1 from collector_ratings where collector_id = r.collector_id and period = v_period) then
    raise exception 'RATING_ALREADY_THIS_MONTH';
  end if;
  insert into collector_ratings (org_id, route_id, collector_id, rated_by, period, overall, punctuality, temperament, efficiency, responsibility, communication, condition, vehicle_care, notes)
  values (r.org_id, r.id, r.collector_id, auth.uid(), v_period, (p_scores->>'overall')::int, (p_scores->>'punctuality')::int, (p_scores->>'temperament')::int,
          (p_scores->>'efficiency')::int, (p_scores->>'responsibility')::int, (p_scores->>'communication')::int, (p_scores->>'condition')::int,
          (p_scores->>'vehicle_care')::int, nullif(trim(coalesce(p_notes, '')), ''));
  perform sup_log(p_route, 'rate_collector', jsonb_build_object('score', (p_scores->>'overall')::int));
end $$;

create or replace function public.sup_collector_rated(p_route uuid)
returns boolean language plpgsql stable security definer set search_path to 'public' as $$
declare r collection_routes;
begin
  r := _sup_route(p_route);
  return exists (select 1 from collector_ratings where collector_id = r.collector_id and period = date_trunc('month', branch_today(r.branch_id))::date);
end $$;

-- Solo el administrador ve las calificaciones (ni el supervisor ni el gerente)
create or replace function public.owner_collector_ratings(p_org uuid)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select case when is_org_owner(p_org) then coalesce((
    select jsonb_agg(jsonb_build_object('id', x.id, 'period', x.period, 'collector', (select full_name from profiles where id = x.collector_id),
      'rated_by', (select full_name from profiles where id = x.rated_by), 'route', (select name from collection_routes where id = x.route_id),
      'overall', x.overall, 'punctuality', x.punctuality, 'temperament', x.temperament, 'efficiency', x.efficiency, 'responsibility', x.responsibility,
      'communication', x.communication, 'condition', x.condition, 'vehicle_care', x.vehicle_care, 'notes', x.notes) order by x.period desc, x.created_at desc)
    from (select * from collector_ratings where org_id = p_org order by period desc, created_at desc limit 200) x), '[]'::jsonb)
  else '[]'::jsonb end;
$$;

revoke all on function public.sup_rate_collector(uuid, jsonb, text), public.sup_collector_rated(uuid), public.owner_collector_ratings(uuid) from public, anon;
grant execute on function public.sup_rate_collector(uuid, jsonb, text), public.sup_collector_rated(uuid), public.owner_collector_ratings(uuid) to authenticated;
