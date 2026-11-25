create or replace function _route_actor(p_route uuid) returns collection_routes language plpgsql stable security definer set search_path to 'public' as $$
declare r collection_routes;
begin
  select * into r from collection_routes where id = p_route and deleted_at is null and is_active;
  if not found or not (r.collector_id = auth.uid() or r.supervisor_id = auth.uid() or is_branch_manager(r.branch_id) or is_org_owner(r.org_id)) then
    raise exception 'PERM_DENIED';
  end if;
  return r;
end $$;

-- Una sola fila de cliente (misma forma que collector_day): se usa para actualizar solo ese cliente en la pantalla
create or replace function collector_customer_row(p_route uuid, p_customer uuid) returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare r collection_routes; tz text; c customers; res jsonb;
begin
  r := _route_actor(p_route);
  select timezone into tz from branches where id = r.branch_id;
  select * into c from customers where id = p_customer and route_id = r.id and deleted_at is null;
  if not found then return null; end if;
  select jsonb_build_object(
    'id', c.id, 'name', c.name, 'phone', c.phone, 'address', c.address, 'tax_id', c.tax_id,
    'g_name', c.guarantor_name, 'g_phone', c.guarantor_phone, 'g_lat', c.guarantor_lat, 'g_lng', c.guarantor_lng,
    'lat', c.gps_lat, 'lng', c.gps_lng,
    'credits', customer_credit_cards(c.id), 'rating', customer_rating(c.id),
    'last_visit', (select jsonb_build_object('at', v.visited_at, 'result', v.result, 'notes', v.notes, 'promise_date', v.promise_date, 'promise_amount', v.promise_amount)
                     from visits v where v.customer_id = c.id order by v.visited_at desc limit 1),
    'paid_today', exists (select 1 from payments p2 where p2.customer_id = c.id and p2.route_id = r.id and p2.amount > 0 and p2.reverses_payment_id is null
                          and (p2.collected_at at time zone tz)::date = branch_today(r.branch_id)),
    'balance', customer_open_balance(c.id), 'overdue', customer_overdue(c.id),
    'due_today', (select coalesce(sum(i.amount - installment_paid(i.id)), 0) from installments i join orders o on o.id = i.order_id
                   where o.customer_id = c.id and o.status = 'confirmed' and o.approval_status in ('auto_approved','approved') and i.due_date = branch_today(c.branch_id)),
    'next_due', (select min(i.due_date) from installments i join orders o on o.id = i.order_id
                  where o.customer_id = c.id and o.status = 'confirmed' and o.approval_status in ('auto_approved','approved') and i.amount - installment_paid(i.id) > 0),
    'visited_today', exists (select 1 from visits v where v.customer_id = c.id and v.route_id = r.id and (v.visited_at at time zone tz)::date = branch_today(r.branch_id))
                  or exists (select 1 from payments p where p.customer_id = c.id and p.route_id = r.id and (p.collected_at at time zone tz)::date = branch_today(r.branch_id)),
    'sup_rating', (select s.rating from customer_sup_ratings s where s.customer_id = c.id order by s.at desc limit 1)
  ) into res;
  return res;
end $$;

-- Solo las cifras de la ruta (caja, periodo, días, liquidaciones): sin volver a leer clientes
create or replace function collector_route_totals(p_route uuid) returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare r collection_routes;
begin
  r := _route_actor(p_route);
  return jsonb_build_object(
    'unsettled_cash', (select coalesce(sum(amount), 0) from payments where route_id = r.id and collected_by = r.collector_id and settlement_id is null and method = 'cash'),
    'unsettled_digital', (select coalesce(sum(amount), 0) from payments where route_id = r.id and collected_by = r.collector_id and settlement_id is null and method <> 'cash'),
    'unsettled_expenses', (select coalesce(sum(amount), 0) from cash_movements where route_id = r.id and created_by = r.collector_id and settlement_id is null and type = 'expense'),
    'unsettled_loans', (select coalesce(sum(case when type = 'loan_return' then -amount else amount end), 0) from cash_movements
                          where route_id = r.id and created_by = r.collector_id and settlement_id is null and type in ('loan_disbursement', 'loan_return')),
    'fund_balance', route_fund_balance(r.id), 'period', route_period(r.id), 'days', route_days(r.id, 14),
    'liquidations', route_liquidations_list(r.id, 3),
    'portfolio', coalesce((select sum(i.amount - installment_paid(i.id)) from installments i join orders o on o.id = i.order_id join customers c on c.id = o.customer_id
                            where c.route_id = r.id and o.status = 'confirmed' and o.approval_status in ('approved', 'auto_approved')), 0),
    'locked', r.locked_by is not null);
end $$;
revoke all on function _route_actor(uuid), collector_customer_row(uuid,uuid), collector_route_totals(uuid) from public, anon;
grant execute on function collector_customer_row(uuid,uuid), collector_route_totals(uuid) to authenticated;
