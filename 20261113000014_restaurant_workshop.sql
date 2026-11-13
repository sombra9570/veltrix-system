-- =====================================================================
-- Veltrix · Herramientas por rubro: Restaurante y Taller
--   Restaurante: mesas, comanda por mesa, pantalla de cocina, cuenta → caja
--   Taller: órdenes de trabajo con vehículo/equipo, repuestos y mano de obra → caja
-- =====================================================================

-- Módulos activos de mi organización (para mostrar solo las herramientas del rubro)
create or replace function my_modules() returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(m.module order by m.module), '{}')
    from org_modules m
   where m.enabled and m.org_id = (select org_id from profiles where id = auth.uid());
$$;

-- =====================================================================
-- RESTAURANTE
-- =====================================================================
create or replace function can_serve_tables(p_branch uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_branch_manager(p_branch) or has_branch_role(p_branch, '{waiter,cashier}');
$$;

-- Configuración: áreas y mesas (dueño / supervisor)
create or replace function save_table(p_id uuid, p_branch uuid, p_name text, p_seats int default 4,
                                      p_area text default null, p_active boolean default true)
returns uuid
language plpgsql security definer set search_path = public as $$
declare b branches%rowtype; v_area uuid; v_id uuid;
begin
  select * into b from branches where id = p_branch and deleted_at is null;
  if not found or not is_branch_manager(b.id) then raise exception 'Sin permiso'; end if;
  if not org_writable(b.org_id) then raise exception 'Cuenta suspendida: solo lectura'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Indique el nombre'; end if;
  if nullif(trim(coalesce(p_area, '')), '') is not null then
    select id into v_area from dining_areas where branch_id = b.id and lower(name) = lower(trim(p_area));
    if v_area is null then
      insert into dining_areas (org_id, company_id, branch_id, name) values (b.org_id, b.company_id, b.id, trim(p_area))
      returning id into v_area;
    end if;
  end if;
  if p_id is null then
    insert into dining_tables (org_id, company_id, branch_id, area_id, name, seats, is_active)
    values (b.org_id, b.company_id, b.id, v_area, trim(p_name), greatest(coalesce(p_seats, 4), 1), p_active)
    returning id into v_id;
  else
    update dining_tables set name = trim(p_name), seats = greatest(coalesce(p_seats, 4), 1), area_id = v_area, is_active = p_active
     where id = p_id and branch_id = b.id returning id into v_id;
    if v_id is null then raise exception 'Mesa inexistente'; end if;
  end if;
  return v_id;
end $$;

-- Productos que pasan por cocina (o barra)
create or replace function set_product_station(p_product uuid, p_station text) returns void
language plpgsql security definer set search_path = public as $$
declare v_company uuid;
begin
  select company_id into v_company from products where id = p_product and deleted_at is null;
  if v_company is null or not can_manage_catalog(v_company) then raise exception 'Sin permiso'; end if;
  update products set kitchen_station = nullif(trim(coalesce(p_station, '')), '') where id = p_product;
end $$;

-- Tablero de mesas (mesero, cajero, dueño)
create or replace function tables_board(p_branch uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not can_serve_tables(p_branch) then raise exception 'Sin permiso'; end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', t.id, 'name', t.name, 'seats', t.seats, 'area', a.name, 'active', t.is_active,
             'order_id', o.id, 'guests', o.guests, 'opened_at', o.created_at,
             'waiter', (select full_name from profiles where id = o.vendor_id),
             'total', coalesce((select sum(line_total) from order_items where order_id = o.id and kitchen_status is distinct from 'cancelled'), 0),
             'ready', (select count(*) from order_items where order_id = o.id and kitchen_status = 'ready'),
             'cooking', (select count(*) from order_items where order_id = o.id and kitchen_status in ('pending','preparing')))
           order by a.name nulls first, t.name), '[]'::jsonb)
      from dining_tables t
      left join dining_areas a on a.id = t.area_id
      left join orders o on o.table_id = t.id and o.status = 'draft'
     where t.branch_id = p_branch);
