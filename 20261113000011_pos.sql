-- =====================================================================
-- Veltrix · Productos y punto de venta
--   ensure_default_warehouse(branch)   almacén principal si falta
--   save_product(...)                  alta / edición (dueño, supervisor, almacenero)
--   set_branch_stock(...)              existencia contada en una sucursal
--   products_admin(company)            lista para el dueño con stock por sucursal
--   seller_branches()                  sucursales donde el usuario puede vender
--   pos_catalog(branch)                productos vendibles con su stock
--   create_sale(branch, items, notes)  crea y confirma la venta → va a la cola de caja
--   my_sales_today(branch)             ventas del vendedor hoy y si ya se cobraron
-- Precios: el precio cargado es el precio final al cliente (tax_rate = 0 por defecto).
-- =====================================================================

create or replace function ensure_default_warehouse(p_branch uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; b branches%rowtype;
begin
  v_id := default_warehouse(p_branch);
  if v_id is not null then return v_id; end if;
  select * into b from branches where id = p_branch;
  if not found then raise exception 'Sucursal inexistente'; end if;
  insert into warehouses (org_id, company_id, branch_id, name, is_default)
  values (b.org_id, b.company_id, b.id, 'Almacén principal', true)
  returning id into v_id;
  return v_id;
end $$;

create or replace function can_manage_catalog(p_company uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select has_company_role(p_company, '{supervisor,storekeeper}');
$$;

create or replace function save_product(
  p_id uuid, p_company uuid, p_name text, p_price numeric,
  p_type product_type default 'good', p_track boolean default false,
  p_sku text default null, p_unit text default 'unid', p_active boolean default true
) returns uuid
language plpgsql security definer set search_path = public as $$
declare c companies%rowtype; v_id uuid; v_sku text;
begin
  select * into c from companies where id = p_company and deleted_at is null;
  if not found then raise exception 'Empresa inexistente'; end if;
  if not can_manage_catalog(c.id) then raise exception 'Sin permiso para editar productos'; end if;
  if not org_writable(c.org_id) then raise exception 'Cuenta suspendida: solo lectura'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Indique el nombre'; end if;
  if p_price is null or p_price < 0 then raise exception 'Precio inválido'; end if;
  if p_type not in ('good', 'service') then raise exception 'Tipo no permitido aquí'; end if;

  v_sku := nullif(upper(trim(coalesce(p_sku, ''))), '');

  if p_id is null then
    if v_sku is null then
      v_sku := 'P' || lpad((select count(*) + 1 from products where company_id = c.id)::text, 5, '0');
      while exists (select 1 from products where company_id = c.id and sku = v_sku) loop
        v_sku := 'P' || lpad((floor(random() * 99999) + 1)::int::text, 5, '0');
      end loop;
    end if;
    insert into products (org_id, company_id, sku, name, unit_price, currency, tax_rate,
                          product_type, track_stock, unit, is_active, created_by)
    values (c.org_id, c.id, v_sku, trim(p_name), round(p_price, 2), c.base_currency, 0,
            p_type, p_type = 'good' and p_track, coalesce(nullif(trim(p_unit), ''), 'unid'), p_active, auth.uid())
    returning id into v_id;
  else
    update products
       set name = trim(p_name), unit_price = round(p_price, 2), product_type = p_type,
           track_stock = p_type = 'good' and p_track,
           unit = coalesce(nullif(trim(p_unit), ''), unit), is_active = p_active,
           sku = coalesce(v_sku, sku)
     where id = p_id and company_id = c.id and deleted_at is null
    returning id into v_id;
    if v_id is null then raise exception 'Producto inexistente'; end if;
  end if;
  return v_id;
end $$;

-- Existencia contada en una sucursal (deja rastro en el kardex como ajuste)
create or replace function set_branch_stock(p_branch uuid, p_product uuid, p_qty numeric)
returns void
language plpgsql security definer set search_path = public as $$
declare v_wh uuid;
begin
  if p_qty is null or p_qty < 0 then raise exception 'Cantidad inválida'; end if;
  if not exists (select 1 from products p join branches b on b.company_id = p.company_id
                  where p.id = p_product and b.id = p_branch and p.track_stock) then
    raise exception 'Este producto no controla stock en esta sucursal';
  end if;
  v_wh := ensure_default_warehouse(p_branch);
  perform adjust_stock(v_wh, p_product, p_qty, 'Conteo desde el panel');
end $$;

create or replace function products_admin(p_company uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not can_manage_catalog(p_company) then raise exception 'Sin permiso'; end if;
  return jsonb_build_object(
    'branches', (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name) order by b.code), '[]'::jsonb)
                   from branches b where b.company_id = p_company and b.deleted_at is null and b.is_active),
    'products', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', p.id, 'sku', p.sku, 'name', p.name, 'price', p.unit_price, 'currency', p.currency,
               'type', p.product_type, 'track', p.track_stock, 'unit', p.unit, 'active', p.is_active,
               'stock', (select coalesce(jsonb_object_agg(w.branch_id, s.qty), '{}'::jsonb)
                           from stock_levels s join warehouses w on w.id = s.warehouse_id
                          where s.product_id = p.id and w.is_default))
             order by p.is_active desc, p.name), '[]'::jsonb)
        from products p
       where p.company_id = p_company and p.deleted_at is null and p.product_type in ('good', 'service'))
  );
