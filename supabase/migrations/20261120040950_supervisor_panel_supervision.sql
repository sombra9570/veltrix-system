alter table collection_routes add column if not exists locked_by uuid;
alter table collection_routes add column if not exists locked_at timestamptz;

create table if not exists route_supervisions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  route_id uuid not null references collection_routes(id),
  supervisor_id uuid not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);
create table if not exists route_supervision_log (
  id bigint generated always as identity primary key,
  supervision_id uuid not null references route_supervisions(id) on delete cascade,
  org_id uuid not null,
  route_id uuid not null,
  supervisor_id uuid not null,
  at timestamptz not null default now(),
  action text not null,
  detail jsonb not null default '{}'::jsonb
);
create index if not exists route_supervisions_route_idx on route_supervisions(route_id, ended_at);
create index if not exists route_supervision_log_sup_idx on route_supervision_log(supervision_id);
alter table route_supervisions enable row level security;
alter table route_supervision_log enable row level security;

create or replace function public.assert_route_open(p_route uuid)
returns void language plpgsql stable security definer set search_path to 'public' as $$
begin
  if p_route is not null and exists (select 1 from collection_routes where id = p_route and locked_by is not null and collector_id = auth.uid()) then
    raise exception 'ROUTE_LOCKED';
  end if;
end $$;

do $$
declare f record; d text; n text;
begin
  for f in select p.oid, p.proname from pg_proc p where p.pronamespace = 'public'::regnamespace
           and p.proname in ('collector_expense', 'collector_visit', 'create_street_loan', 'collector_save_customer', 'close_route', 'register_payment') loop
    d := pg_get_functiondef(f.oid);
    n := regexp_replace(d, E'\nbegin\n', E'\nbegin\n  perform assert_route_open(p_route);\n');
    if n = d then raise exception 'sin cambios en %', f.proname; end if;
    execute n;
  end loop;

  select pg_get_functiondef('public.collector_day()'::regprocedure) into d;
  n := replace(d, '''can_settings'',', '''locked'', (r.locked_by is not null), ''can_settings'',');
  if n = d then raise exception 'collector_day locked sin cambios'; end if;
  execute n;
end $$;

create or replace function public._sup_route(p_route uuid)
returns collection_routes language plpgsql stable security definer set search_path to 'public' as $$
declare r collection_routes%rowtype;
begin
  select * into r from collection_routes where id = p_route and deleted_at is null and is_active;
  if not found or not (r.supervisor_id = auth.uid() or is_org_owner(r.org_id)) then raise exception 'PERM_DENIED'; end if;
  return r;
end $$;

create or replace function public._sup_open(p_route uuid)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare r collection_routes; v uuid;
begin
  r := _sup_route(p_route);
  select id into v from route_supervisions where route_id = p_route and supervisor_id = auth.uid() and ended_at is null order by started_at desc limit 1;
  if v is null then
    insert into route_supervisions (org_id, route_id, supervisor_id) values (r.org_id, r.id, auth.uid()) returning id into v;
    insert into route_supervision_log (supervision_id, org_id, route_id, supervisor_id, action) values (v, r.org_id, r.id, auth.uid(), 'start');
  end if;
  return v;
end $$;

create or replace function public.sup_log(p_route uuid, p_action text, p_detail jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path to 'public' as $$
declare r collection_routes; v uuid;
begin
  r := _sup_route(p_route);
  if p_action not in ('liquidate', 'verify_customer', 'verify_credit', 'rate_customer', 'rate_collector', 'note', 'invest', 'other') then raise exception 'Acción inválida'; end if;
  v := _sup_open(p_route);
  insert into route_supervision_log (supervision_id, org_id, route_id, supervisor_id, action, detail)
  values (v, r.org_id, r.id, auth.uid(), p_action, coalesce(p_detail, '{}'::jsonb));
end $$;

create or replace function public.sup_my_routes()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'collector', p.full_name, 'locked', r.locked_by is not null,
      'currency', (select base_currency from companies where id = r.company_id),
      'customers', (select count(*) from customers c where c.route_id = r.id and c.deleted_at is null),
      'balance', route_fund_balance(r.id),
      'supervising', exists (select 1 from route_supervisions s where s.route_id = r.id and s.supervisor_id = auth.uid() and s.ended_at is null))
    order by r.name), '[]'::jsonb)
  from collection_routes r left join profiles p on p.id = r.collector_id
  where r.supervisor_id = auth.uid() and r.is_active and r.deleted_at is null;
$$;

