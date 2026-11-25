-- Modo del cobrador: préstamos de dinero (rubros con finanzas) o ventas a plazos de mercadería (sin interés)
create or replace function public.collector_sale_mode(p_route uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare r collection_routes%rowtype; merch boolean;
begin
  select * into r from collection_routes where id = p_route and deleted_at is null and is_active;
  if not found or not (r.collector_id = auth.uid() or is_branch_manager(r.branch_id) or is_org_owner(r.org_id)) then
    return jsonb_build_object('mode', 'loan', 'can', false);
  end if;
  merch := not module_enabled(r.org_id, 'finance');
  return jsonb_build_object('mode', case when merch then 'merch' else 'loan' end,
    'can', case when merch then has_perm('sales.credit', r.branch_id) else has_perm('loans.create', r.branch_id) end);
end $$;

-- Productos que el cobrador puede ofrecer a plazos (solo lectura, de la empresa de su ruta)
create or replace function public.collector_products(p_route uuid)
returns table(id uuid, name text, unit_price numeric)
language plpgsql stable security definer set search_path to 'public' as $$
declare r collection_routes%rowtype;
begin
  select * into r from collection_routes where id = p_route and deleted_at is null and is_active;
  if not found or not (r.collector_id = auth.uid() or is_branch_manager(r.branch_id) or is_org_owner(r.org_id)) then
    raise exception 'Esta ruta no está asignada a usted';
  end if;
  if not has_perm('sales.credit', r.branch_id) then raise exception 'SALE_NO_PERMISSION'; end if;
  return query select p.id, p.name::text, p.unit_price from products p
    where p.company_id = r.company_id and p.is_active and p.is_sellable and p.deleted_at is null order by p.name limit 500;
end $$;

-- Venta a plazos de mercadería en la calle: cuotas fijas, sin interés; exige el permiso sales.credit del cobrador
create or replace function public.collector_credit_sale(p_route uuid, p_customer uuid, p_items jsonb, p_count integer, p_every_days integer, p_first_due date, p_notes text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare r collection_routes%rowtype; c customers%rowtype; v_cur char(3); v_order uuid; it jsonb; pr products%rowtype; v_qty numeric; v_status approval_status;
begin
  perform assert_route_open(p_route);
  select * into r from collection_routes where id = p_route and deleted_at is null and is_active;
  if not found or not (r.collector_id = auth.uid() or is_branch_manager(r.branch_id) or is_org_owner(r.org_id)) then
    raise exception 'Esta ruta no está asignada a usted';
  end if;
  if module_enabled(r.org_id, 'finance') then raise exception 'SALE_NOT_MERCH'; end if;
  if not has_perm('sales.credit', r.branch_id) then raise exception 'SALE_NO_PERMISSION'; end if;
  if not org_writable(r.org_id) then raise exception 'Cuenta suspendida: solo lectura'; end if;
  select * into c from customers where id = p_customer and branch_id = r.branch_id and deleted_at is null and not is_walk_in;
  if not found then raise exception 'Elija un cliente registrado'; end if;
  if c.route_id is distinct from r.id then
    if c.route_id is null then update customers set route_id = r.id where id = c.id; else raise exception 'LOAN_OTHER_ROUTE'; end if;
  end if;
  if p_count is null or p_count < 1 or p_count > 120 then raise exception 'Número de cuotas inválido'; end if;
  if p_every_days is null or p_every_days < 1 or p_every_days > 92 then raise exception 'Frecuencia inválida'; end if;
  if p_first_due is null or p_first_due < branch_today(r.branch_id) then raise exception 'Fecha de primera cuota inválida'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'El pedido no tiene ítems'; end if;
  select base_currency into v_cur from companies where id = r.company_id;
  perform ensure_default_warehouse(r.branch_id);
  insert into orders (branch_id, customer_id, vendor_id, payment_condition, currency, order_type, notes, route_id)
  values (r.branch_id, c.id, auth.uid(), 'credit', v_cur, 'counter', nullif(trim(coalesce(p_notes, '')), ''), r.id) returning id into v_order;
  for it in select * from jsonb_array_elements(p_items) loop
    v_qty := (it->>'qty')::numeric;
    if v_qty is null or v_qty <= 0 or v_qty > 100000 then raise exception 'Cantidad inválida'; end if;
    select * into pr from products where id = (it->>'product_id')::uuid and company_id = r.company_id and is_active and is_sellable and deleted_at is null;
    if not found then raise exception 'Producto no disponible'; end if;
    insert into order_items (org_id, order_id, product_id, description, qty, unit_price, tax_rate)
    values (r.org_id, v_order, pr.id, pr.name, v_qty, pr.unit_price, pr.tax_rate);
  end loop;
  perform generate_installments(v_order, p_count, p_every_days, p_first_due, false);
  update orders set status = 'confirmed' where id = v_order;
  select approval_status into v_status from orders where id = v_order;
  return jsonb_build_object('order_id', v_order, 'approval', v_status,
    'total', (select coalesce(sum(amount),0) from installments where order_id = v_order),
    'each', (select amount from installments where order_id = v_order and number = 1));
end $$;

revoke all on function public.collector_sale_mode(uuid) from public, anon;
revoke all on function public.collector_products(uuid) from public, anon;
revoke all on function public.collector_credit_sale(uuid, uuid, jsonb, integer, integer, date, text) from public, anon;
grant execute on function public.collector_sale_mode(uuid) to authenticated;
grant execute on function public.collector_products(uuid) to authenticated;
grant execute on function public.collector_credit_sale(uuid, uuid, jsonb, integer, integer, date, text) to authenticated;
