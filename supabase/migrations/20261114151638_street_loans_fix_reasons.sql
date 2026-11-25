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
