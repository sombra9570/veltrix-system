alter table route_fund_moves drop constraint if exists route_fund_moves_type_check;
alter table route_fund_moves add constraint route_fund_moves_type_check
  check (type in ('investment', 'withdrawal', 'delivery', 'op_expense', 'payment_out', 'shortage', 'surplus'));
alter table route_fund_moves add column if not exists category text;
alter table route_fund_moves add column if not exists liquidation_id uuid;

create or replace function route_fund_balance(p_route uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select round(
      coalesce((select sum(case when type in ('investment', 'surplus') then amount else -amount end)
                  from route_fund_moves where route_id = p_route), 0)
    + coalesce((select sum(amount) from payments where route_id = p_route and method = 'cash'), 0)
    - coalesce((select sum(case when type = 'loan_return' then -amount else amount end) from cash_movements where route_id = p_route), 0), 2);
$$;

create table if not exists route_liquidations (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null,
  branch_id          uuid not null,
  route_id           uuid not null references collection_routes(id),
  collector_id       uuid,
  settlement_id      uuid,
  period_from        timestamptz,
  opening            numeric(14,2) not null default 0,
  investments        numeric(14,2) not null default 0,
  withdrawals_before numeric(14,2) not null default 0,
  collected_cash     numeric(14,2) not null default 0,
  collected_digital  numeric(14,2) not null default 0,
  lent               numeric(14,2) not null default 0,
  collector_expenses numeric(14,2) not null default 0,
  expected           numeric(14,2) not null default 0,
  counted            numeric(14,2) not null default 0,
  difference         numeric(14,2) not null default 0,
  op_expenses        numeric(14,2) not null default 0,
  payments_out       numeric(14,2) not null default 0,
  withdrawals        numeric(14,2) not null default 0,
  closing            numeric(14,2) not null default 0,
  lines              jsonb not null default '[]'::jsonb,
  notes              text,
  created_by         uuid default auth.uid(),
  created_at         timestamptz not null default now()
);
alter table route_liquidations enable row level security;
create index if not exists route_liquidations_route_idx on route_liquidations (route_id, created_at desc);

create or replace function route_period(p_route uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  with last as (select created_at, closing from route_liquidations where route_id = p_route order by created_at desc limit 1),
  since as (select coalesce((select created_at from last), '-infinity'::timestamptz) as t)
  select jsonb_build_object(
    'since', (select created_at from last),
    'opening', coalesce((select closing from last), 0),
    'investments', coalesce((select sum(amount) from route_fund_moves, since where route_id = p_route and type = 'investment' and created_at > since.t), 0),
    'withdrawals', coalesce((select sum(amount) from route_fund_moves, since where route_id = p_route
                              and type in ('withdrawal', 'delivery') and liquidation_id is null and created_at > since.t), 0),
    'collected_cash', coalesce((select sum(amount) from payments where route_id = p_route and method = 'cash' and settlement_id is null), 0),
    'collected_digital', coalesce((select sum(amount) from payments where route_id = p_route and method <> 'cash' and settlement_id is null), 0),
    'lent', coalesce((select sum(case when type = 'loan_return' then -amount else amount end) from cash_movements
                       where route_id = p_route and type in ('loan_disbursement', 'loan_return') and settlement_id is null), 0),
    'collector_expenses', coalesce((select sum(amount) from cash_movements where route_id = p_route and type = 'expense' and settlement_id is null), 0),
    'payments_n', (select count(*) from payments where route_id = p_route and settlement_id is null),
    'expected', route_fund_balance(p_route));
$$;

create or replace function liquidate_route(p_route uuid, p_counted numeric, p_lines jsonb default '[]'::jsonb, p_notes text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare r collection_routes%rowtype; per jsonb; v_exp numeric; v_diff numeric; v_out numeric := 0; v_liq uuid; v_set uuid;
        ln jsonb; v_kind text; v_amt numeric; v_opx numeric := 0; v_pay numeric := 0; v_wd numeric := 0; v_cur char(3); v_close numeric;
begin
  select * into r from collection_routes where id = p_route and deleted_at is null;
  if not found or not (is_org_owner(r.org_id) or is_branch_manager(r.branch_id)) then raise exception 'Sin permiso'; end if;
  if not org_writable(r.org_id) then raise exception 'Cuenta suspendida: solo lectura'; end if;
  if p_counted is null or p_counted < 0 then raise exception 'LIQ_COUNTED_INVALID'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then p_lines := '[]'::jsonb; end if;

  for ln in select * from jsonb_array_elements(p_lines) loop
    v_kind := ln->>'kind'; v_amt := round((ln->>'amount')::numeric, 2);
    if v_kind not in ('op_expense', 'payment_out', 'withdrawal') or v_amt is null or v_amt <= 0 then raise exception 'LIQ_LINE_INVALID'; end if;
    v_out := v_out + v_amt;
  end loop;
  if v_out > round(p_counted, 2) + 0.004 then raise exception 'LIQ_OUT_EXCEEDS'; end if;

  per := route_period(p_route);
  v_exp := (per->>'expected')::numeric;
  v_diff := round(p_counted - v_exp, 2);
  select base_currency into v_cur from companies where id = r.company_id;

  insert into route_liquidations (org_id, branch_id, route_id, collector_id, period_from, opening, investments, withdrawals_before,
                                  collected_cash, collected_digital, lent, collector_expenses, expected, counted, difference, lines, notes)
  values (r.org_id, r.branch_id, r.id, r.collector_id, (per->>'since')::timestamptz, (per->>'opening')::numeric, (per->>'investments')::numeric,
          (per->>'withdrawals')::numeric, (per->>'collected_cash')::numeric, (per->>'collected_digital')::numeric, (per->>'lent')::numeric,
          (per->>'collector_expenses')::numeric, v_exp, round(p_counted, 2), v_diff, p_lines, nullif(trim(coalesce(p_notes, '')), ''))
  returning id into v_liq;

  if v_diff < 0 then
    insert into route_fund_moves (org_id, branch_id, route_id, type, amount, category, note, liquidation_id)
    values (r.org_id, r.branch_id, r.id, 'shortage', -v_diff, 'shortage', 'Faltante en el corte', v_liq);
  elsif v_diff > 0 then
    insert into route_fund_moves (org_id, branch_id, route_id, type, amount, category, note, liquidation_id)
    values (r.org_id, r.branch_id, r.id, 'surplus', v_diff, 'surplus', 'Sobrante en el corte', v_liq);
  end if;

  for ln in select * from jsonb_array_elements(p_lines) loop
    v_kind := ln->>'kind'; v_amt := round((ln->>'amount')::numeric, 2);
    insert into route_fund_moves (org_id, branch_id, route_id, type, amount, category, note, liquidation_id)
    values (r.org_id, r.branch_id, r.id, v_kind, v_amt, nullif(ln->>'category', ''), nullif(trim(coalesce(ln->>'note', '')), ''), v_liq);
    if v_kind = 'op_expense' then v_opx := v_opx + v_amt; elsif v_kind = 'payment_out' then v_pay := v_pay + v_amt; else v_wd := v_wd + v_amt; end if;
  end loop;

  insert into route_settlements (branch_id, route_id, collector_id, supervisor_id, currency, status, audited_by, audited_at,
                                 total_cash_collected, total_digital_collected, total_expenses, expected_cash_delivery,
                                 declared_cash_delivered, difference, audit_notes)
  values (r.branch_id, r.id, coalesce(r.collector_id, auth.uid()), r.supervisor_id, v_cur, 'audited', auth.uid(), now(),
          (per->>'collected_cash')::numeric, (per->>'collected_digital')::numeric,
          (per->>'collector_expenses')::numeric + (per->>'lent')::numeric, v_wd, v_wd, v_diff, 'Corte de caja')
  returning id into v_set;
  update payments set settlement_id = v_set where route_id = p_route and settlement_id is null;
  update cash_movements set settlement_id = v_set where route_id = p_route and settlement_id is null;

  v_close := route_fund_balance(p_route);
  update route_liquidations set settlement_id = v_set, op_expenses = v_opx, payments_out = v_pay, withdrawals = v_wd, closing = v_close
   where id = v_liq;
  insert into audit_log (org_id, branch_id, table_name, row_id, action, actor_id, new_data)
  values (r.org_id, r.branch_id, 'route_liquidations', v_liq, 'route_liquidation', auth.uid(),
          jsonb_build_object('expected', v_exp, 'counted', p_counted, 'difference', v_diff, 'closing', v_close));
  return jsonb_build_object('id', v_liq, 'expected', v_exp, 'counted', p_counted, 'difference', v_diff, 'closing', v_close);
end $$;

create or replace function route_liquidations_list(p_route uuid, p_limit int default 10) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(l) - 'org_id' - 'branch_id' order by l.created_at desc), '[]'::jsonb)
    from (select * from route_liquidations where route_id = p_route order by created_at desc limit least(greatest(p_limit, 1), 50)) l
    join collection_routes r on r.id = l.route_id
   where r.collector_id = auth.uid() or is_org_owner(r.org_id) or is_branch_manager(r.branch_id);
$$;

do $$
declare d text;
begin
  d := pg_get_functiondef('collector_day()'::regprocedure);
  if position('route_period' in d) = 0 then
    d := replace(d, '''fund_balance'', route_fund_balance(r.id),',
      '''fund_balance'', route_fund_balance(r.id),
        ''period'', route_period(r.id),
        ''liquidations'', route_liquidations_list(r.id, 3),');
    if position('route_period' in d) = 0 then raise exception 'collector_day: no se pudo aplicar'; end if;
    execute d;
  end if;

  d := pg_get_functiondef('route_funds_admin(uuid)'::regprocedure);
  if position('route_period' in d) = 0 then
    d := replace(d, '''balance'', route_fund_balance(r.id),', '''balance'', route_fund_balance(r.id), ''period'', route_period(r.id),
      ''liquidations'', route_liquidations_list(r.id, 5),');
    if position('route_period' in d) = 0 then raise exception 'route_funds_admin: no se pudo aplicar'; end if;
    execute d;
  end if;
end $$;

revoke execute on function route_period(uuid) from public, anon, authenticated;
revoke execute on function liquidate_route(uuid, numeric, jsonb, text), route_liquidations_list(uuid, int) from public, anon;
grant execute on function liquidate_route(uuid, numeric, jsonb, text), route_liquidations_list(uuid, int) to authenticated;
