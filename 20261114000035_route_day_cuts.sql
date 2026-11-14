-- =====================================================================
-- Veltrix · Corte diario de la ruta
--   El corte del día solo cierra lo cobrado y lo prestado para empezar un nuevo día de trabajo;
--   no mueve dinero. La caja se cuadra recién en el cierre de caja (liquidación).
--   Administrador, supervisor y cobrador ven lo cobrado y prestado por día y acumulado
--   desde la última liquidación.
-- =====================================================================
create table if not exists route_day_cuts (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null,
  branch_id         uuid not null,
  route_id          uuid not null references collection_routes(id),
  day               date not null,
  collected_cash    numeric(14,2) not null default 0,
  collected_digital numeric(14,2) not null default 0,
  lent              numeric(14,2) not null default 0,
  expenses          numeric(14,2) not null default 0,
  payments_n        int not null default 0,
  cut_by            uuid default auth.uid(),
  cut_at            timestamptz not null default now(),
  unique (route_id, day)
);
alter table route_day_cuts enable row level security;

-- Por día, desde la última liquidación (incluye hoy aunque no haya movimientos)
create or replace function route_days(p_route uuid, p_limit int default 14) returns jsonb
language sql stable security definer set search_path = public as $$
  with rt as (select r.id, r.branch_id, b.timezone as tz from collection_routes r join branches b on b.id = r.branch_id where r.id = p_route),
  p as (select (pm.collected_at at time zone rt.tz)::date as d,
               coalesce(sum(pm.amount) filter (where pm.method = 'cash'), 0) as cash,
               coalesce(sum(pm.amount) filter (where pm.method <> 'cash'), 0) as dig,
               count(*) as n
          from payments pm, rt where pm.route_id = p_route and pm.settlement_id is null group by 1),
  m as (select (cm.created_at at time zone rt.tz)::date as d,
               coalesce(sum(case cm.type when 'loan_disbursement' then cm.amount when 'loan_return' then -cm.amount else 0 end), 0) as lent,
               coalesce(sum(cm.amount) filter (where cm.type = 'expense'), 0) as exp
          from cash_movements cm, rt where cm.route_id = p_route and cm.settlement_id is null group by 1),
  days as (select d from p union select d from m union select branch_today(rt.branch_id) from rt)
  select coalesce(jsonb_agg(x order by x->>'day' desc), '[]'::jsonb) from (
    select jsonb_build_object('day', days.d, 'cash', coalesce(p.cash, 0), 'digital', coalesce(p.dig, 0), 'payments', coalesce(p.n, 0),
                              'lent', coalesce(m.lent, 0), 'expenses', coalesce(m.exp, 0),
                              'cut_at', (select c.cut_at from route_day_cuts c where c.route_id = p_route and c.day = days.d)) as x
      from days left join p on p.d = days.d left join m on m.d = days.d
     order by days.d desc limit least(greatest(p_limit, 1), 62)) t;
$$;

-- Corte del día: foto de lo cobrado y prestado hoy (se puede repetir: actualiza la foto)
create or replace function route_day_cut(p_route uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r collection_routes%rowtype; v_today date; d jsonb;
begin
  select * into r from collection_routes where id = p_route and deleted_at is null;
  if not found or not (r.collector_id = auth.uid() or is_org_owner(r.org_id) or is_branch_manager(r.branch_id)) then
    raise exception 'Esta ruta no está asignada a usted';
  end if;
  v_today := branch_today(r.branch_id);
  select x into d from jsonb_array_elements(route_days(p_route, 62)) x where (x->>'day')::date = v_today;
  insert into route_day_cuts (org_id, branch_id, route_id, day, collected_cash, collected_digital, lent, expenses, payments_n)
  values (r.org_id, r.branch_id, r.id, v_today, coalesce((d->>'cash')::numeric, 0), coalesce((d->>'digital')::numeric, 0),
          coalesce((d->>'lent')::numeric, 0), coalesce((d->>'expenses')::numeric, 0), coalesce((d->>'payments')::int, 0))
  on conflict (route_id, day) do update
    set collected_cash = excluded.collected_cash, collected_digital = excluded.collected_digital, lent = excluded.lent,
        expenses = excluded.expenses, payments_n = excluded.payments_n, cut_by = auth.uid(), cut_at = now();
  return jsonb_build_object('day', v_today, 'cash', coalesce((d->>'cash')::numeric, 0), 'lent', coalesce((d->>'lent')::numeric, 0));
end $$;

do $$
declare d text;
begin
  d := pg_get_functiondef('collector_day()'::regprocedure);
  if position('route_days' in d) = 0 then
    d := replace(d, '''period'', route_period(r.id),', '''period'', route_period(r.id), ''days'', route_days(r.id, 14),');
    if position('route_days' in d) = 0 then raise exception 'collector_day: no se pudo aplicar'; end if;
    execute d;
  end if;
  d := pg_get_functiondef('route_funds_admin(uuid)'::regprocedure);
  if position('route_days' in d) = 0 then
    d := replace(d, '''period'', route_period(r.id),', '''period'', route_period(r.id), ''days'', route_days(r.id, 14),');
    if position('route_days' in d) = 0 then raise exception 'route_funds_admin: no se pudo aplicar'; end if;
    execute d;
  end if;
end $$;

revoke execute on function route_days(uuid, int) from public, anon, authenticated;
revoke execute on function route_day_cut(uuid) from public, anon;
grant execute on function route_day_cut(uuid) to authenticated;