end $$;

create or replace function seller_branches() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', b.id, 'name', b.name, 'company', c.legal_name, 'currency', c.base_currency)
         order by c.legal_name, b.code), '[]'::jsonb)
    from branches b join companies c on c.id = b.company_id
   where b.deleted_at is null and b.is_active and c.deleted_at is null and can_sell(b.id);
$$;

create or replace function pos_catalog(p_branch uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_company uuid; v_wh uuid;
begin
  if not can_sell(p_branch) then raise exception 'Sin permiso para vender en esta sucursal'; end if;
  select company_id into v_company from branches where id = p_branch;
  v_wh := default_warehouse(p_branch);
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', p.id, 'sku', p.sku, 'name', p.name, 'price', p.unit_price, 'type', p.product_type,
             'unit', p.unit,
             'stock', case when p.track_stock
                           then coalesce((select qty from stock_levels where warehouse_id = v_wh and product_id = p.id), 0)
                      end)
           order by p.name), '[]'::jsonb)
      from products p
     where p.company_id = v_company and p.is_active and p.is_sellable and p.deleted_at is null
       and p.product_type in ('good', 'service', 'combo'));
end $$;

-- Venta al contado en mostrador: queda confirmada y aparece en la cola del cajero
create or replace function create_sale(p_branch uuid, p_items jsonb, p_notes text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare b branches%rowtype; v_cur char(3); v_order uuid; v_customer uuid; it jsonb; pr products%rowtype; v_qty numeric;
begin
  select * into b from branches where id = p_branch and deleted_at is null;
  if not found then raise exception 'Sucursal inexistente'; end if;
  if not can_sell(b.id) then raise exception 'Sin permiso para vender en esta sucursal'; end if;
  if not org_writable(b.org_id) then raise exception 'Cuenta suspendida: solo lectura'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido no tiene ítems';
  end if;
  if jsonb_array_length(p_items) > 200 then raise exception 'Demasiados ítems en un solo pedido'; end if;

  select base_currency into v_cur from companies where id = b.company_id;
  v_customer := walk_in_customer(b.id);
  perform ensure_default_warehouse(b.id);

  insert into orders (branch_id, customer_id, vendor_id, payment_condition, currency, order_type, notes)
  values (b.id, v_customer, auth.uid(), 'cash', v_cur, 'counter', nullif(trim(coalesce(p_notes, '')), ''))
  returning id into v_order;

  for it in select * from jsonb_array_elements(p_items) loop
    v_qty := (it->>'qty')::numeric;
    if v_qty is null or v_qty <= 0 or v_qty > 100000 then raise exception 'Cantidad inválida'; end if;
    select * into pr from products
     where id = (it->>'product_id')::uuid and company_id = b.company_id
       and is_active and is_sellable and deleted_at is null;
    if not found then raise exception 'Producto no disponible'; end if;
    insert into order_items (org_id, order_id, product_id, description, qty, unit_price, tax_rate)
    values (b.org_id, v_order, pr.id, pr.name, v_qty, pr.unit_price, pr.tax_rate);
  end loop;

  update orders set status = 'confirmed' where id = v_order;   -- calcula totales, cuota y stock
  return v_order;
end $$;

create or replace function my_sales_today(p_branch uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', o.id, 'at', o.confirmed_at, 'total', o.total_amount, 'currency', o.currency,
           'items', (select count(*) from order_items i where i.order_id = o.id),
           'paid', o.total_amount - coalesce((select sum(installment_paid(i.id)) from installments i where i.order_id = o.id), 0) <= 0)
         order by o.confirmed_at desc), '[]'::jsonb)
    from orders o
   where o.vendor_id = auth.uid() and o.branch_id = p_branch and o.status = 'confirmed'
     and o.confirmed_at >= (branch_today(p_branch)::timestamp at time zone (select timezone from branches where id = p_branch));
$$;

revoke execute on function ensure_default_warehouse(uuid), can_manage_catalog(uuid),
  save_product(uuid, uuid, text, numeric, product_type, boolean, text, text, boolean),
  set_branch_stock(uuid, uuid, numeric), products_admin(uuid), seller_branches(),
  pos_catalog(uuid), create_sale(uuid, jsonb, text), my_sales_today(uuid) from public, anon;
revoke execute on function ensure_default_warehouse(uuid) from authenticated;
grant execute on function can_manage_catalog(uuid),
  save_product(uuid, uuid, text, numeric, product_type, boolean, text, text, boolean),
  set_branch_stock(uuid, uuid, numeric), products_admin(uuid), seller_branches(),
  pos_catalog(uuid), create_sale(uuid, jsonb, text), my_sales_today(uuid) to authenticated;
grant execute on function ensure_default_warehouse(uuid), can_manage_catalog(uuid),
  save_product(uuid, uuid, text, numeric, product_type, boolean, text, text, boolean),
  set_branch_stock(uuid, uuid, numeric), products_admin(uuid), seller_branches(),
  pos_catalog(uuid), create_sale(uuid, jsonb, text), my_sales_today(uuid) to service_role;
