-- =====================================================================
-- Veltrix · Ventas y Caja del dueño / supervisor
--   sales_list(branch, from, to, search)   ventas por fechas con totales
--   sale_detail(order)                      ítems, cuotas y cobros de una venta
--   cancel_sale(order, reason)              anula (sin cobros); devuelve el stock
--   cash_overview(branch)                   cajas, turnos abiertos (con esperado en vivo),
--                                           últimos cierres y reversos pendientes
--   shift_detail(shift)                     cobros, movimientos y rendiciones de un turno
--   save_register(id, branch, name, active) alta / renombrar / desactivar caja
-- Solo owner de la organización o supervisor de la sucursal (is_branch_manager).
-- =====================================================================

create or replace function _order_paid(p_order uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(installment_paid(i.id)), 0) from installments i where i.order_id = p_order;
$$;

create or replace function sales_list(p_branch uuid, p_from date, p_to date, p_search text default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_tz text; v_cur char(3); v_q text; v_from timestamptz; v_to timestamptz; v jsonb;
begin
  if not is_branch_manager(p_branch) then raise exception 'Sin permiso'; end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'Rango de fechas inválido'; end if;
  if p_to - p_from > 366 then raise exception 'Rango de fechas demasiado grande'; end if;
  select b.timezone, c.base_currency into v_tz, v_cur
    from branches b join companies c on c.id = b.company_id where b.id = p_branch;
  v_from := p_from::timestamp at time zone v_tz;
  v_to := (p_to + 1)::timestamp at time zone v_tz;
  v_q := nullif(lower(trim(coalesce(p_search, ''))), '');

  with base as (
    select o.id, o.confirmed_at, o.status, o.payment_condition, o.approval_status, o.order_type,
           o.total_amount, o.currency, c.name as customer, c.is_walk_in, pr.full_name as vendor,
           case when o.status = 'confirmed' then _order_paid(o.id) else 0 end as paid,
           (select count(*) from order_items i where i.order_id = o.id) as items
      from orders o
      join customers c on c.id = o.customer_id
      left join profiles pr on pr.id = o.vendor_id
     where o.branch_id = p_branch and o.deleted_at is null
       and o.status in ('confirmed', 'cancelled')
       and o.confirmed_at >= v_from and o.confirmed_at < v_to
       and (v_q is null or lower(c.name) like '%' || v_q || '%'
            or lower(coalesce(pr.full_name, '')) like '%' || v_q || '%'
            or lower(o.id::text) like v_q || '%')
  )
  select jsonb_build_object(
    'currency', v_cur,
    'summary', (select jsonb_build_object(
        'count', count(*) filter (where status = 'confirmed' and approval_status is distinct from 'rejected'),
        'total', coalesce(sum(total_amount) filter (where status = 'confirmed' and approval_status is distinct from 'rejected'), 0),
        'paid', coalesce(sum(paid) filter (where status = 'confirmed'), 0),
        'cash_sales', coalesce(sum(total_amount) filter (where status = 'confirmed' and payment_condition = 'cash'), 0),
        'credit_sales', coalesce(sum(total_amount) filter (where status = 'confirmed' and payment_condition = 'credit'
                                                           and approval_status is distinct from 'rejected'), 0),
        'cancelled', count(*) filter (where status = 'cancelled')) from base),
    'by_vendor', (select coalesce(jsonb_agg(x order by x.total desc), '[]'::jsonb) from (
        select coalesce(vendor, '—') as name, count(*) as count, sum(total_amount) as total
          from base where status = 'confirmed' and approval_status is distinct from 'rejected'
         group by vendor) x),
    'orders', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'at', confirmed_at, 'status', status, 'condition', payment_condition,
        'approval', approval_status, 'type', order_type, 'total', total_amount, 'paid', paid,
        'customer', case when is_walk_in then null else customer end, 'vendor', vendor, 'items', items)
        order by confirmed_at desc), '[]'::jsonb)
        from (select * from base order by confirmed_at desc limit 300) l),
    'truncated', (select count(*) > 300 from base)
  ) into v;
  return v;
end $$;

