create table if not exists route_fund_moves (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  branch_id     uuid not null,
  route_id      uuid not null references collection_routes(id),
  type          text not null check (type in ('investment', 'withdrawal', 'delivery')),
  amount        numeric(14,2) not null check (amount > 0),
  note          text,
  settlement_id uuid,
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now()
);
alter table route_fund_moves enable row level security;
create index if not exists route_fund_moves_route_idx on route_fund_moves (route_id, created_at);

create or replace function route_fund_balance(p_route uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select round(
      coalesce((select sum(case when type = 'investment' then amount else -amount end) from route_fund_moves where route_id = p_route), 0)
    + coalesce((select sum(amount) from payments where route_id = p_route and method = 'cash'), 0)
    - coalesce((select sum(case when type = 'loan_return' then -amount else amount end) from cash_movements where route_id = p_route), 0), 2);
$$;

create or replace function loan_policy(p_org uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
      'interest_default', 20, 'interest_min', 10, 'interest_max', 30,
      'max_amount_customer', 0, 'max_active_loans_customer', 2, 'max_installments', 60,
      'max_customers_collector', 0, 'max_daily_lent_collector', 0,
      'late_daily', 10, 'late_weekly', 2, 'late_biweekly', 1, 'late_monthly', 1,
      'route_float', 0)
    || coalesce((select loan_policy from organizations where id = p_org), '{}'::jsonb);
$$;

do $$
declare d text;
begin
  d := pg_get_functiondef('set_loan_policy(uuid, jsonb)'::regprocedure);
  if position('route_float' in d) = 0 then
    d := replace(d, '''late_daily'',''late_weekly'',''late_biweekly'',''late_monthly''',
                    '''late_daily'',''late_weekly'',''late_biweekly'',''late_monthly'',''route_float''');
    if position('route_float' in d) = 0 then raise exception 'set_loan_policy: no se pudo aplicar'; end if;
    execute d;
  end if;

  d := pg_get_functiondef('create_street_loan(uuid, uuid, numeric, numeric, integer, integer, date, text)'::regprocedure);
  if position('route_fund_balance' in d) = 0 then
    d := replace(d, '  select base_currency into v_cur from companies where id = r.company_id;',
      '  if p_principal > route_fund_balance(r.id) then v_reasons := array_append(v_reasons, ''funds''); end if;
  select base_currency into v_cur from companies where id = r.company_id;');
    if position('route_fund_balance' in d) = 0 then raise exception 'create_street_loan: no se pudo aplicar'; end if;
    execute d;
  end if;

  d := pg_get_functiondef('collector_day()'::regprocedure);
  if position('fund_balance' in d) = 0 then
    d := replace(d, '''policy'', loan_policy(r.org_id),',
      '''policy'', loan_policy(r.org_id),
        ''fund_balance'', route_fund_balance(r.id),
        ''fund_float'', (loan_policy(r.org_id)->>''route_float'')::numeric,');
    if position('fund_balance' in d) = 0 then raise exception 'collector_day: no se pudo aplicar'; end if;
    execute d;
  end if;
end $$;

drop function if exists close_route(uuid);
create or replace function close_route(p_route uuid, p_deliver numeric default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare r collection_routes%rowtype; v_id uuid; v_cash numeric; v_dig numeric; v_exp numeric; v_cur char(3);
        v_bal numeric; v_float numeric; v_del numeric;
begin
  select * into r from collection_routes where id = p_route;
  if not found or r.collector_id <> auth.uid() then raise exception 'Esta ruta no está asignada a usted'; end if;
  if (select count(distinct currency) from payments
       where route_id = p_route and settlement_id is null and collected_by = auth.uid()) > 1 then
    raise exception 'Hay cobros en más de una moneda en esta ruta';
  end if;
  select base_currency into v_cur from companies where id = r.company_id;

  v_bal := route_fund_balance(p_route);
  v_float := coalesce((loan_policy(r.org_id)->>'route_float')::numeric, 0);
  v_del := round(coalesce(p_deliver, greatest(0, v_bal - v_float)), 2);
  if v_del < 0 or v_del > greatest(v_bal, 0) + 0.004 then raise exception 'ROUTE_DELIVER_INVALID'; end if;

  insert into route_settlements (branch_id, route_id, collector_id, supervisor_id, currency)
  values (r.branch_id, r.id, auth.uid(), r.supervisor_id, v_cur) returning id into v_id;

  update payments set settlement_id = v_id
   where route_id = p_route and settlement_id is null and collected_by = auth.uid();
  update cash_movements set settlement_id = v_id
   where route_id = p_route and settlement_id is null and created_by = auth.uid();

  select coalesce(sum(amount) filter (where method = 'cash'), 0), coalesce(sum(amount) filter (where method <> 'cash'), 0)
    into v_cash, v_dig from payments where settlement_id = v_id;
  select coalesce(sum(case when type = 'loan_return' then -amount else amount end), 0) into v_exp
    from cash_movements where settlement_id = v_id;

  if v_cash = 0 and v_dig = 0 and v_exp = 0 and v_del = 0 then raise exception 'No hay nada que rendir'; end if;

  update route_settlements
     set total_cash_collected = v_cash, total_digital_collected = v_dig,
         total_expenses = v_exp, expected_cash_delivery = v_del
   where id = v_id;
  if v_del > 0 then
    insert into route_fund_moves (org_id, branch_id, route_id, type, amount, note, settlement_id)
    values (r.org_id, r.branch_id, r.id, 'delivery', v_del, 'Entrega al cerrar el día', v_id);
  end if;
  return v_id;
end $$;
revoke execute on function close_route(uuid, numeric) from public, anon;
grant execute on function close_route(uuid, numeric) to authenticated;

create or replace function route_fund_move(p_route uuid, p_type text, p_amount numeric, p_note text default null) returns numeric
language plpgsql security definer set search_path = public as $$
declare r collection_routes%rowtype;
begin
  select * into r from collection_routes where id = p_route and deleted_at is null;
  if not found or not (is_org_owner(r.org_id) or is_branch_manager(r.branch_id)) then raise exception 'Sin permiso'; end if;
  if not org_writable(r.org_id) then raise exception 'Cuenta suspendida: solo lectura'; end if;
  if p_type not in ('investment', 'withdrawal') then raise exception 'Movimiento inválido'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Monto inválido'; end if;
  if p_type = 'withdrawal' and p_amount > route_fund_balance(p_route) + 0.004 then raise exception 'ROUTE_FUND_LOW'; end if;
  insert into route_fund_moves (org_id, branch_id, route_id, type, amount, note)
  values (r.org_id, r.branch_id, r.id, p_type, round(p_amount, 2), nullif(trim(coalesce(p_note, '')), ''));
  insert into audit_log (org_id, branch_id, table_name, row_id, action, actor_id, new_data)
  values (r.org_id, r.branch_id, 'route_fund_moves', r.id, 'route_fund_' || p_type, auth.uid(),
          jsonb_build_object('amount', p_amount, 'note', p_note));
  return route_fund_balance(p_route);
end $$;

create or replace function route_funds_admin(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not (is_org_owner(p_org) or is_platform_admin()) then raise exception 'Sin permiso'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', r.id, 'name', r.name, 'branch', b.name, 'collector', p.full_name,
      'currency', (select base_currency from companies where id = r.company_id),
      'balance', route_fund_balance(r.id),
      'invested', coalesce((select sum(case when m.type = 'investment' then m.amount when m.type = 'withdrawal' then -m.amount else 0 end)
                              from route_fund_moves m where m.route_id = r.id), 0),
      'delivered', coalesce((select sum(m.amount) from route_fund_moves m where m.route_id = r.id and m.type = 'delivery'), 0),
      'lent_open', coalesce((select sum(l.principal) from loans l join orders o on o.id = l.order_id
                              where l.route_id = r.id and o.status = 'confirmed' and o.approval_status in ('approved', 'auto_approved')
                                and exists (select 1 from installments i where i.order_id = o.id and i.amount - installment_paid(i.id) > 0)), 0),
      'portfolio', coalesce((select sum(i.amount - installment_paid(i.id)) from installments i join orders o on o.id = i.order_id
                              join customers c on c.id = o.customer_id
                              where c.route_id = r.id and o.status = 'confirmed' and o.approval_status in ('approved', 'auto_approved')), 0),
      'moves', coalesce((select jsonb_agg(jsonb_build_object('at', m.created_at, 'type', m.type, 'amount', m.amount, 'note', m.note)
                                          order by m.created_at desc)
                           from (select * from route_fund_moves where route_id = r.id order by created_at desc limit 8) m), '[]'::jsonb)
    ) order by b.name, r.name)
    from collection_routes r join branches b on b.id = r.branch_id left join profiles p on p.id = r.collector_id
   where r.org_id = p_org and r.deleted_at is null), '[]'::jsonb);
end $$;

revoke execute on function route_fund_balance(uuid) from public, anon, authenticated;
revoke execute on function route_fund_move(uuid, text, numeric, text), route_funds_admin(uuid) from public, anon;
grant execute on function route_fund_move(uuid, text, numeric, text), route_funds_admin(uuid) to authenticated;
