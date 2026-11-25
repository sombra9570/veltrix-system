alter table branches add column if not exists delivery_enabled boolean not null default false;

create table if not exists delivery_zones (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  branch_id uuid not null references branches(id),
  name text not null,
  fee numeric(12,2) not null default 0 check (fee >= 0),
  free_over numeric(12,2) check (free_over is null or free_over > 0),
  eta_min int not null default 40 check (eta_min between 5 and 240),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists delivery_zones_branch_idx on delivery_zones (branch_id);
alter table delivery_zones enable row level security;
revoke all on delivery_zones from anon, authenticated;

create table if not exists delivery_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  branch_id uuid not null references branches(id),
  zone_id uuid references delivery_zones(id),
  zone_name text,
  items jsonb not null,
  customer_name text not null,
  phone text not null,
  address text not null,
  reference text,
  lat numeric(9,6),
  lng numeric(9,6),
  notes text,
  pay_pref text not null default 'cash' check (pay_pref in ('qr','cash')),
  subtotal numeric(12,2) not null default 0,
  fee numeric(12,2) not null default 0,
  eta_min int,
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  reject_reason text,
  order_id uuid references orders(id),
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists delivery_requests_branch_idx on delivery_requests (branch_id, status, created_at desc);
create index if not exists delivery_requests_phone_idx on delivery_requests (phone, created_at desc);
alter table delivery_requests enable row level security;
revoke all on delivery_requests from anon, authenticated;

create table if not exists delivery_assignments (
  order_id uuid primary key references orders(id),
  org_id uuid not null references organizations(id) on delete cascade,
  branch_id uuid not null references branches(id),
  driver_id uuid not null,
  taken_at timestamptz not null default now()
);
alter table delivery_assignments enable row level security;
revoke all on delivery_assignments from anon, authenticated;

-- Información pública del delivery de una tienda
create or replace function public_delivery_info(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s stores%rowtype; b branches%rowtype;
begin
  select * into s from stores where slug = lower(trim(p_slug)) and is_published;
  if not found or not org_writable(s.org_id) then return jsonb_build_object('enabled', false); end if;
  select * into b from branches where id = s.branch_id;
  if not coalesce(b.delivery_enabled, false) then return jsonb_build_object('enabled', false); end if;
  return jsonb_build_object('enabled', true, 'zones', coalesce((
    select jsonb_agg(jsonb_build_object('id', z.id, 'name', z.name, 'fee', z.fee, 'free_over', z.free_over, 'eta_min', z.eta_min) order by z.name)
      from delivery_zones z where z.branch_id = s.branch_id and z.is_active), '[]'::jsonb));
end $$;

-- El cliente pide delivery desde el link público (sin sesión)
create or replace function public_delivery_order(p_slug text, p_items jsonb, p_zone uuid, p_name text, p_phone text,
  p_address text, p_reference text, p_lat numeric, p_lng numeric, p_notes text, p_pay text)
returns uuid language plpgsql security definer set search_path = public as $$
declare s stores%rowtype; b branches%rowtype; z delivery_zones%rowtype; it jsonb; pr products%rowtype; v_qty numeric;
        v_clean jsonb := '[]'::jsonb; v_wh uuid; v_stock numeric; v_sub numeric := 0; v_fee numeric; v_phone text; v_id uuid;
begin
  select * into s from stores where slug = lower(trim(p_slug)) and is_published;
  if not found or not org_writable(s.org_id) then raise exception 'STORE_INVALID'; end if;
  select * into b from branches where id = s.branch_id;
  if not coalesce(b.delivery_enabled, false) then raise exception 'DELIVERY_OFF'; end if;
  select * into z from delivery_zones where id = p_zone and branch_id = s.branch_id and is_active;
  if not found then raise exception 'ZONE_INVALID'; end if;
  v_phone := regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g');
  if length(v_phone) < 6 or length(v_phone) > 16 then raise exception 'PHONE_INVALID'; end if;
  if length(trim(coalesce(p_name, ''))) < 2 or length(trim(coalesce(p_address, ''))) < 5 then raise exception 'DATA_INVALID'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 40 then
    raise exception 'ITEMS_INVALID';
  end if;
  if (select count(*) from delivery_requests where branch_id = s.branch_id and status = 'pending') >= 40
     or (select count(*) from delivery_requests where phone = v_phone and status = 'pending') >= 3
     or (select count(*) from delivery_requests where phone = v_phone and created_at > now() - interval '1 hour') >= 6 then
    raise exception 'TOO_MANY_REQUESTS';
  end if;
  v_wh := default_warehouse(s.branch_id);
  for it in select * from jsonb_array_elements(p_items) loop
    v_qty := (it->>'qty')::numeric;
    if v_qty is null or v_qty <= 0 or v_qty > 30 or v_qty <> trunc(v_qty) then raise exception 'ITEMS_INVALID'; end if;
    select * into pr from products
     where id = (it->>'product_id')::uuid and company_id = s.company_id and in_store and is_active and is_sellable and deleted_at is null;
    if not found then raise exception 'PRODUCT_UNAVAILABLE'; end if;
    if pr.track_stock then
      select coalesce(qty, 0) into v_stock from stock_levels where warehouse_id = v_wh and product_id = pr.id;
      if coalesce(v_stock, 0) < v_qty then raise exception 'PRODUCT_UNAVAILABLE'; end if;
    end if;
    v_sub := v_sub + pr.unit_price * v_qty;
    v_clean := v_clean || jsonb_build_array(jsonb_build_object(
      'product_id', pr.id, 'qty', v_qty, 'notes', nullif(left(trim(coalesce(it->>'notes', '')), 200), '')));
  end loop;
  v_fee := case when z.free_over is not null and v_sub >= z.free_over then 0 else z.fee end;
  insert into delivery_requests (org_id, branch_id, zone_id, zone_name, items, customer_name, phone, address, reference, lat, lng,
                                 notes, pay_pref, subtotal, fee, eta_min)
  values (s.org_id, s.branch_id, z.id, z.name, v_clean, left(trim(p_name), 60), v_phone, left(trim(p_address), 200),
          nullif(left(trim(coalesce(p_reference, '')), 150), ''),
          case when p_lat between -90 and 90 then round(p_lat, 6) end, case when p_lng between -180 and 180 then round(p_lng, 6) end,
          nullif(left(trim(coalesce(p_notes, '')), 300), ''), case when p_pay = 'qr' then 'qr' else 'cash' end, round(v_sub, 2), v_fee, z.eta_min)
  returning id into v_id;
  return v_id;
end $$;

-- Seguimiento para el cliente: solo con el id (no adivinable) de su pedido
create or replace function public_delivery_status(p_request uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r delivery_requests%rowtype; v_ds text;
begin
  select * into r from delivery_requests where id = p_request;
  if not found then return null; end if;
  if r.order_id is not null then select delivery_status::text into v_ds from orders where id = r.order_id; end if;
  return jsonb_build_object('status', r.status, 'reject_reason', r.reject_reason, 'subtotal', r.subtotal, 'fee', r.fee,
    'total', r.subtotal + r.fee, 'eta_min', r.eta_min, 'zone', r.zone_name, 'delivery_status', v_ds);
end $$;

-- Pedidos de delivery esperando respuesta
create or replace function delivery_requests_list(p_branch uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not can_serve_tables(p_branch) then raise exception 'PERM_DENIED'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'at', r.created_at, 'customer', r.customer_name, 'phone', r.phone, 'address', r.address, 'reference', r.reference,
      'lat', r.lat, 'lng', r.lng, 'notes', r.notes, 'pay_pref', r.pay_pref, 'zone', r.zone_name, 'fee', r.fee, 'eta_min', r.eta_min,
      'subtotal', r.subtotal,
      'items', (select coalesce(jsonb_agg(jsonb_build_object('name', pr.name, 'qty', (i->>'qty')::numeric, 'notes', i->>'notes') order by pr.name), '[]'::jsonb)
                  from jsonb_array_elements(r.items) i join products pr on pr.id = (i->>'product_id')::uuid)) order by r.created_at)
    from delivery_requests r where r.branch_id = p_branch and r.status = 'pending'), '[]'::jsonb);