create or replace function sale_detail(p_order uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare o orders%rowtype;
begin
  select * into o from orders where id = p_order and deleted_at is null;
  if not found or not is_branch_manager(o.branch_id) then raise exception 'Sin permiso'; end if;
  return jsonb_build_object(
    'id', o.id, 'at', o.confirmed_at, 'status', o.status, 'condition', o.payment_condition,
    'approval', o.approval_status, 'type', o.order_type, 'total', o.total_amount, 'currency', o.currency,
    'notes', o.notes, 'paid', _order_paid(o.id),
    'customer', (select case when is_walk_in then null else name end from customers where id = o.customer_id),
    'vendor', (select full_name from profiles where id = o.vendor_id),
    'items', (select coalesce(jsonb_agg(jsonb_build_object(
                'description', i.description, 'qty', i.qty, 'price', i.unit_price, 'total', i.line_total)
                order by i.created_at), '[]'::jsonb) from order_items i where i.order_id = o.id),
    'installments', (select coalesce(jsonb_agg(jsonb_build_object(
                'number', i.number, 'due', i.due_date, 'amount', i.amount, 'paid', installment_paid(i.id))
                order by i.number), '[]'::jsonb) from installments i where i.order_id = o.id),
    'payments', (select coalesce(jsonb_agg(jsonb_build_object(
                'at', p.collected_at, 'method', p.method, 'amount', a.amount,
                'by', pr.full_name, 'origin', p.origin_type) order by p.collected_at), '[]'::jsonb)
                from payment_allocations a
                join installments i on i.id = a.installment_id
                join payments p on p.id = a.payment_id
                left join profiles pr on pr.id = p.collected_by
               where i.order_id = o.id)
  );
end $$;

create or replace function cancel_sale(p_order uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare o orders%rowtype;
begin
  select * into o from orders where id = p_order and deleted_at is null for update;
  if not found or not is_branch_manager(o.branch_id) then raise exception 'Sin permiso'; end if;
  if not org_writable(o.org_id) then raise exception 'Cuenta suspendida: solo lectura'; end if;
  if o.status <> 'confirmed' then raise exception 'SALE_NOT_CANCELLABLE'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Indique el motivo'; end if;
  if _order_paid(o.id) <> 0 then raise exception 'SALE_HAS_PAYMENTS'; end if;
  update orders
     set status = 'cancelled',
         notes = concat_ws(E'\n', nullif(notes, ''), 'Anulada: ' || left(trim(p_reason), 300))
   where id = o.id;
  insert into audit_log (org_id, branch_id, table_name, row_id, action, actor_id, new_data)
  values (o.org_id, o.branch_id, 'orders', o.id, 'sale_cancelled', auth.uid(),
          jsonb_build_object('reason', left(trim(p_reason), 300), 'total', o.total_amount));
end $$;

create or replace function cash_overview(p_branch uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_branch_manager(p_branch) then raise exception 'Sin permiso'; end if;
  return jsonb_build_object(
    'currency', (select c.base_currency from branches b join companies c on c.id = b.company_id where b.id = p_branch),
    'registers', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', r.id, 'name', r.name, 'active', r.is_active,
               'shift', (select jsonb_build_object(
                    'id', s.id, 'cashier', pr.full_name, 'opened_at', s.opened_at, 'opening', s.opening_cash,
                    'expected', _shift_expected_cash(s.id),
                    'cash_in', coalesce((select sum(amount) from payments where shift_id = s.id and method = 'cash'), 0),
                    'digital_in', coalesce((select sum(amount) from payments where shift_id = s.id and method <> 'cash'), 0),
                    'count', (select count(*) from payments where shift_id = s.id and amount > 0))
                  from register_shifts s left join profiles pr on pr.id = s.cashier_id
                 where s.register_id = r.id and s.status = 'open'))
             order by r.is_active desc, r.name), '[]'::jsonb)
        from cash_registers r where r.branch_id = p_branch and r.deleted_at is null),
    'closed', (
      select coalesce(jsonb_agg(x order by x->>'closed_at' desc), '[]'::jsonb) from (
        select jsonb_build_object(
                 'id', s.id, 'register', r.name, 'cashier', pr.full_name, 'opened_at', s.opened_at,
                 'closed_at', s.closed_at, 'expected', s.expected_cash, 'declared', s.declared_cash,
                 'difference', s.difference, 'status', s.status) as x
          from register_shifts s
          join cash_registers r on r.id = s.register_id
          left join profiles pr on pr.id = s.cashier_id
         where s.branch_id = p_branch and s.status <> 'open'
         order by s.closed_at desc limit 30) t),
    'reversals', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', rv.id, 'at', rv.created_at, 'reason', rv.reason, 'requested_by', rq.full_name,
               'amount', p.amount, 'method', p.method, 'customer', c.name, 'paid_at', p.collected_at)
             order by rv.created_at), '[]'::jsonb)
        from payment_reversals rv
        join payments p on p.id = rv.payment_id
        join customers c on c.id = p.customer_id
        left join profiles rq on rq.id = rv.requested_by
       where rv.branch_id = p_branch and rv.status = 'pending')
  );