create or replace function public.sup_route_detail(p_route uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare r collection_routes;
begin
  r := _sup_route(p_route);
  return jsonb_build_object(
    'id', r.id, 'name', r.name, 'locked', r.locked_by is not null, 'branch_id', r.branch_id,
    'collector', (select full_name from profiles where id = r.collector_id),
    'currency', (select base_currency from companies where id = r.company_id),
    'balance', route_fund_balance(r.id), 'period', route_period(r.id),
    'portfolio', coalesce((select sum(i.amount - installment_paid(i.id)) from installments i join orders o on o.id = i.order_id
                             join customers c on c.id = o.customer_id
                            where c.route_id = r.id and o.status = 'confirmed' and o.approval_status in ('approved', 'auto_approved')), 0),
    'liquidations', route_liquidations_list(r.id, 5),
    'can_liquidate', has_perm('routes.liquidate', r.branch_id),
    'can_invest', has_perm('routes.invest', r.branch_id),
    'supervising', exists (select 1 from route_supervisions s where s.route_id = r.id and s.supervisor_id = auth.uid() and s.ended_at is null),
    'customers', coalesce((select jsonb_agg(jsonb_build_object(
        'id', c.id, 'name', c.name, 'phone', c.phone, 'address', c.address, 'tax_id', c.tax_id, 'lat', c.gps_lat, 'lng', c.gps_lng,
        'rating', customer_rating(c.id), 'balance', customer_open_balance(c.id), 'overdue', customer_overdue(c.id),
        'credits', customer_credit_cards(c.id)) order by c.name)
      from customers c where c.route_id = r.id and c.deleted_at is null), '[]'::jsonb));
end $$;

create or replace function public.sup_set_lock(p_route uuid, p_lock boolean)
returns void language plpgsql security definer set search_path to 'public' as $$
declare r collection_routes; v uuid;
begin
  r := _sup_route(p_route);
  v := _sup_open(p_route);
  update collection_routes set locked_by = case when p_lock then auth.uid() else null end,
         locked_at = case when p_lock then now() else null end where id = r.id;
  insert into route_supervision_log (supervision_id, org_id, route_id, supervisor_id, action)
  values (v, r.org_id, r.id, auth.uid(), case when p_lock then 'lock' else 'unlock' end);
end $$;

create or replace function public.sup_update_customer(p_route uuid, p_customer uuid, p_phone text, p_lat numeric, p_lng numeric)
returns void language plpgsql security definer set search_path to 'public' as $$
declare r collection_routes; v uuid; c customers%rowtype;
begin
  r := _sup_route(p_route);
  select * into c from customers where id = p_customer and route_id = r.id and deleted_at is null;
  if not found then raise exception 'Cliente inexistente'; end if;
  v := _sup_open(p_route);
  if p_phone is not null and trim(p_phone) <> '' and p_phone is distinct from c.phone then
    update customers set phone = trim(p_phone) where id = c.id;
    insert into route_supervision_log (supervision_id, org_id, route_id, supervisor_id, action, detail)
    values (v, r.org_id, r.id, auth.uid(), 'update_phone', jsonb_build_object('customer', c.name, 'from', c.phone, 'to', trim(p_phone)));
  end if;
  if p_lat is not null and p_lng is not null and p_lat between -90 and 90 and p_lng between -180 and 180 then
    update customers set gps_lat = round(p_lat, 6), gps_lng = round(p_lng, 6) where id = c.id;
    insert into route_supervision_log (supervision_id, org_id, route_id, supervisor_id, action, detail)
    values (v, r.org_id, r.id, auth.uid(), 'update_location', jsonb_build_object('customer', c.name));
  end if;
end $$;

create or replace function public.sup_finish(p_route uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare r collection_routes; v uuid; s route_supervisions; body text; l record; who text; tz text;
begin
  r := _sup_route(p_route);
  select * into s from route_supervisions where route_id = p_route and supervisor_id = auth.uid() and ended_at is null order by started_at desc limit 1;
  if not found then raise exception 'SUPERVISION_NOT_STARTED'; end if;
  select timezone into tz from branches where id = r.branch_id;
  select full_name into who from profiles where id = auth.uid();
  body := 'Ruta supervisada: ' || r.name || E'\nSupervisor: ' || coalesce(who, '—') || E'\nCobrador: ' || coalesce((select full_name from profiles where id = r.collector_id), '—')
          || E'\nInicio: ' || to_char(s.started_at at time zone coalesce(tz, 'UTC'), 'DD/MM HH24:MI') || '  Fin: ' || to_char(now() at time zone coalesce(tz, 'UTC'), 'DD/MM HH24:MI') || E'\n';
  for l in select * from route_supervision_log where supervision_id = s.id and action <> 'start' order by at loop
    body := body || E'\n' || to_char(l.at at time zone coalesce(tz, 'UTC'), 'HH24:MI') || ' · ' || case l.action
      when 'lock' then 'Bloqueó las acciones del cobrador'
      when 'unlock' then 'Desbloqueó al cobrador'
      when 'update_phone' then 'Actualizó teléfono de ' || coalesce(l.detail->>'customer', '')
      when 'update_location' then 'Actualizó ubicación de ' || coalesce(l.detail->>'customer', '')
      when 'verify_customer' then 'Verificó al cliente ' || coalesce(l.detail->>'customer', '')
      when 'verify_credit' then 'Verificó montos de ' || coalesce(l.detail->>'customer', '')
      when 'rate_customer' then 'Calificó a ' || coalesce(l.detail->>'customer', '') || ' (' || coalesce(l.detail->>'score', '') || '/5)'
      when 'rate_collector' then 'Calificó al cobrador (' || coalesce(l.detail->>'score', '') || '/5)'
      when 'liquidate' then 'Liquidó la ruta ' || coalesce(l.detail->>'text', '')
      when 'invest' then 'Inversión ' || coalesce(l.detail->>'text', '')
      when 'note' then 'Nota: ' || coalesce(l.detail->>'text', '')
      else l.action end;
  end loop;
  insert into route_notices (org_id, route_id, kind, body, created_by) values (r.org_id, r.id, 'report', left(body, 2000), auth.uid());
  update route_supervisions set ended_at = now() where id = s.id;
  update collection_routes set locked_by = null, locked_at = null where id = r.id;
end $$;
