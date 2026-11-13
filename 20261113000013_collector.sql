-- =====================================================================
-- Veltrix · Cobrador de calle (funciona sin internet)
--   El dueño/supervisor arma rutas, asigna cobrador y clientes.
--   El cobrador descarga su día, cobra/visita/gasta sin señal y sincroniza después.
--   Todo lo que llega del teléfono es idempotente (offline_uuid): repetir no duplica.
-- =====================================================================

alter table cash_movements add column if not exists offline_uuid uuid unique;

-- ---------- Administración de rutas (dueño / supervisor) ----------
create or replace function routes_admin(p_branch uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_branch_manager(p_branch) then raise exception 'Sin permiso'; end if;
  return jsonb_build_object(
    'routes', (select coalesce(jsonb_agg(jsonb_build_object(
                 'id', r.id, 'name', r.name, 'collector_id', r.collector_id, 'active', r.is_active,
                 'collector', (select full_name from profiles where id = r.collector_id),
                 'customers', (select count(*) from customers c where c.route_id = r.id and c.deleted_at is null))
               order by r.name), '[]'::jsonb)
                 from collection_routes r where r.branch_id = p_branch and r.deleted_at is null),
    'collectors', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name) order by p.full_name), '[]'::jsonb)
                     from memberships m join profiles p on p.id = m.user_id
                    where m.branch_id = p_branch and m.role = 'collector' and m.is_active and m.deleted_at is null and p.is_active),
    'customers', (select coalesce(jsonb_agg(jsonb_build_object(
                    'id', c.id, 'name', c.name, 'address', c.address, 'route_id', c.route_id,
                    'balance', customer_open_balance(c.id)) order by c.name), '[]'::jsonb)
                    from customers c where c.branch_id = p_branch and not c.is_walk_in and c.deleted_at is null)
  );
end $$;

create or replace function save_route(p_id uuid, p_branch uuid, p_name text, p_collector uuid, p_active boolean default true)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; b branches%rowtype;
begin
  select * into b from branches where id = p_branch and deleted_at is null;
  if not found or not is_branch_manager(b.id) then raise exception 'Sin permiso'; end if;
  if not org_writable(b.org_id) then raise exception 'Cuenta suspendida: solo lectura'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Indique el nombre'; end if;
  if p_id is null then
    insert into collection_routes (branch_id, name, collector_id, is_active, created_by)
    values (b.id, trim(p_name), p_collector, p_active, auth.uid()) returning id into v_id;
  else
    update collection_routes set name = trim(p_name), collector_id = p_collector, is_active = p_active
     where id = p_id and branch_id = b.id and deleted_at is null returning id into v_id;
    if v_id is null then raise exception 'Ruta inexistente'; end if;
  end if;
  return v_id;
end $$;

create or replace function set_customer_route(p_customer uuid, p_route uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c customers%rowtype;
begin
  select * into c from customers where id = p_customer and deleted_at is null;
  if not found or not is_branch_manager(c.branch_id) then raise exception 'Sin permiso'; end if;
  if p_route is not null and not exists (select 1 from collection_routes where id = p_route and branch_id = c.branch_id and deleted_at is null) then
    raise exception 'La ruta no es de esta sucursal';
  end if;
  update customers set route_id = p_route where id = c.id;
end $$;

-- ---------- El día del cobrador (se guarda en el teléfono para trabajar sin señal) ----------
create or replace function collector_day() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'generated_at', now(),
    'routes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'name', r.name, 'branch', b.name,
        'currency', (select base_currency from companies where id = r.company_id),
        'today', branch_today(r.branch_id),
        -- en manos del cobrador, todavía sin rendir
        'unsettled_cash', (select coalesce(sum(amount), 0) from payments
                            where route_id = r.id and collected_by = auth.uid() and settlement_id is null and method = 'cash'),
        'unsettled_digital', (select coalesce(sum(amount), 0) from payments
                               where route_id = r.id and collected_by = auth.uid() and settlement_id is null and method <> 'cash'),
        'unsettled_expenses', (select coalesce(sum(amount), 0) from cash_movements
                                where route_id = r.id and created_by = auth.uid() and settlement_id is null),
        'customers', coalesce((
          select jsonb_agg(x order by (x->>'overdue')::numeric desc, x->>'name') from (
            select jsonb_build_object(
              'id', c.id, 'name', c.name, 'phone', c.phone, 'address', c.address,
              'lat', c.gps_lat, 'lng', c.gps_lng,
              'balance', customer_open_balance(c.id),
              'overdue', customer_overdue(c.id),
              'due_today', (select coalesce(sum(i.amount - installment_paid(i.id)), 0)
                              from installments i join orders o on o.id = i.order_id
                             where o.customer_id = c.id and o.status = 'confirmed'
                               and o.approval_status in ('auto_approved','approved')
                               and i.due_date = branch_today(c.branch_id)),
              'next_due', (select min(i.due_date) from installments i join orders o on o.id = i.order_id
                            where o.customer_id = c.id and o.status = 'confirmed'
                              and o.approval_status in ('auto_approved','approved')
                              and i.amount - installment_paid(i.id) > 0),
              'visited_today', exists (select 1 from visits v where v.customer_id = c.id and v.route_id = r.id
                                         and (v.visited_at at time zone b.timezone)::date = branch_today(r.branch_id))
                            or exists (select 1 from payments p where p.customer_id = c.id and p.route_id = r.id
                                         and (p.collected_at at time zone b.timezone)::date = branch_today(r.branch_id))
            ) as x
              from customers c
             where c.route_id = r.id and c.deleted_at is null and customer_open_balance(c.id) > 0) t), '[]'::jsonb),
        'settlements', coalesce((
          select jsonb_agg(jsonb_build_object('id', s.id, 'at', s.created_at, 'status', s.status,
                   'cash', s.total_cash_collected, 'expenses', s.total_expenses, 'deliver', s.expected_cash_delivery)
                 order by s.created_at desc)
            from (select * from route_settlements where route_id = r.id and collector_id = auth.uid()
                  order by created_at desc limit 5) s), '[]'::jsonb)
      ) order by r.name)
        from collection_routes r join branches b on b.id = r.branch_id
       where r.collector_id = auth.uid() and r.is_active and r.deleted_at is null), '[]'::jsonb));