end $$;

create or replace function shift_detail(p_shift uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s register_shifts%rowtype;
begin
  select * into s from register_shifts where id = p_shift;
  if not found or not is_branch_manager(s.branch_id) then raise exception 'Sin permiso'; end if;
  return jsonb_build_object(
    'id', s.id, 'status', s.status, 'opened_at', s.opened_at, 'closed_at', s.closed_at,
    'opening', s.opening_cash,
    'expected', coalesce(s.expected_cash, _shift_expected_cash(s.id)),
    'declared', s.declared_cash, 'difference', s.difference,
    'cashier', (select full_name from profiles where id = s.cashier_id),
    'register', (select name from cash_registers where id = s.register_id),
    'payments', (select coalesce(jsonb_agg(jsonb_build_object(
                   'at', p.collected_at, 'customer', c.name, 'walk_in', c.is_walk_in, 'method', p.method,
                   'amount', p.amount, 'reversal', p.reverses_payment_id is not null)
                   order by p.collected_at), '[]'::jsonb)
                   from payments p join customers c on c.id = p.customer_id where p.shift_id = s.id),
    'movements', (select coalesce(jsonb_agg(jsonb_build_object(
                   'at', m.created_at, 'type', m.type, 'amount', m.amount, 'description', m.description)
                   order by m.created_at), '[]'::jsonb) from cash_movements m where m.shift_id = s.id),
    'settlements', (select coalesce(jsonb_agg(jsonb_build_object(
                   'at', st.received_at, 'collector', pr.full_name, 'expected', st.expected_cash_delivery,
                   'declared', st.declared_cash_delivered, 'difference', st.difference)
                   order by st.received_at), '[]'::jsonb)
                   from route_settlements st left join profiles pr on pr.id = st.collector_id
                  where st.received_by_shift_id = s.id)
  );
end $$;

create or replace function save_register(p_id uuid, p_branch uuid, p_name text, p_active boolean default true)
returns uuid
language plpgsql security definer set search_path = public as $$
declare b branches%rowtype; v_id uuid; v_name text := trim(coalesce(p_name, ''));
begin
  select * into b from branches where id = p_branch and deleted_at is null;
  if not found or not is_branch_manager(b.id) then raise exception 'Sin permiso'; end if;
  if not org_writable(b.org_id) then raise exception 'Cuenta suspendida: solo lectura'; end if;
  if v_name = '' or length(v_name) > 60 then raise exception 'Indique el nombre'; end if;
  if exists (select 1 from cash_registers where branch_id = b.id and lower(name) = lower(v_name)
               and deleted_at is null and id is distinct from p_id) then
    raise exception 'REGISTER_NAME_TAKEN';
  end if;
  if p_id is null then
    if (select count(*) from cash_registers where branch_id = b.id and deleted_at is null) >= 20 then
      raise exception 'REGISTER_LIMIT';
    end if;
    insert into cash_registers (org_id, company_id, branch_id, name, created_by)
    values (b.org_id, b.company_id, b.id, v_name, auth.uid()) returning id into v_id;
  else
    if not coalesce(p_active, true)
       and exists (select 1 from register_shifts where register_id = p_id and status = 'open') then
      raise exception 'REGISTER_HAS_OPEN_SHIFT';
    end if;
    update cash_registers set name = v_name, is_active = coalesce(p_active, true), updated_at = now()
     where id = p_id and branch_id = b.id and deleted_at is null returning id into v_id;
    if v_id is null then raise exception 'Caja inexistente'; end if;
  end if;
  return v_id;
end $$;

revoke execute on function _order_paid(uuid) from public, anon, authenticated;
revoke execute on function sales_list(uuid, date, date, text), sale_detail(uuid), cancel_sale(uuid, text),
  cash_overview(uuid), shift_detail(uuid), save_register(uuid, uuid, text, boolean) from public, anon;
grant execute on function sales_list(uuid, date, date, text), sale_detail(uuid), cancel_sale(uuid, text),
  cash_overview(uuid), shift_detail(uuid), save_register(uuid, uuid, text, boolean) to authenticated;
grant execute on function _order_paid(uuid), sales_list(uuid, date, date, text), sale_detail(uuid),
  cancel_sale(uuid, text), cash_overview(uuid), shift_detail(uuid),
  save_register(uuid, uuid, text, boolean) to service_role;