end $$;

create or replace function open_table_order(p_table uuid, p_guests int default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare t dining_tables%rowtype; v_id uuid; v_cur char(3);
begin
  select * into t from dining_tables where id = p_table and is_active;
  if not found then raise exception 'Mesa inexistente'; end if;
  if not can_serve_tables(t.branch_id) then raise exception 'Sin permiso'; end if;
  if not org_writable(t.org_id) then raise exception 'Cuenta suspendida: solo lectura'; end if;
  select id into v_id from orders where table_id = p_table and status = 'draft';
  if v_id is not null then return v_id; end if;
  select base_currency into v_cur from companies where id = t.company_id;
  perform ensure_default_warehouse(t.branch_id);
  insert into orders (branch_id, customer_id, vendor_id, payment_condition, currency, order_type, table_id, guests)
  values (t.branch_id, walk_in_customer(t.branch_id), auth.uid(), 'cash', v_cur, 'dine_in', t.id,
          case when p_guests > 0 then p_guests end)
  returning id into v_id;
  return v_id;
end $$;

create or replace function table_order(p_order uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare o orders%rowtype;
begin
  select * into o from orders where id = p_order;
  if not found or not can_serve_tables(o.branch_id) then raise exception 'Sin permiso'; end if;
  return jsonb_build_object(
    'id', o.id, 'status', o.status, 'guests', o.guests, 'currency', o.currency,
    'table', (select name from dining_tables where id = o.table_id),
    'items', (select coalesce(jsonb_agg(jsonb_build_object(
                'id', i.id, 'description', i.description, 'qty', i.qty, 'price', i.unit_price,
                'total', i.line_total, 'notes', i.notes, 'kitchen', i.kitchen_status) order by i.created_at), '[]'::jsonb)
                from order_items i where i.order_id = o.id and i.kitchen_status is distinct from 'cancelled'));
end $$;

-- Agrega ítems a la comanda; los que van a cocina entran como "pendiente"
create or replace function add_table_items(p_order uuid, p_items jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare o orders%rowtype; it jsonb; pr products%rowtype; v_qty numeric;
begin
  select * into o from orders where id = p_order for update;
  if not found or o.status <> 'draft' or o.order_type <> 'dine_in' then raise exception 'La cuenta ya está cerrada'; end if;
  if not can_serve_tables(o.branch_id) then raise exception 'Sin permiso'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido no tiene ítems';
  end if;
  for it in select * from jsonb_array_elements(p_items) loop
    v_qty := (it->>'qty')::numeric;
    if v_qty is null or v_qty <= 0 or v_qty > 1000 then raise exception 'Cantidad inválida'; end if;
    select * into pr from products
     where id = (it->>'product_id')::uuid and company_id = o.company_id and is_active and is_sellable and deleted_at is null;
    if not found then raise exception 'Producto no disponible'; end if;
    insert into order_items (org_id, order_id, product_id, description, qty, unit_price, tax_rate, notes)
    values (o.org_id, o.id, pr.id, pr.name, v_qty, pr.unit_price, pr.tax_rate,
            nullif(left(trim(coalesce(it->>'notes', '')), 200), ''));
  end loop;
end $$;

-- Quita un ítem: si cocina aún no lo empezó se borra; si ya empezó se marca anulado
create or replace function remove_table_item(p_item uuid) returns void
language plpgsql security definer set search_path = public as $$
declare i order_items%rowtype; o orders%rowtype;
begin
  select * into i from order_items where id = p_item;
  if not found then raise exception 'Ítem inexistente'; end if;
  select * into o from orders where id = i.order_id;
  if o.status <> 'draft' then raise exception 'La cuenta ya está cerrada'; end if;
  if not (is_branch_manager(o.branch_id) or has_branch_role(o.branch_id, '{waiter}')) then raise exception 'Sin permiso'; end if;
  if i.kitchen_status is null or i.kitchen_status = 'pending' then
    delete from order_items where id = i.id;
  else
    update order_items set kitchen_status = 'cancelled' where id = i.id;
  end if;
end $$;

-- Cierra la cuenta: queda confirmada y aparece en la caja para cobrar; la mesa se libera
create or replace function close_table(p_order uuid, p_tip numeric default 0) returns void
language plpgsql security definer set search_path = public as $$
declare o orders%rowtype;
begin
  select * into o from orders where id = p_order for update;
  if not found or o.status <> 'draft' then raise exception 'La cuenta ya está cerrada'; end if;
  if not can_serve_tables(o.branch_id) then raise exception 'Sin permiso'; end if;
  if coalesce(p_tip, 0) < 0 then raise exception 'Propina inválida'; end if;
  update orders set tip_amount = round(coalesce(p_tip, 0), 2), status = 'confirmed' where id = o.id;
end $$;

-- Para el dueño: qué productos van a cocina
create or replace function kitchen_products(p_company uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not can_manage_catalog(p_company) then raise exception 'Sin permiso'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'station', kitchen_station) order by name), '[]'::jsonb)
            from products where company_id = p_company and deleted_at is null and is_active and product_type in ('good','combo'));
