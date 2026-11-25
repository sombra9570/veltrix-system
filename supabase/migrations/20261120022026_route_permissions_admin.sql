alter table collection_routes add column if not exists permissions jsonb not null default '{}'::jsonb;

do $$
declare d text; n text;
begin
  select pg_get_functiondef('public.has_perm(text,uuid)'::regprocedure) into d;
  n := replace(d, '    else coalesce(
      (select bool_or((m.permissions->>p_key)::boolean) from memberships m',
'    else coalesce(
      (select bool_or((cr.permissions->>p_key)::boolean) from collection_routes cr
        where cr.branch_id = p_branch and cr.deleted_at is null and cr.is_active
          and (cr.collector_id = auth.uid() or cr.supervisor_id = auth.uid()) and cr.permissions ? p_key),
      (select bool_or((m.permissions->>p_key)::boolean) from memberships m');
  if n = d then raise exception 'has_perm sin cambios'; end if;
  execute n;
end $$;

create or replace function public.route_set_permissions(p_route uuid, p_perms jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare r collection_routes%rowtype;
begin
  select * into r from collection_routes where id = p_route and deleted_at is null;
  if not found or not (is_org_owner(r.org_id) or is_platform_admin()) then raise exception 'PERM_DENIED'; end if;
  update collection_routes set permissions = coalesce(p_perms, '{}'::jsonb), updated_at = now() where id = p_route;
  return coalesce(p_perms, '{}'::jsonb);
end $$;

create or replace function public.owner_routes(p_org uuid)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select case when is_org_owner(p_org) or is_platform_admin() then coalesce((
    select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'permissions', r.permissions,
      'collector', p.full_name, 'currency', (select base_currency from companies where id = r.company_id)) order by r.name)
      from collection_routes r left join profiles p on p.id = r.collector_id
     where r.org_id = p_org and r.is_active and r.deleted_at is null), '[]'::jsonb) else '[]'::jsonb end;
$$;

create or replace function public.route_customers_admin(p_route uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare r collection_routes%rowtype;
begin
  select * into r from collection_routes where id = p_route and deleted_at is null;
  if not found or not (is_org_owner(r.org_id) or is_platform_admin()) then raise exception 'PERM_DENIED'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', c.id, 'name', c.name, 'phone', c.phone, 'address', c.address, 'tax_id', c.tax_id,
      'lat', c.gps_lat, 'lng', c.gps_lng, 'rating', customer_rating(c.id),
      'balance', customer_open_balance(c.id), 'overdue', customer_overdue(c.id),
      'credits', customer_credit_cards(c.id)) order by c.name)
    from customers c where c.route_id = r.id and c.deleted_at is null), '[]'::jsonb);
end $$;

create or replace function public.liquidations_admin(p_org uuid)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select case when is_org_owner(p_org) or is_platform_admin() then coalesce((
    select jsonb_agg(jsonb_build_object('id', l.id, 'route', r.name, 'at', l.created_at, 'opening', l.opening,
      'collected', l.collected_cash + l.collected_digital, 'lent', l.lent, 'expenses', l.collector_expenses + l.op_expenses,
      'expected', l.expected, 'counted', l.counted, 'difference', l.difference, 'closing', l.closing,
      'currency', (select base_currency from companies where id = r.company_id)) order by l.created_at desc)
      from (select * from route_liquidations where org_id = p_org order by created_at desc limit 100) l
      join collection_routes r on r.id = l.route_id), '[]'::jsonb) else '[]'::jsonb end;
$$;

create or replace function public.supervisor_report(p_route uuid, p_body text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare r collection_routes%rowtype;
begin
  select * into r from collection_routes where id = p_route and deleted_at is null;
  if not found or not (r.supervisor_id = auth.uid() or is_org_owner(r.org_id) or is_branch_manager(r.branch_id)) then raise exception 'PERM_DENIED'; end if;
  if coalesce(trim(p_body), '') = '' then raise exception 'NOTICE_INVALID'; end if;
  insert into route_notices (org_id, route_id, kind, body, created_by) values (r.org_id, r.id, 'report', left(trim(p_body), 2000), auth.uid());
end $$;

create or replace function public.supervisor_reports_admin(p_org uuid)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select case when is_org_owner(p_org) or is_platform_admin() then coalesce((
    select jsonb_agg(jsonb_build_object('id', n.id, 'route', r.name, 'at', n.created_at, 'body', n.body,
      'author', (select full_name from profiles where id = n.created_by)) order by n.created_at desc)
      from (select * from route_notices where org_id = p_org and kind = 'report' order by created_at desc limit 100) n
      join collection_routes r on r.id = n.route_id), '[]'::jsonb) else '[]'::jsonb end;
$$;

do $$
declare d text; n text; k text;
begin
  select pg_get_functiondef('public.collector_day()'::regprocedure) into d;
  n := d;
  foreach k in array array['loans.create','routes.liquidate','routes.invest','loans.customers','loans.interest','collector.expenses','collector.portfolio','collector.settings'] loop
    n := replace(n, 'has_perm(''' || k || ''', r.branch_id)', 'coalesce((r.permissions->>''' || k || ''')::boolean, has_perm(''' || k || ''', r.branch_id))');
  end loop;
  n := replace(n, 'n.route_id = r.id and n.read_at is null', 'n.route_id = r.id and n.read_at is null and n.kind <> ''report''');
  if n = d then raise exception 'collector_day sin cambios'; end if;
  execute n;
end $$;

do $$
declare d text; n text;
begin
  select pg_get_functiondef('public.collector_notices(uuid)'::regprocedure) into d;
  n := replace(d, 'where x.route_id = p_route and', 'where x.route_id = p_route and x.kind <> ''report'' and');
  if n = d then raise exception 'collector_notices sin cambios'; end if;
  execute n;
end $$;
