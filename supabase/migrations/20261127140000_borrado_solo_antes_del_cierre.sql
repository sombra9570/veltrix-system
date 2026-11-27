-- Cuotas, créditos y clientes de cobranza en calle solo se borran ANTES del cierre de caja o la liquidación.
-- Después del cierre ya no se puede (ni el cobrador, ni el supervisor, ni el administrador).

create or replace function public.period_closed(p_shift uuid, p_settlement uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select p_settlement is not null
      or exists (select 1 from register_shifts where id = p_shift and status <> 'open');
$$;

-- Borrar cuota (revierte el cobro): solo si el cobro aún no entró en un cierre o liquidación
create or replace function public.collector_delete_installment(p_order uuid, p_n integer)
returns void language plpgsql security definer set search_path to 'public' as $$
declare o record; r collection_routes; i installments; p payments; v_new uuid; a record; allowed boolean; v uuid;
begin
  select ord.id, ord.customer_id into o from orders ord where ord.id = p_order;
  if not found then raise exception 'Sin permiso'; end if;
  select cr.* into r from collection_routes cr join customers c on c.route_id = cr.id where c.id = o.customer_id and cr.deleted_at is null and cr.is_active;
  if not found then raise exception 'Sin permiso'; end if;
  perform assert_route_open(r.id);
  if r.collector_id = auth.uid() then
    allowed := coalesce((r.permissions->>'collector.delete_installments')::boolean, has_perm('collector.delete_installments', r.branch_id));
  elsif r.supervisor_id = auth.uid() or is_branch_manager(r.branch_id) or is_org_owner(r.org_id) then
    allowed := has_perm('collector.delete_installments', r.branch_id);
  else allowed := false; end if;
  if not allowed then raise exception 'LOAN_NO_PERMISSION'; end if;
  if not org_writable(r.org_id) then raise exception 'Cuenta suspendida: solo lectura'; end if;
  select * into i from installments where order_id = p_order and number = p_n;
  if not found then raise exception 'Sin permiso'; end if;
  select pp.* into p from payment_allocations al join payments pp on pp.id = al.payment_id
   where al.installment_id = i.id and al.amount > 0 and pp.reverses_payment_id is null
     and not exists (select 1 from payments x where x.reverses_payment_id = pp.id)
   order by pp.collected_at desc limit 1 for update of pp;
  if not found then raise exception 'INSTALLMENT_NOT_PAID'; end if;
  if period_closed(p.shift_id, p.settlement_id) then raise exception 'AFTER_CLOSE'; end if;
  insert into payments (branch_id, customer_id, origin_type, shift_id, route_id, settlement_id, collected_by, method, amount, currency,
                        custody_status, reverses_payment_id, needs_review, review_note, collected_at)
  values (p.branch_id, p.customer_id, p.origin_type, p.shift_id, p.route_id, p.settlement_id, coalesce(p.collected_by, auth.uid()), p.method, -p.amount, p.currency,
          p.custody_status, p.id, false, null, now())
  returning id into v_new;
  for a in select installment_id, amount from payment_allocations where payment_id = p.id loop
    insert into payment_allocations (payment_id, installment_id, amount) values (v_new, a.installment_id, -a.amount);
  end loop;
  insert into payment_reversals (org_id, company_id, branch_id, payment_id, requested_by, reason, status, decided_by, decided_at, reversal_payment_id)
  values (p.org_id, p.company_id, p.branch_id, p.id, auth.uid(), 'Cuota ' || p_n || ' borrada', 'approved', auth.uid(), now(), v_new);
  if r.supervisor_id = auth.uid() then
    select s.id into v from route_supervisions s where s.route_id = r.id and s.supervisor_id = auth.uid() and s.ended_at is null limit 1;
    if v is not null then
      insert into route_supervision_log (supervision_id, org_id, route_id, supervisor_id, action, detail)
      values (v, r.org_id, r.id, auth.uid(), 'other', jsonb_build_object('text', 'Borró la cuota ' || p_n || ' (revirtió un cobro de ' || p.amount || ')'));
    end if;
  end if;
end $$;

-- Borrar varias cuotas de una vez (todas o ninguna)
create or replace function public.collector_delete_installments(p_order uuid, p_numbers integer[])
returns void language plpgsql security definer set search_path to 'public' as $$
declare n integer;
begin
  if p_numbers is null or cardinality(p_numbers) = 0 then raise exception 'Sin permiso'; end if;
  for n in select distinct x from unnest(p_numbers) as x order by x desc loop
    perform collector_delete_installment(p_order, n);
  end loop;
end $$;
revoke all on function public.collector_delete_installments(uuid, integer[]) from public, anon;
grant execute on function public.collector_delete_installments(uuid, integer[]) to authenticated;

-- Borrar crédito: solo si ni su desembolso ni sus cobros entraron en un cierre o liquidación
create or replace function public.collector_delete_credit(p_order uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare l loans%rowtype; o orders%rowtype; r collection_routes%rowtype;
begin
  select * into l from loans where order_id = p_order for update;
  if not found or l.cancelled_at is not null then raise exception 'Préstamo inexistente'; end if;
  select * into r from collection_routes where id = l.route_id and deleted_at is null;
  if not found or not (r.collector_id = auth.uid() or is_org_owner(r.org_id) or is_branch_manager(r.branch_id)) then raise exception 'LOAN_NO_PERMISSION'; end if;
  if not coalesce((r.permissions->>'collector.delete_credits')::boolean, has_perm('collector.delete_credits', r.branch_id)) then raise exception 'LOAN_NO_PERMISSION'; end if;
  perform assert_route_open(r.id);
  select * into o from orders where id = p_order;
  if exists (select 1 from installments i where i.order_id = p_order and installment_paid(i.id) <> 0) then
    raise exception 'El pedido tiene cobros: primero hay que reversarlos';
  end if;
  if exists (select 1 from cash_movements m where m.id = l.movement_id and period_closed(m.shift_id, m.settlement_id))
     or exists (select 1 from payment_allocations al join installments i on i.id = al.installment_id join payments pp on pp.id = al.payment_id
                 where i.order_id = p_order and period_closed(pp.shift_id, pp.settlement_id)) then
    raise exception 'AFTER_CLOSE';
  end if;
  perform set_config('veltrix.loan_cancel', 'on', true);
  update orders set status = 'cancelled' where id = p_order;
  perform set_config('veltrix.loan_cancel', '', true);
  if l.movement_id is not null then
    insert into cash_movements (branch_id, type, amount, currency, route_id, description, created_by)
    values (l.branch_id, 'loan_return', l.principal, o.currency, l.route_id,
            'Crédito borrado · ' || coalesce((select name from customers where id = l.customer_id), ''), l.collector_id);
  end if;
  update loans set cancelled_at = now() where order_id = p_order;
end $$;

-- Anular préstamo: misma regla
create or replace function public.cancel_street_loan(p_order uuid, p_reason text default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare l loans%rowtype; o orders%rowtype;
begin
  select * into l from loans where order_id = p_order for update;
  if not found or l.cancelled_at is not null then raise exception 'Préstamo inexistente'; end if;
  select * into o from orders where id = p_order;
  if not has_perm('loans.cancel', l.branch_id) then raise exception 'LOAN_NO_PERMISSION'; end if;
  if exists (select 1 from installments i where i.order_id = p_order and installment_paid(i.id) <> 0) then
    raise exception 'El pedido tiene cobros: primero hay que reversarlos';
  end if;
  if exists (select 1 from cash_movements m where m.id = l.movement_id and period_closed(m.shift_id, m.settlement_id)) then
    raise exception 'AFTER_CLOSE';
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

-- Borrar cliente: sin deuda y sin movimientos que ya entraron en un cierre o liquidación
create or replace function public.collector_delete_customer(p_customer uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare c customers%rowtype; r collection_routes%rowtype;
begin
  select * into c from customers where id = p_customer and deleted_at is null;
  if not found then raise exception 'Sin permiso'; end if;
  select * into r from collection_routes where id = c.route_id and deleted_at is null;
  if not found or not (r.collector_id = auth.uid() or is_org_owner(r.org_id) or is_branch_manager(r.branch_id)) then raise exception 'LOAN_NO_PERMISSION'; end if;
  if not coalesce((r.permissions->>'collector.delete_customers')::boolean, has_perm('collector.delete_customers', r.branch_id)) then raise exception 'LOAN_NO_PERMISSION'; end if;
  perform assert_route_open(r.id);
  if customer_open_balance(c.id) > 0.004 then raise exception 'CUSTOMER_HAS_DEBT'; end if;
  if exists (select 1 from payments pp where pp.customer_id = c.id and period_closed(pp.shift_id, pp.settlement_id))
     or exists (select 1 from loans l join cash_movements m on m.id = l.movement_id where l.customer_id = c.id and period_closed(m.shift_id, m.settlement_id)) then
    raise exception 'AFTER_CLOSE';
  end if;
  update customers set deleted_at = now() where id = c.id;
end $$;