end $$;

-- =====================================================================
-- TALLER
-- =====================================================================
create or replace function can_work_shop(p_branch uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_branch_manager(p_branch) or has_branch_role(p_branch, '{technician}');
$$;

create or replace function workshop_board(p_branch uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not can_work_shop(p_branch) then raise exception 'Sin permiso'; end if;
  return jsonb_build_object(
    'technicians', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name) order by p.full_name), '[]'::jsonb)
                      from memberships m join profiles p on p.id = m.user_id
                     where m.branch_id = p_branch and m.role = 'technician' and m.is_active and m.deleted_at is null),
    'orders', (select coalesce(jsonb_agg(jsonb_build_object(
                 'id', w.id, 'status', w.status, 'problem', w.problem_reported, 'received_at', w.received_at,
                 'promised_at', w.promised_at, 'customer', c.name, 'phone', c.phone,
                 'asset', trim(concat_ws(' ', a.brand, a.model, a.identifier)), 'kind', a.kind,
                 'technician', (select full_name from profiles where id = w.technician_id),
                 'total', coalesce((select sum(line_total) from order_items where order_id = o.id), 0),
                 'invoiced', o.status = 'confirmed',
                 'paid', o.status = 'confirmed' and o.total_amount - coalesce((select sum(installment_paid(i.id)) from installments i where i.order_id = o.id), 0) <= 0)
               order by w.received_at desc), '[]'::jsonb)
                 from work_orders w
                 join orders o on o.id = w.order_id
                 join customers c on c.id = o.customer_id
                 left join assets a on a.id = w.asset_id
                where w.branch_id = p_branch
                  and (w.status not in ('delivered','cancelled') or w.updated_at > now() - interval '7 days'))
  );
end $$;

