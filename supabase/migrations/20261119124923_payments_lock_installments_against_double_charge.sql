create or replace function public.register_payment(p_customer uuid, p_origin payment_origin, p_method payment_method, p_amount numeric, p_shift uuid default null::uuid, p_route uuid default null::uuid, p_installment_ids uuid[] default null::uuid[], p_offline_uuid uuid default null::uuid, p_collected_at timestamp with time zone default now(), p_order uuid default null::uuid)
 returns uuid language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_id uuid; c customers%rowtype; v_currency char(3); v_custody custody_status;
  v_left numeric := p_amount; v_take numeric; v_bal numeric; v_r record;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'Monto inválido'; end if;

  -- Idempotencia: si ya llegó este cobro offline, devuelve el existente
  if p_offline_uuid is not null then
    select id into v_id from payments where offline_uuid = p_offline_uuid;
    if v_id is not null then return v_id; end if;
  end if;

  select * into c from customers where id = p_customer and deleted_at is null;
  if not found then raise exception 'Cliente inexistente'; end if;
  if not org_writable(c.org_id) then raise exception 'Cuenta suspendida: solo lectura'; end if;
  if c.is_walk_in and p_order is null and p_installment_ids is null then
    raise exception 'Para consumidor final indique el pedido que se cobra';
  end if;

  -- Permisos según origen
  if p_origin = 'pos_counter' then
    if not exists (select 1 from register_shifts s where s.id = p_shift and s.cashier_id = auth.uid()
                     and s.status = 'open' and s.branch_id = c.branch_id) then
      raise exception 'Necesita un turno de caja abierto propio en esta sucursal';
    end if;
    p_route := null;
  else
    if not exists (select 1 from collection_routes r where r.id = p_route and r.collector_id = auth.uid()
                     and r.is_active and r.branch_id = c.branch_id) then
      raise exception 'Esta ruta no está asignada a usted';
    end if;
    p_shift := null;
  end if;

  v_custody := case when p_method <> 'cash' then 'direct_to_account'
                    when p_origin = 'field_route' then 'in_collector_hands'
                    else 'in_register' end;
  select base_currency into v_currency from companies where id = c.company_id;

  insert into payments (branch_id, customer_id, origin_type, shift_id, route_id, collected_by,
                        method, amount, currency, custody_status, offline_uuid, collected_at)
  values (c.branch_id, c.id, p_origin, p_shift, p_route, auth.uid(),
          p_method, p_amount, v_currency, v_custody, p_offline_uuid, p_collected_at)
  returning id into v_id;

  -- Aplicación a cuotas (más antigua primero). Cada cuota se bloquea mientras se cobra,
  -- así dos cobros simultáneos no pueden pasarse del saldo.
  for v_r in
    select i.id, i.amount
      from installments i join orders o on o.id = i.order_id
     where o.customer_id = c.id and o.status = 'confirmed'
       and o.approval_status in ('auto_approved','approved')
       and (p_installment_ids is null or i.id = any(p_installment_ids))
       and (p_order is null or o.id = p_order)
     order by i.due_date, o.created_at, i.number
       for update of i
  loop
    exit when v_left <= 0;
    v_bal := v_r.amount - installment_paid(v_r.id);
    continue when v_bal <= 0;
    v_take := least(v_left, v_bal);
    insert into payment_allocations (payment_id, installment_id, amount) values (v_id, v_r.id, v_take);
    v_left := v_left - v_take;
  end loop;

  if v_left > 0 then
    raise exception 'El monto excede la deuda pendiente en % (no se registró nada)', v_left;
  end if;
  return v_id;
end $function$;

-- Segunda barrera: el trigger también bloquea la cuota antes de verificar el saldo
create or replace function public.validate_allocation()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare p payments%rowtype; i record; v_sum_pay numeric;
begin
  perform 1 from installments where id = new.installment_id for update;
  select * into p from payments where id = new.payment_id;
  select ins.*, o.status as o_status, o.approval_status
    into i from installments ins join orders o on o.id = ins.order_id
   where ins.id = new.installment_id;

  if p.currency <> i.currency then raise exception 'Moneda del cobro distinta a la de la cuota'; end if;
  if p.customer_id <> i.customer_id then raise exception 'El cobro y la cuota son de clientes distintos'; end if;
  if sign(new.amount) <> sign(p.amount) then raise exception 'Signo de aplicación inválido'; end if;

  select coalesce(sum(amount),0) into v_sum_pay from payment_allocations where payment_id = p.id;
  if abs(v_sum_pay + new.amount) > abs(p.amount) then
    raise exception 'Se aplicó más de lo cobrado';
  end if;

  if p.reverses_payment_id is null then
    if i.o_status <> 'confirmed' or i.approval_status not in ('auto_approved','approved') then
      raise exception 'Esa cuota no está habilitada para cobro';
    end if;
    if installment_paid(i.id) + new.amount > i.amount then
      raise exception 'El monto excede el saldo de la cuota';
    end if;
    if p.origin_type = 'field_route' and not exists (
         select 1 from route_assignments ra join branches b on b.id = ra.branch_id
         where ra.installment_id = i.id and ra.route_id = p.route_id
           and ra.assign_date = (p.collected_at at time zone b.timezone)::date) then
      update payments set needs_review = true,
             review_note = 'Cobro sin asignación vigente para esa ruta y fecha (posible conflicto offline)'
       where id = p.id;
    end if;
  end if;

  new.org_id := p.org_id;
  return new;
end $function$;

revoke all on function public.register_payment(uuid, payment_origin, payment_method, numeric, uuid, uuid, uuid[], uuid, timestamptz, uuid) from public, anon;
grant execute on function public.register_payment(uuid, payment_origin, payment_method, numeric, uuid, uuid, uuid[], uuid, timestamptz, uuid) to authenticated, service_role;