$$;

-- Visita sin cobro (no estaba, promesa de pago, se negó…)
create or replace function collector_visit(
  p_route uuid, p_customer uuid, p_result visit_result, p_promise_date date default null,
  p_promise_amount numeric default null, p_notes text default null,
  p_lat numeric default null, p_lng numeric default null,
  p_offline_uuid uuid default null, p_visited_at timestamptz default now()
) returns uuid
language plpgsql security definer set search_path = public as $$
declare r collection_routes%rowtype; v_id uuid;
begin
  if p_offline_uuid is not null then
    select id into v_id from visits where offline_uuid = p_offline_uuid;
    if v_id is not null then return v_id; end if;
  end if;
  select * into r from collection_routes where id = p_route and collector_id = auth.uid() and deleted_at is null;
  if not found then raise exception 'Esta ruta no está asignada a usted'; end if;
  if not exists (select 1 from customers where id = p_customer and branch_id = r.branch_id) then
    raise exception 'Cliente inexistente';
  end if;
  insert into visits (branch_id, route_id, customer_id, collector_id, result, promise_date, promise_amount,
                      notes, gps_lat, gps_lng, offline_uuid, visited_at)
  values (r.branch_id, r.id, p_customer, auth.uid(), p_result,
          case when p_result = 'promise' then p_promise_date end,
          case when p_result = 'promise' and p_promise_amount > 0 then p_promise_amount end,
          nullif(trim(coalesce(p_notes, '')), ''), p_lat, p_lng, p_offline_uuid,
          least(coalesce(p_visited_at, now()), now()))
  returning id into v_id;
  return v_id;
end $$;

-- Gasto en la calle (pasaje, combustible…): se descuenta en la rendición
create or replace function collector_expense(p_route uuid, p_amount numeric, p_description text, p_offline_uuid uuid default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare r collection_routes%rowtype; v_id uuid; v_cur char(3);
begin
  if p_offline_uuid is not null then
    select id into v_id from cash_movements where offline_uuid = p_offline_uuid;
    if v_id is not null then return v_id; end if;
  end if;
  select * into r from collection_routes where id = p_route and collector_id = auth.uid() and deleted_at is null;
  if not found then raise exception 'Esta ruta no está asignada a usted'; end if;
  if not org_writable(r.org_id) then raise exception 'Cuenta suspendida: solo lectura'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Monto inválido'; end if;
  if coalesce(trim(p_description), '') = '' then raise exception 'Indique el motivo'; end if;
  select base_currency into v_cur from companies where id = r.company_id;
  insert into cash_movements (branch_id, type, amount, currency, route_id, description, created_by, offline_uuid)
  values (r.branch_id, 'expense', round(p_amount, 2), v_cur, r.id, trim(p_description), auth.uid(), p_offline_uuid)
  returning id into v_id;
  return v_id;
end $$;

revoke execute on function routes_admin(uuid), save_route(uuid, uuid, text, uuid, boolean), set_customer_route(uuid, uuid),
  collector_day(), collector_visit(uuid, uuid, visit_result, date, numeric, text, numeric, numeric, uuid, timestamptz),
  collector_expense(uuid, numeric, text, uuid) from public, anon;
grant execute on function routes_admin(uuid), save_route(uuid, uuid, text, uuid, boolean), set_customer_route(uuid, uuid),
  collector_day(), collector_visit(uuid, uuid, visit_result, date, numeric, text, numeric, numeric, uuid, timestamptz),
  collector_expense(uuid, numeric, text, uuid) to authenticated, service_role;