create or replace function wo_create(
  p_branch uuid, p_customer uuid, p_customer_name text, p_customer_phone text,
  p_kind asset_kind, p_brand text, p_model text, p_identifier text,
  p_problem text, p_technician uuid default null, p_promised_at timestamptz default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare b branches%rowtype; v_cust uuid; v_asset uuid; v_order uuid; v_wo uuid; v_cur char(3);
begin
  select * into b from branches where id = p_branch and deleted_at is null;
  if not found or not can_work_shop(b.id) then raise exception 'Sin permiso'; end if;
  if not org_writable(b.org_id) then raise exception 'Cuenta suspendida: solo lectura'; end if;
  if coalesce(trim(p_problem), '') = '' then raise exception 'Describa el problema'; end if;
  if p_technician is not null then perform assert_staff(p_technician, b.id, 'technician'); end if;

  if p_customer is not null then
    select id into v_cust from customers where id = p_customer and branch_id = b.id and not is_walk_in and deleted_at is null;
    if v_cust is null then raise exception 'Cliente inexistente'; end if;
  else
    if coalesce(trim(p_customer_name), '') = '' then raise exception 'Indique el cliente'; end if;
    insert into customers (branch_id, name, phone, created_by)
    values (b.id, trim(p_customer_name), nullif(trim(coalesce(p_customer_phone, '')), ''), auth.uid())
    returning id into v_cust;
  end if;

  if coalesce(trim(p_brand), '') <> '' or coalesce(trim(p_model), '') <> '' or coalesce(trim(p_identifier), '') <> '' then
    insert into assets (org_id, company_id, branch_id, customer_id, kind, brand, model, identifier)
    values (b.org_id, b.company_id, b.id, v_cust, coalesce(p_kind, 'other'),
            nullif(trim(coalesce(p_brand, '')), ''), nullif(trim(coalesce(p_model, '')), ''),
            nullif(upper(trim(coalesce(p_identifier, ''))), ''))
    returning id into v_asset;
  end if;

  select base_currency into v_cur from companies where id = b.company_id;
  perform ensure_default_warehouse(b.id);
  insert into orders (branch_id, customer_id, vendor_id, payment_condition, currency, order_type)
  values (b.id, v_cust, auth.uid(), 'cash', v_cur, 'work_order') returning id into v_order;
  insert into work_orders (branch_id, order_id, asset_id, technician_id, problem_reported, promised_at)
  values (b.id, v_order, v_asset, p_technician, trim(p_problem), p_promised_at) returning id into v_wo;
  return v_wo;
end $$;

create or replace function wo_detail(p_wo uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare w work_orders%rowtype; o orders%rowtype;
begin
  select * into w from work_orders where id = p_wo;
  if not found or not can_work_shop(w.branch_id) then raise exception 'Sin permiso'; end if;
  select * into o from orders where id = w.order_id;
  return jsonb_build_object(
    'id', w.id, 'branch_id', w.branch_id, 'status', w.status, 'problem', w.problem_reported, 'diagnosis', w.diagnosis,
    'received_at', w.received_at, 'promised_at', w.promised_at, 'delivered_at', w.delivered_at,
    'technician_id', w.technician_id, 'currency', o.currency, 'invoiced', o.status = 'confirmed',
    'total', case when o.status = 'confirmed' then o.total_amount
                  else coalesce((select sum(line_total) from order_items where order_id = o.id), 0) end,
    'paid', o.status = 'confirmed' and o.total_amount - coalesce((select sum(installment_paid(i.id)) from installments i where i.order_id = o.id), 0) <= 0,
    'customer', (select jsonb_build_object('name', c.name, 'phone', c.phone) from customers c where c.id = o.customer_id),
    'asset', (select jsonb_build_object('kind', a.kind, 'brand', a.brand, 'model', a.model, 'identifier', a.identifier) from assets a where a.id = w.asset_id),
    'lines', (select coalesce(jsonb_agg(jsonb_build_object(
                'id', i.id, 'kind', i.item_kind, 'description', i.description, 'qty', i.qty,
                'price', i.unit_price, 'total', i.line_total) order by i.created_at), '[]'::jsonb)
                from order_items i where i.order_id = o.id));
end $$;

-- Línea de repuesto (producto del inventario) o de mano de obra (texto + precio)
create or replace function wo_add_line(p_wo uuid, p_product uuid, p_description text, p_qty numeric, p_price numeric)
returns void
language plpgsql security definer set search_path = public as $$
declare w work_orders%rowtype; o orders%rowtype; pr products%rowtype;
begin
  select * into w from work_orders where id = p_wo;
  if not found or not can_work_shop(w.branch_id) then raise exception 'Sin permiso'; end if;
  select * into o from orders where id = w.order_id;
  if o.status <> 'draft' then raise exception 'La orden ya fue facturada'; end if;
  if p_qty is null or p_qty <= 0 or p_qty > 10000 then raise exception 'Cantidad inválida'; end if;
  if p_product is not null then
    select * into pr from products where id = p_product and company_id = o.company_id and is_active and deleted_at is null;
    if not found then raise exception 'Producto no disponible'; end if;
    insert into order_items (org_id, order_id, product_id, description, qty, unit_price, tax_rate, item_kind)
    values (o.org_id, o.id, pr.id, pr.name, p_qty, coalesce(p_price, pr.unit_price), pr.tax_rate,
            case when pr.product_type = 'service' then 'service' else 'product' end);
  else
    if coalesce(trim(p_description), '') = '' then raise exception 'Describa el trabajo'; end if;
    if p_price is null or p_price < 0 then raise exception 'Precio inválido'; end if;
    insert into order_items (org_id, order_id, description, qty, unit_price, tax_rate, item_kind, technician_id)
    values (o.org_id, o.id, left(trim(p_description), 200), p_qty, round(p_price, 2), 0, 'labor', w.technician_id);
  end if;
end $$;

create or replace function wo_remove_line(p_item uuid) returns void
language plpgsql security definer set search_path = public as $$
declare i order_items%rowtype; w work_orders%rowtype;
begin
  select * into i from order_items where id = p_item;
  if not found then raise exception 'Ítem inexistente'; end if;
  select * into w from work_orders where order_id = i.order_id;
  if not found or not can_work_shop(w.branch_id) then raise exception 'Sin permiso'; end if;
  delete from order_items where id = i.id;   -- guard_draft_children impide borrar si ya se facturó
end $$;

create or replace function wo_update(p_wo uuid, p_status work_order_status, p_diagnosis text, p_technician uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare w work_orders%rowtype;
begin
  select * into w from work_orders where id = p_wo;
  if not found or not can_work_shop(w.branch_id) then raise exception 'Sin permiso'; end if;
  if p_technician is not null then perform assert_staff(p_technician, w.branch_id, 'technician'); end if;
  update work_orders set technician_id = p_technician, updated_at = now() where id = w.id;
  perform set_work_order_status(w.id, coalesce(p_status, w.status), nullif(trim(coalesce(p_diagnosis, '')), ''));
end $$;

-- Factura la orden: queda confirmada y aparece en la caja para cobrar
create or replace function wo_invoice(p_wo uuid) returns void
language plpgsql security definer set search_path = public as $$
declare w work_orders%rowtype;
begin
  select * into w from work_orders where id = p_wo;
  if not found or not can_work_shop(w.branch_id) then raise exception 'Sin permiso'; end if;
  update orders set status = 'confirmed' where id = w.order_id and status = 'draft';
  if not found then raise exception 'La orden ya fue facturada'; end if;
  if w.status not in ('done','delivered') then
    update work_orders set status = 'done', updated_at = now() where id = w.id;
  end if;
end $$;

revoke execute on function my_modules(), can_serve_tables(uuid), save_table(uuid, uuid, text, int, text, boolean),
  set_product_station(uuid, text), tables_board(uuid), open_table_order(uuid, int), table_order(uuid),
  add_table_items(uuid, jsonb), remove_table_item(uuid), close_table(uuid, numeric), kitchen_products(uuid),
  can_work_shop(uuid), workshop_board(uuid),
  wo_create(uuid, uuid, text, text, asset_kind, text, text, text, text, uuid, timestamptz),
  wo_detail(uuid), wo_add_line(uuid, uuid, text, numeric, numeric), wo_remove_line(uuid),
  wo_update(uuid, work_order_status, text, uuid), wo_invoice(uuid) from public, anon;
grant execute on function my_modules(), can_serve_tables(uuid), save_table(uuid, uuid, text, int, text, boolean),
  set_product_station(uuid, text), tables_board(uuid), open_table_order(uuid, int), table_order(uuid),
  add_table_items(uuid, jsonb), remove_table_item(uuid), close_table(uuid, numeric), kitchen_products(uuid),
  can_work_shop(uuid), workshop_board(uuid),
  wo_create(uuid, uuid, text, text, asset_kind, text, text, text, text, uuid, timestamptz),
  wo_detail(uuid), wo_add_line(uuid, uuid, text, numeric, numeric), wo_remove_line(uuid),
  wo_update(uuid, work_order_status, text, uuid), wo_invoice(uuid) to authenticated, service_role;
