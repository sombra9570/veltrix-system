-- =====================================================================
-- Veltrix · Préstamos en calle
--   El cobrador crea clientes y préstamos en su ruta; el administrador fija las reglas
--   (interés, montos, cuotas, topes) y los permisos. Lo que pasa las reglas queda pendiente
--   de aprobación. El dinero prestado sale de lo que el cobrador lleva y se descuenta al rendir.
--   Interés: % fijo sobre el capital, repartido en las cuotas.
--   (requiere los valores de enum 'loan', 'loan_disbursement' y 'loan_return', creados antes)
-- =====================================================================

-- ---------- Reglas del administrador ----------
alter table organizations add column if not exists loan_policy jsonb not null default '{}'::jsonb;

create or replace function loan_policy(p_org uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
      'interest_default', 20, 'interest_min', 10, 'interest_max', 30,
      'max_amount_customer', 0, 'max_active_loans_customer', 2, 'max_installments', 60,
      'max_customers_collector', 0, 'max_daily_lent_collector', 0,
      'late_daily', 10, 'late_weekly', 2, 'late_biweekly', 1, 'late_monthly', 1)
    || coalesce((select loan_policy from organizations where id = p_org), '{}'::jsonb);
$$;

create or replace function set_loan_policy(p_org uuid, p_policy jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare k text; v numeric; clean jsonb := '{}'::jsonb;
begin
  if not is_org_owner(p_org) then raise exception 'Solo el administrador cambia las reglas de préstamos'; end if;
  foreach k in array array['interest_default','interest_min','interest_max','max_amount_customer','max_active_loans_customer',
                           'max_installments','max_customers_collector','max_daily_lent_collector',
                           'late_daily','late_weekly','late_biweekly','late_monthly'] loop
    if p_policy ? k then
      v := (p_policy->>k)::numeric;
      if v is null or v < 0 or v > 100000000 then raise exception 'LOAN_POLICY_INVALID'; end if;
      clean := clean || jsonb_build_object(k, v);
    end if;
  end loop;
  clean := (loan_policy(p_org) || clean);
  if (clean->>'interest_min')::numeric > (clean->>'interest_default')::numeric
     or (clean->>'interest_default')::numeric > (clean->>'interest_max')::numeric
     or (clean->>'interest_max')::numeric > 500
     or (clean->>'max_installments')::numeric not between 1 and 120 then
    raise exception 'LOAN_POLICY_INVALID';
  end if;
  perform set_config('veltrix.billing', 'on', true);
  update organizations set loan_policy = clean where id = p_org;
  perform set_config('veltrix.billing', 'off', true);
  return clean;
end $$;

-- ---------- Permisos nuevos ----------
create or replace function perm_catalog() returns text[]
language sql immutable as $$
  select array['cash.see_expected', 'cash.movements', 'sales.credit', 'customers.edit',
               'customers.view_docs', 'collector.expenses',
               'loans.create', 'loans.customers', 'loans.interest', 'loans.cancel'];
$$;

create or replace function perm_default(p_role text, p_key text) returns boolean
language sql immutable as $$
  select case when p_key = 'cash.see_expected' then false
              when p_key in ('loans.interest', 'loans.cancel') then p_role = 'supervisor'
              else true end;
$$;

-- ---------- Calificación del cliente por su forma de pago ----------
create or replace function customer_rating(p_customer uuid) returns text
language sql stable security definer set search_path = public as $$
  with i as (
    select i.due_date, i.amount, installment_paid(i.id) as paid, branch_today(o.branch_id) as today,
           (select max(p.collected_at)::date from payment_allocations a join payments p on p.id = a.payment_id
             where a.installment_id = i.id and a.amount > 0) as last_pay
      from installments i join orders o on o.id = i.order_id
     where o.customer_id = p_customer and o.status = 'confirmed' and o.payment_condition = 'credit'
       and o.approval_status in ('auto_approved', 'approved')
  ), s as (
    select count(*) filter (where due_date < today) as due_n,
           count(*) filter (where due_date < today and paid >= amount and last_pay <= due_date) as on_time,
           coalesce(max(today - due_date) filter (where due_date < today and paid < amount), 0) as late_days
      from i
  )
  select case when due_n = 0 then 'new'
              when late_days = 0 and on_time::numeric / due_n >= 0.8 then 'green'
              when late_days <= 3 and on_time::numeric / due_n >= 0.5 then 'yellow'
              when late_days <= 15 then 'orange'
              else 'red' end
    from s;
$$;

-- ---------- Préstamos ----------
create table if not exists loans (
  order_id        uuid primary key references orders(id) on delete cascade,
  org_id          uuid not null,
  branch_id       uuid not null,
  customer_id     uuid not null,
  route_id        uuid references collection_routes(id),
  collector_id    uuid,
  principal       numeric(14,2) not null check (principal > 0),
  interest_pct    numeric(6,2) not null check (interest_pct between 0 and 500),
  installments    int not null,
  every_days      int not null,
  first_due       date not null,
  pending_reasons text[] not null default '{}',
  movement_id     uuid,
  disbursed_at    timestamptz,
  cancelled_at    timestamptz,
  created_by      uuid default auth.uid(),
  created_at      timestamptz not null default now()
);
alter table loans enable row level security;
create index if not exists loans_route_idx on loans (route_id, created_at);

-- Movimientos de ruta: gastos, dinero prestado y devoluciones de préstamos anulados
alter table cash_movements drop constraint if exists cash_movements_check1;
alter table cash_movements add constraint cash_movements_check1
  check (route_id is null or type in ('expense', 'loan_disbursement', 'loan_return'));

-- Aprobación del préstamo la define quien lo crea (según las reglas); anular lo permite el permiso
do $$
declare d text;
begin
  d := pg_get_functiondef('order_lifecycle()'::regprocedure);
  if position('veltrix.loan_approval' in d) = 0 then
    d := replace(d, 'if c.credit_status <> ''approved''',
      'if new.order_type = ''loan'' then
        new.approval_status := coalesce(nullif(current_setting(''veltrix.loan_approval'', true), ''''), ''pending_supervisor'')::approval_status;
      elsif c.credit_status <> ''approved''');
    d := replace(d, 'if auth.uid() is not null and not is_branch_manager(old.branch_id) then',
      'if auth.uid() is not null and not is_branch_manager(old.branch_id)
     and current_setting(''veltrix.loan_cancel'', true) is distinct from ''on'' then');
    if position('veltrix.loan_approval' in d) = 0 or position('veltrix.loan_cancel' in d) = 0 then
      raise exception 'order_lifecycle: no se pudo aplicar';
    end if;
    execute d;
  end if;
end $$;

-- Al aprobarse, el préstamo sale de lo que lleva el cobrador
create or replace function loan_disburse() returns trigger
language plpgsql security definer set search_path = public as $$
declare l loans%rowtype; v_id uuid;
begin
  if new.order_type <> 'loan' or new.status <> 'confirmed' or new.approval_status not in ('approved', 'auto_approved') then
    return new;
  end if;
  select * into l from loans where order_id = new.id for update;
  if not found or l.movement_id is not null or l.route_id is null then return new; end if;
  insert into cash_movements (branch_id, type, amount, currency, route_id, description, created_by)
  values (new.branch_id, 'loan_disbursement', l.principal, new.currency, l.route_id,
          'Préstamo · ' || coalesce((select name from customers where id = new.customer_id), ''), l.collector_id)
  returning id into v_id;
  update loans set movement_id = v_id, disbursed_at = now() where order_id = new.id;
  return new;
end $$;
drop trigger if exists orders_loan_disburse on orders;
create trigger orders_loan_disburse after update on orders for each row execute function loan_disburse();

create or replace function create_street_loan(p_route uuid, p_customer uuid, p_principal numeric, p_interest numeric,
                                              p_count int, p_every_days int, p_first_due date, p_notes text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare r collection_routes%rowtype; c customers%rowtype; pol jsonb; v_int numeric; v_total numeric; v_cur char(3);
        v_order uuid; v_reasons text[] := '{}'; v_status approval_status; v_today date;
begin
  select * into r from collection_routes where id = p_route and deleted_at is null and is_active;
  if not found or not (r.collector_id = auth.uid() or is_branch_manager(r.branch_id) or is_org_owner(r.org_id)) then
    raise exception 'Esta ruta no está asignada a usted';
  end if;
  if not has_perm('loans.create', r.branch_id) then raise exception 'LOAN_NO_PERMISSION'; end if;
  if not org_writable(r.org_id) then raise exception 'Cuenta suspendida: solo lectura'; end if;
  select * into c from customers where id = p_customer and branch_id = r.branch_id and deleted_at is null and not is_walk_in;
  if not found then raise exception 'Elija un cliente registrado'; end if;
  if c.route_id is distinct from r.id then
    if c.route_id is null then update customers set route_id = r.id where id = c.id;
    else raise exception 'LOAN_OTHER_ROUTE'; end if;
  end if;

  pol := loan_policy(r.org_id);
  v_today := branch_today(r.branch_id);
  v_int := coalesce(p_interest, (pol->>'interest_default')::numeric);
  if v_int <> (pol->>'interest_default')::numeric and not has_perm('loans.interest', r.branch_id) then
    raise exception 'LOAN_INTEREST_LOCKED';
  end if;
  if p_principal is null or p_principal <= 0 then raise exception 'Monto inválido'; end if;
  if p_count is null or p_count < 1 or p_count > 120 then raise exception 'Número de cuotas inválido'; end if;
  if p_every_days is null or p_every_days < 1 or p_every_days > 92 then raise exception 'Frecuencia inválida'; end if;
  if p_first_due is null or p_first_due < v_today then raise exception 'Fecha de primera cuota inválida'; end if;
  if v_int < 0 or v_int > 500 then raise exception 'LOAN_POLICY_INVALID'; end if;

  v_total := round(p_principal * (1 + v_int / 100), 2);

  -- Reglas: lo que las pasa queda pendiente de aprobación
  if v_int < (pol->>'interest_min')::numeric or v_int > (pol->>'interest_max')::numeric then v_reasons := array_append(v_reasons, 'interest'); end if;
  if p_count > (pol->>'max_installments')::numeric then v_reasons := array_append(v_reasons, 'installments'); end if;
  if (pol->>'max_amount_customer')::numeric > 0
     and customer_open_balance(c.id) + v_total > (pol->>'max_amount_customer')::numeric then v_reasons := array_append(v_reasons, 'amount'); end if;
  if (pol->>'max_active_loans_customer')::numeric > 0
     and (select count(*) from loans l join orders o on o.id = l.order_id
           where l.customer_id = c.id and o.status = 'confirmed' and o.approval_status <> 'rejected'
             and exists (select 1 from installments i where i.order_id = o.id and i.amount - installment_paid(i.id) > 0))
         >= (pol->>'max_active_loans_customer')::numeric then v_reasons := array_append(v_reasons, 'active_loans'); end if;
  if (pol->>'max_daily_lent_collector')::numeric > 0
     and (select coalesce(sum(l.principal), 0) from loans l join orders o on o.id = l.order_id
           where l.created_by = auth.uid() and o.approval_status <> 'rejected' and l.cancelled_at is null
             and (l.created_at at time zone (select timezone from branches where id = r.branch_id))::date = v_today)
         + p_principal > (pol->>'max_daily_lent_collector')::numeric then v_reasons := array_append(v_reasons, 'daily'); end if;

  select base_currency into v_cur from companies where id = r.company_id;
  insert into orders (branch_id, customer_id, vendor_id, payment_condition, currency, order_type, notes, route_id)
  values (r.branch_id, c.id, auth.uid(), 'credit', v_cur, 'loan', nullif(trim(coalesce(p_notes, '')), ''), r.id)
  returning id into v_order;
  insert into order_items (org_id, order_id, product_id, description, qty, unit_price, tax_rate)
  values (r.org_id, v_order, null, 'Préstamo', 1, v_total, 0);
  perform generate_installments(v_order, p_count, p_every_days, p_first_due, false);

  insert into loans (order_id, org_id, branch_id, customer_id, route_id, collector_id, principal, interest_pct,
                     installments, every_days, first_due, pending_reasons)
  values (v_order, r.org_id, r.branch_id, c.id, r.id, r.collector_id, round(p_principal, 2), v_int,
          p_count, p_every_days, p_first_due, v_reasons);

  perform set_config('veltrix.loan_approval',
                     case when cardinality(v_reasons) = 0 or is_branch_manager(r.branch_id) or is_org_owner(r.org_id) then 'auto_approved' else 'pending_supervisor' end, true);
  update orders set status = 'confirmed' where id = v_order;
  perform set_config('veltrix.loan_approval', '', true);

  select approval_status into v_status from orders where id = v_order;
  return jsonb_build_object('order_id', v_order, 'approval', v_status, 'reasons', to_jsonb(v_reasons),
                            'total', v_total, 'each', (select amount from installments where order_id = v_order and number = 1));
end $$;

-- Anular un préstamo sin cobros: si ya se entregó el dinero, vuelve a lo que lleva el cobrador
create or replace function cancel_street_loan(p_order uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare l loans%rowtype; o orders%rowtype;
begin
  select * into l from loans where order_id = p_order for update;
  if not found or l.cancelled_at is not null then raise exception 'Préstamo inexistente'; end if;
  select * into o from orders where id = p_order;
  if not has_perm('loans.cancel', l.branch_id) then raise exception 'LOAN_NO_PERMISSION'; end if;
  if exists (select 1 from installments i where i.order_id = p_order and installment_paid(i.id) <> 0) then
    raise exception 'El pedido tiene cobros: primero hay que reversarlos';
  end if;
  perform set_config('veltrix.loan_cancel', 'on', true);
  update orders set status = 'cancelled', rejection_reason = coalesce(nullif(trim(coalesce(p_reason, '')), ''), rejection_reason)
   where id = p_order;
  perform set_config('veltrix.loan_cancel', '', true);
  if l.movement_id is not null then
    insert into cash_movements (branch_id, type, amount, currency, route_id, description, created_by)
    values (l.branch_id, 'loan_return', l.principal, o.currency, l.route_id,
            'Préstamo anulado · ' || coalesce((select name from customers where id = l.customer_id), ''), l.collector_id);
  end if;
  update loans set cancelled_at = now() where order_id = p_order;
end $$;

-- El cobrador registra clientes en su propia ruta
create or replace function collector_save_customer(p_route uuid, p_name text, p_phone text default null, p_address text default null,
                                                   p_tax_id text default null, p_notes text default null,
                                                   p_lat numeric default null, p_lng numeric default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare r collection_routes%rowtype; pol jsonb; v_id uuid;
begin
  select * into r from collection_routes where id = p_route and deleted_at is null and is_active;
  if not found or not (r.collector_id = auth.uid() or is_branch_manager(r.branch_id) or is_org_owner(r.org_id)) then
    raise exception 'Esta ruta no está asignada a usted';
  end if;
  if not has_perm('loans.customers', r.branch_id) then raise exception 'LOAN_NO_PERMISSION'; end if;
  if not org_writable(r.org_id) then raise exception 'Cuenta suspendida: solo lectura'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Indique el nombre'; end if;
  pol := loan_policy(r.org_id);
  if (pol->>'max_customers_collector')::numeric > 0
     and (select count(*) from customers where route_id = r.id and deleted_at is null) >= (pol->>'max_customers_collector')::numeric then
    raise exception 'LOAN_MAX_CUSTOMERS';
  end if;
  insert into customers (branch_id, route_id, name, phone, address, tax_id, notes, gps_lat, gps_lng)
  values (r.branch_id, r.id, trim(p_name), nullif(trim(coalesce(p_phone, '')), ''), nullif(trim(coalesce(p_address, '')), ''),
          nullif(trim(coalesce(p_tax_id, '')), ''), nullif(trim(coalesce(p_notes, '')), ''), p_lat, p_lng)
  returning id into v_id;
  return v_id;
end $$;

create or replace function route_customers(p_route uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'phone', c.phone, 'address', c.address,
                                               'balance', customer_open_balance(c.id), 'rating', customer_rating(c.id))
                            order by c.name), '[]'::jsonb)
    from customers c join collection_routes r on r.id = c.route_id
   where c.route_id = p_route and c.deleted_at is null
     and (r.collector_id = auth.uid() or is_branch_manager(r.branch_id) or is_org_owner(r.org_id));
$$;

-- ---------- Rendición: préstamos aparte de gastos ----------
do $$
declare d text;
begin
  d := pg_get_functiondef('close_route(uuid)'::regprocedure);
  if position('loan_return' in d) = 0 then
    d := replace(d, 'select coalesce(sum(amount), 0) into v_exp from cash_movements where settlement_id = v_id;',
      'select coalesce(sum(case when type = ''loan_return'' then -amount else amount end), 0) into v_exp from cash_movements where settlement_id = v_id;');
    if position('loan_return' in d) = 0 then raise exception 'close_route: no se pudo aplicar'; end if;
    execute d;
  end if;

  d := pg_get_functiondef('collector_day()'::regprocedure);
  if position('unsettled_loans' in d) = 0 then
    d := replace(d, 'where route_id = r.id and created_by = auth.uid() and settlement_id is null),',
      'where route_id = r.id and created_by = auth.uid() and settlement_id is null and type = ''expense''),
        ''unsettled_loans'', (select coalesce(sum(case when type = ''loan_return'' then -amount else amount end), 0) from cash_movements
                               where route_id = r.id and created_by = auth.uid() and settlement_id is null
                                 and type in (''loan_disbursement'', ''loan_return'')),
        ''policy'', loan_policy(r.org_id),
        ''can_loan'', has_perm(''loans.create'', r.branch_id),
        ''can_customers'', has_perm(''loans.customers'', r.branch_id),
        ''can_interest'', has_perm(''loans.interest'', r.branch_id),');
    d := replace(d, '''credits'', customer_credit_cards(c.id),', '''credits'', customer_credit_cards(c.id), ''rating'', customer_rating(c.id),');
    if position('unsettled_loans' in d) = 0 or position('customer_rating' in d) = 0 then
      raise exception 'collector_day: no se pudo aplicar';
    end if;
    execute d;
  end if;
end $$;

-- ---------- Panel del administrador ----------
create or replace function loans_admin(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not (is_org_owner(p_org) or is_platform_admin()) then raise exception 'Sin permiso'; end if;
  return jsonb_build_object(
    'policy', loan_policy(p_org),
    'loans', coalesce((select jsonb_agg(x) from (
      select jsonb_build_object(
        'order_id', l.order_id, 'created_at', l.created_at, 'customer', c.name, 'customer_id', c.id,
        'route', r.name, 'collector', p.full_name, 'branch', b.name, 'currency', o.currency,
        'principal', l.principal, 'interest', l.interest_pct, 'total', o.total_amount,
        'installments', l.installments, 'every_days', l.every_days, 'first_due', l.first_due,
        'reasons', to_jsonb(l.pending_reasons), 'approval', o.approval_status, 'status', o.status,
        'balance', (select coalesce(sum(i.amount - installment_paid(i.id)), 0) from installments i where i.order_id = o.id),
        'paid_any', exists (select 1 from installments i where i.order_id = o.id and installment_paid(i.id) <> 0),
        'rating', customer_rating(c.id)) as x
        from loans l join orders o on o.id = l.order_id join customers c on c.id = l.customer_id
        join branches b on b.id = l.branch_id
        left join collection_routes r on r.id = l.route_id left join profiles p on p.id = l.collector_id
       where l.org_id = p_org
       order by (o.approval_status = 'pending_supervisor') desc, l.created_at desc
       limit 200) t), '[]'::jsonb));
end $$;

revoke execute on function loan_policy(uuid), customer_rating(uuid) from public, anon;
revoke execute on function set_loan_policy(uuid, jsonb), create_street_loan(uuid, uuid, numeric, numeric, int, int, date, text),
  cancel_street_loan(uuid, text), collector_save_customer(uuid, text, text, text, text, text, numeric, numeric),
  route_customers(uuid), loans_admin(uuid) from public, anon;
grant execute on function loan_policy(uuid), customer_rating(uuid), set_loan_policy(uuid, jsonb),
  create_street_loan(uuid, uuid, numeric, numeric, int, int, date, text), cancel_street_loan(uuid, text),
  collector_save_customer(uuid, text, text, text, text, text, numeric, numeric), route_customers(uuid), loans_admin(uuid)
  to authenticated;