end $$;

-- Aceptar: crea el pedido confirmado de delivery (cocina + inventario) con el costo de envío; o rechazar.
create or replace function delivery_request_resolve(p_request uuid, p_accept boolean, p_reason text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare r delivery_requests%rowtype; v_order uuid; v_org uuid; v_comp uuid; v_cur char(3); it jsonb; pr products%rowtype;
        v_fee_prod uuid; v_notes text;
begin
  select * into r from delivery_requests where id = p_request for update;
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
  if not can_serve_tables(r.branch_id) then raise exception 'PERM_DENIED'; end if;
  if r.status <> 'pending' then raise exception 'REQUEST_NOT_PENDING'; end if;
  if not p_accept then
    update delivery_requests set status = 'rejected', reject_reason = nullif(left(trim(coalesce(p_reason, '')), 200), ''),
           resolved_by = auth.uid(), resolved_at = now() where id = r.id;
    return null;
  end if;
  select b.org_id, b.company_id into v_org, v_comp from branches b where b.id = r.branch_id;
  if not org_writable(v_org) then raise exception 'Cuenta suspendida: solo lectura'; end if;
  select base_currency into v_cur from companies where id = v_comp;
  perform ensure_default_warehouse(r.branch_id);
  v_notes := concat_ws(' · ', 'Delivery: ' || r.customer_name, 'Tel ' || r.phone, r.zone_name,
                       case when r.reference is not null then 'Ref: ' || r.reference end,
                       case when r.lat is not null then 'https://maps.google.com/?q=' || r.lat || ',' || r.lng end, r.notes);
  insert into orders (branch_id, customer_id, vendor_id, payment_condition, currency, order_type, delivery_address, notes)
  values (r.branch_id, walk_in_customer(r.branch_id), auth.uid(), 'cash', v_cur, 'delivery', r.address, v_notes)
  returning id into v_order;
  for it in select * from jsonb_array_elements(r.items) loop
    select * into pr from products where id = (it->>'product_id')::uuid and company_id = v_comp and is_active and is_sellable and deleted_at is null;
    if not found then raise exception 'PRODUCT_UNAVAILABLE'; end if;
    insert into order_items (org_id, order_id, product_id, description, qty, unit_price, tax_rate, notes)
    values (v_org, v_order, pr.id, pr.name, (it->>'qty')::numeric, pr.unit_price, pr.tax_rate, nullif(it->>'notes', ''));
  end loop;
  if r.fee > 0 then
    select id into v_fee_prod from products where company_id = v_comp and sku = 'ENVIO-DELIVERY' and deleted_at is null;
    if v_fee_prod is null then
      insert into products (org_id, company_id, sku, name, unit_price, currency, product_type, is_sellable, in_store)
      values (v_org, v_comp, 'ENVIO-DELIVERY', 'Envío (delivery)', 0, v_cur, 'service', false, false) returning id into v_fee_prod;
    end if;
    insert into order_items (org_id, order_id, product_id, description, qty, unit_price, tax_rate)
    values (v_org, v_order, v_fee_prod, 'Envío (delivery)', 1, r.fee, 0);
  end if;
  update orders set status = 'confirmed' where id = v_order;
  update delivery_requests set status = 'accepted', order_id = v_order, resolved_by = auth.uid(), resolved_at = now() where id = r.id;
  return v_order;
end $$;

-- Entregas del local: pendientes/en camino (o ya entregadas). El repartidor ve las libres y las suyas.
create or replace function delivery_orders_list(p_branch uuid, p_done boolean default false) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_mgr boolean;
begin
  v_mgr := can_serve_tables(p_branch);
  if not v_mgr and not has_branch_role(p_branch, '{delivery}') then raise exception 'PERM_DENIED'; end if;
  return coalesce((
    select jsonb_agg(x order by (x->>'at') desc) from (
      select jsonb_build_object(
        'id', o.id, 'at', coalesce(o.confirmed_at, o.created_at), 'address', o.delivery_address, 'notes', o.notes,
        'status', o.delivery_status, 'total', o.total_amount, 'currency', o.currency,
        'paid', coalesce((select sum(pa.amount) from payment_allocations pa join installments i on i.id = pa.installment_id where i.order_id = o.id), 0),
        'driver', (select pf.full_name from delivery_assignments da join profiles pf on pf.id = da.driver_id where da.order_id = o.id),
        'mine', exists (select 1 from delivery_assignments da where da.order_id = o.id and da.driver_id = auth.uid()),
        'eta_min', (select dr.eta_min from delivery_requests dr where dr.order_id = o.id),
        'items', (select coalesce(jsonb_agg(jsonb_build_object('description', oi.description, 'qty', oi.qty) order by oi.created_at), '[]'::jsonb)
                    from order_items oi where oi.order_id = o.id and oi.kitchen_status is distinct from 'cancelled' and oi.description <> 'Envío (delivery)')) x
        from orders o
       where o.branch_id = p_branch and o.order_type = 'delivery' and o.status = 'confirmed' and o.deleted_at is null
         and ((not p_done and o.delivery_status in ('pending', 'dispatched')) or (p_done and o.delivery_status in ('delivered', 'failed')))
         and (v_mgr or o.delivery_status = 'pending' or exists (select 1 from delivery_assignments da where da.order_id = o.id and da.driver_id = auth.uid()))
       limit 100) t), '[]'::jsonb);
end $$;

-- Tomar (en camino), entregar o marcar fallida
create or replace function delivery_set_status(p_order uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare o orders%rowtype; v_mgr boolean; v_mine boolean;
begin
  select * into o from orders where id = p_order for update;
  if not found or o.order_type <> 'delivery' or o.status <> 'confirmed' then raise exception 'DELIVERY_INVALID'; end if;
  v_mgr := can_serve_tables(o.branch_id);
  if not v_mgr and not has_branch_role(o.branch_id, '{delivery}') then raise exception 'PERM_DENIED'; end if;
  select exists (select 1 from delivery_assignments where order_id = o.id and driver_id = auth.uid()) into v_mine;
  if p_status = 'dispatched' then
    if o.delivery_status <> 'pending' then raise exception 'DELIVERY_TAKEN'; end if;
    insert into delivery_assignments (order_id, org_id, branch_id, driver_id) values (o.id, o.org_id, o.branch_id, auth.uid())
      on conflict (order_id) do nothing;
    update orders set delivery_status = 'dispatched' where id = o.id;
  elsif p_status in ('delivered', 'failed') then
    if o.delivery_status <> 'dispatched' then raise exception 'DELIVERY_INVALID'; end if;
    if not v_mine and not is_branch_manager(o.branch_id) then raise exception 'PERM_DENIED'; end if;
    update orders set delivery_status = p_status::delivery_status where id = o.id;
  else
    raise exception 'DELIVERY_INVALID';
  end if;
end $$;

-- Administración: activar delivery y manejar zonas
create or replace function delivery_admin(p_branch uuid, p_enabled boolean default null, p_zone jsonb default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare b branches%rowtype; v_id uuid;
begin
  select * into b from branches where id = p_branch and deleted_at is null;
  if not found or not is_branch_manager(p_branch) then raise exception 'PERM_DENIED'; end if;
  if not org_writable(b.org_id) then raise exception 'Cuenta suspendida: solo lectura'; end if;
  if p_enabled is not null then update branches set delivery_enabled = p_enabled where id = p_branch; end if;
  if p_zone is not null then
    if coalesce(trim(p_zone->>'name'), '') = '' then raise exception 'Indique el nombre de la zona'; end if;
    v_id := nullif(p_zone->>'id', '')::uuid;
    if v_id is null then
      insert into delivery_zones (org_id, branch_id, name, fee, free_over, eta_min, is_active)
      values (b.org_id, b.id, left(trim(p_zone->>'name'), 60), greatest(coalesce((p_zone->>'fee')::numeric, 0), 0),
              nullif((p_zone->>'free_over')::numeric, 0), least(greatest(coalesce((p_zone->>'eta_min')::int, 40), 5), 240),
              coalesce((p_zone->>'active')::boolean, true));
    else
      update delivery_zones set name = left(trim(p_zone->>'name'), 60), fee = greatest(coalesce((p_zone->>'fee')::numeric, 0), 0),
             free_over = nullif((p_zone->>'free_over')::numeric, 0), eta_min = least(greatest(coalesce((p_zone->>'eta_min')::int, 40), 5), 240),
             is_active = coalesce((p_zone->>'active')::boolean, true)
       where id = v_id and branch_id = b.id;
    end if;
  end if;
  return jsonb_build_object(
    'enabled', (select delivery_enabled from branches where id = p_branch),
    'zones', coalesce((select jsonb_agg(jsonb_build_object('id', z.id, 'name', z.name, 'fee', z.fee, 'free_over', z.free_over,
                       'eta_min', z.eta_min, 'active', z.is_active) order by z.name) from delivery_zones z where z.branch_id = p_branch), '[]'::jsonb));
end $$;

revoke all on function public_delivery_info(text), public_delivery_order(text, jsonb, uuid, text, text, text, text, numeric, numeric, text, text),
  public_delivery_status(uuid), delivery_requests_list(uuid), delivery_request_resolve(uuid, boolean, text), delivery_orders_list(uuid, boolean),
  delivery_set_status(uuid, text), delivery_admin(uuid, boolean, jsonb) from public;
grant execute on function public_delivery_info(text), public_delivery_order(text, jsonb, uuid, text, text, text, text, numeric, numeric, text, text),
  public_delivery_status(uuid) to anon, authenticated;
grant execute on function delivery_requests_list(uuid), delivery_request_resolve(uuid, boolean, text), delivery_orders_list(uuid, boolean),
  delivery_set_status(uuid, text), delivery_admin(uuid, boolean, jsonb) to authenticated;
