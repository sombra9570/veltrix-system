-- =====================================================================
--  VELTRIX ENTERPRISE — 02 · Módulos de negocio (requiere 01_core)
--
--  Idea central: una venta de tienda, una comanda de restaurante, una
--  orden de taller, una preventa en ruta y un crédito son TODOS un
--  "orders". Todos terminan en el mismo motor de cuotas → cobros → caja.
--  Así el dueño ve todo consolidado y cada módulo nuevo se suma sin
--  reescribir lo anterior.
--
--  Módulos: inventory · purchasing · finance · retail · restaurant ·
--           workshop · field_collection · distribution · hr
-- =====================================================================

-- =====================================================================
-- 1. ACTIVACIÓN DE MÓDULOS POR ORGANIZACIÓN (según el plan)
-- =====================================================================
create table org_modules (
  org_id      uuid not null references organizations(id),
  module      text not null check (module in ('inventory','purchasing','finance','retail','restaurant',
                                               'workshop','field_collection','distribution','hr')),
  enabled     boolean not null default true,
  updated_at  timestamptz not null default now(),
  primary key (org_id, module)
);

create function module_enabled(p_org uuid, p_module text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select enabled from org_modules where org_id = p_org and module = p_module), false);
$$;

-- plans.features = {"all_modules": true}  o  {"modules": ["retail","inventory",...]}
create function check_module_allowed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.enabled and not exists (
      select 1 from organizations o join plans p on p.id = o.plan_id
       where o.id = new.org_id
         and (coalesce((p.features->>'all_modules')::boolean, false) or p.features->'modules' ? new.module)) then
    raise exception 'Tu plan no incluye el módulo %', new.module;
  end if;
  return new;
end $$;
create trigger org_modules_plan before insert or update on org_modules
  for each row execute function check_module_allowed();

-- ---------- helpers de rol ampliados ----------
create function is_branch_member(p_branch uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from branches b where b.id = p_branch and is_org_owner(b.org_id))
      or has_branch_role(p_branch, '{supervisor,cashier,vendor,collector,waiter,kitchen,technician,storekeeper,accountant}');
$$;

-- Lectura de información financiera de la sucursal (incluye al contador)
create function branch_reader(p_branch uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_branch_manager(p_branch) or has_branch_role(p_branch, '{accountant}');
$$;

-- Quién puede generar ventas
create function can_sell(p_branch uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_branch_manager(p_branch)
      or has_branch_role(p_branch, '{vendor,supervisor,cashier,waiter,technician}');
$$;

create function has_company_role(p_company uuid, p_roles app_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from companies c where c.id = p_company and is_org_owner(c.org_id))
      or exists (select 1 from memberships m join profiles p on p.id = m.user_id
                  where m.user_id = auth.uid() and m.company_id = p_company and m.role = any(p_roles)
                    and m.is_active and m.deleted_at is null and p.is_active);
$$;

-- =====================================================================
-- 2. INVENTARIO
-- =====================================================================
create type product_type        as enum ('good','service','ingredient','combo');
create type stock_movement_type as enum ('initial','purchase','sale','sale_return','recipe_consumption',
                                         'work_order','adjustment','transfer_out','transfer_in');

create table product_categories (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  company_id  uuid not null,
  name        text not null,
  parent_id   uuid references product_categories(id),
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  foreign key (org_id, company_id) references companies(org_id, id)
);

alter table products
  add column category_id     uuid references product_categories(id),
  add column product_type    product_type not null default 'good',
  add column barcode         text,
  add column unit            text not null default 'unid',
  add column track_stock     boolean not null default false,
  add column cost            numeric(14,4) not null default 0 check (cost >= 0),  -- costo promedio
  add column is_sellable     boolean not null default true,
  add column kitchen_station text;          -- si tiene valor, el ítem va a la pantalla de cocina
create unique index products_barcode on products(company_id, barcode) where barcode is not null;

alter table branches add column allow_negative_stock boolean not null default false;
create unique index one_walk_in_per_branch on customers(branch_id) where is_walk_in;

create table warehouses (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  company_id  uuid not null,
  branch_id   uuid not null,
  name        text not null,
  is_default  boolean not null default false,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  foreign key (org_id, company_id, branch_id) references branches(org_id, company_id, id),
  unique (org_id, branch_id, id)
);
create unique index one_default_warehouse on warehouses(branch_id) where is_default and deleted_at is null;

-- Existencias actuales (las mantiene el trigger de stock_movements, en la misma transacción)
create table stock_levels (
  org_id        uuid not null,
  branch_id     uuid not null,
  warehouse_id  uuid not null references warehouses(id),
  product_id    uuid not null references products(id),
  qty           numeric(14,3) not null default 0,
  updated_at    timestamptz not null default now(),
  primary key (warehouse_id, product_id)
);

-- Kardex: todo movimiento de inventario, inmutable
create table stock_movements (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null,
  company_id     uuid not null,
  branch_id      uuid not null,
  warehouse_id   uuid not null,
  product_id     uuid not null references products(id),
  movement_type  stock_movement_type not null,
  qty            numeric(14,3) not null check (qty <> 0),
  unit_cost      numeric(14,4) not null default 0,
  ref_table      text,
  ref_id         uuid,
  note           text,
  created_by     uuid,
  created_at     timestamptz not null default now(),
  foreign key (org_id, branch_id, warehouse_id) references warehouses(org_id, branch_id, id)
);
create index stock_movements_product on stock_movements(product_id, created_at);
create index stock_movements_ref on stock_movements(ref_table, ref_id);

-- Recetas (restaurante) y combos: qué insumos consume cada producto vendido
create table recipes (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id),
  product_id     uuid not null references products(id),
  ingredient_id  uuid not null references products(id),
  qty            numeric(14,4) not null check (qty > 0),
  unique (product_id, ingredient_id),
  check (product_id <> ingredient_id)
);

create function apply_stock_level() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_qty numeric; v_allow boolean; v_name text;
begin
  insert into stock_levels (org_id, branch_id, warehouse_id, product_id, qty)
  values (new.org_id, new.branch_id, new.warehouse_id, new.product_id, new.qty)
  on conflict (warehouse_id, product_id)
  do update set qty = stock_levels.qty + excluded.qty, updated_at = now()
  returning qty into v_qty;

  select allow_negative_stock into v_allow from branches where id = new.branch_id;
  if v_qty < 0 and not v_allow then
    select name into v_name from products where id = new.product_id;
    raise exception 'Stock insuficiente de "%" (quedaría en %)', v_name, v_qty;
  end if;
  return new;
end $$;

create function default_warehouse(p_branch uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select id from warehouses where branch_id = p_branch and is_default and is_active and deleted_at is null;
$$;

-- Interna: registra un movimiento de stock
create function post_stock(p_branch uuid, p_warehouse uuid, p_product uuid, p_qty numeric,
                           p_type stock_movement_type, p_cost numeric,
                           p_ref_table text default null, p_ref_id uuid default null, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_qty = 0 then return; end if;
  insert into stock_movements (branch_id, warehouse_id, product_id, movement_type, qty, unit_cost,
                               ref_table, ref_id, note, created_by)
  values (p_branch, p_warehouse, p_product, p_type, p_qty, coalesce(p_cost, 0),
          p_ref_table, p_ref_id, p_note, auth.uid());
end $$;

-- Interna: descuenta (sign=1) o devuelve (sign=-1) el stock de un pedido, incluidas las recetas
create function apply_order_stock(p_order uuid, p_branch uuid, p_warehouse uuid, p_type text, p_sign int)
returns void language plpgsql security definer set search_path = public as $$
declare v_wh uuid := coalesce(p_warehouse, default_warehouse(p_branch)); it record; rc record;
        v_type stock_movement_type;
begin
  v_type := case when p_sign < 0 then 'sale_return'
                 when p_type = 'work_order' then 'work_order' else 'sale' end;
  for it in
    select oi.product_id, oi.qty, p.track_stock, p.cost
      from order_items oi join products p on p.id = oi.product_id
     where oi.order_id = p_order and oi.kitchen_status is distinct from 'cancelled'
  loop
    if it.track_stock then
      if v_wh is null then raise exception 'La sucursal no tiene almacén por defecto'; end if;
      perform post_stock(p_branch, v_wh, it.product_id, -it.qty * p_sign, v_type, it.cost, 'orders', p_order);
    end if;
    for rc in
      select r.ingredient_id, r.qty, p2.track_stock, p2.cost
        from recipes r join products p2 on p2.id = r.ingredient_id
       where r.product_id = it.product_id
    loop
      if rc.track_stock then
        if v_wh is null then raise exception 'La sucursal no tiene almacén por defecto'; end if;
        perform post_stock(p_branch, v_wh, rc.ingredient_id, -it.qty * rc.qty * p_sign,
                           case when p_sign < 0 then 'sale_return' else 'recipe_consumption' end::stock_movement_type,
                           rc.cost, 'orders', p_order);
      end if;
    end loop;
  end loop;
end $$;

-- Ajuste por conteo físico (almacenero o supervisor): se indica lo contado
create function adjust_stock(p_warehouse uuid, p_product uuid, p_counted numeric, p_note text)
returns numeric language plpgsql security definer set search_path = public as $$
declare w warehouses%rowtype; v_cur numeric; v_cost numeric;
begin
  select * into w from warehouses where id = p_warehouse;
  if not (is_branch_manager(w.branch_id) or has_branch_role(w.branch_id, '{storekeeper}')) then
    raise exception 'Sin permiso para ajustar inventario';
  end if;
  if coalesce(trim(p_note), '') = '' then raise exception 'Indique el motivo del ajuste'; end if;
  select coalesce((select qty from stock_levels where warehouse_id = p_warehouse and product_id = p_product), 0) into v_cur;
  select cost into v_cost from products where id = p_product;
  perform post_stock(w.branch_id, p_warehouse, p_product, p_counted - v_cur, 'adjustment', v_cost, null, null, p_note);
  return p_counted - v_cur;
end $$;

create function transfer_stock(p_from uuid, p_to uuid, p_product uuid, p_qty numeric, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare a warehouses%rowtype; b warehouses%rowtype; v_cost numeric; v_ref uuid := gen_random_uuid();
begin
  select * into a from warehouses where id = p_from;
  select * into b from warehouses where id = p_to;
  if a.org_id <> b.org_id or p_from = p_to or p_qty <= 0 then raise exception 'Transferencia inválida'; end if;
  if not (is_branch_manager(a.branch_id) or has_branch_role(a.branch_id, '{storekeeper}')) then
    raise exception 'Sin permiso en el almacén de origen';
  end if;
  select cost into v_cost from products where id = p_product;
  perform post_stock(a.branch_id, p_from, p_product, -p_qty, 'transfer_out', v_cost, 'transfer', v_ref, p_note);
  perform post_stock(b.branch_id, p_to,   p_product,  p_qty, 'transfer_in',  v_cost, 'transfer', v_ref, p_note);
end $$;

-- =====================================================================
-- 3. COMPRAS Y PROVEEDORES (cuentas por pagar)
-- =====================================================================
create type purchase_status as enum ('draft','received','cancelled');

create table suppliers (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null,
  company_id          uuid not null,
  name                text not null,
  tax_id              text,
  phone               text,
  email               text,
  payment_terms_days  int not null default 0 check (payment_terms_days >= 0),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  foreign key (org_id, company_id) references companies(org_id, id)
);

create table purchases (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null,
  company_id       uuid not null,
  branch_id        uuid not null,
  supplier_id      uuid not null references suppliers(id),
  warehouse_id     uuid not null,
  status           purchase_status not null default 'draft',
  currency         char(3) not null,
  total_amount     numeric(14,2) not null default 0,
  supplier_doc_ref text,              -- número de factura del proveedor
  due_date         date,
  received_at      timestamptz,
  created_by       uuid references profiles(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  foreign key (org_id, company_id, branch_id) references branches(org_id, company_id, id),
  foreign key (org_id, branch_id, warehouse_id) references warehouses(org_id, branch_id, id)
);

create table purchase_items (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null,
  purchase_id  uuid not null references purchases(id) on delete cascade,
  product_id   uuid not null references products(id),
  qty          numeric(14,3) not null check (qty > 0),
  unit_cost    numeric(14,4) not null check (unit_cost >= 0),
  line_total   numeric(14,2) generated always as (round(qty * unit_cost, 2)) stored
);

-- =====================================================================
-- 4. FINANZAS
-- =====================================================================
create type financial_account_type as enum ('cash','bank','wallet');

create table financial_accounts (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  company_id  uuid not null,
  branch_id   uuid,
  name        text not null,
  type        financial_account_type not null,
  currency    char(3) not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  foreign key (org_id, company_id) references companies(org_id, id),
  foreign key (org_id, company_id, branch_id) references branches(org_id, company_id, id)
);

create table supplier_payments (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null,
  company_id   uuid not null,
  branch_id    uuid not null,
  purchase_id  uuid not null references purchases(id),
  account_id   uuid not null references financial_accounts(id),
  amount       numeric(14,2) not null check (amount > 0),
  currency     char(3) not null,
  paid_at      timestamptz not null default now(),
  created_by   uuid references profiles(id),
  created_at   timestamptz not null default now(),
  foreign key (org_id, company_id, branch_id) references branches(org_id, company_id, id)
);

create table expense_categories (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id),
  name        text not null,
  unique (org_id, name)
);

create table expenses (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  company_id    uuid not null,
  branch_id     uuid not null,
  category_id   uuid not null references expense_categories(id),
  account_id    uuid not null references financial_accounts(id),
  amount        numeric(14,2) not null check (amount > 0),
  currency      char(3) not null,
  description   text not null,
  expense_date  date not null default current_date,
  created_by    uuid not null references profiles(id),
  approved_by   uuid references profiles(id),
  created_at    timestamptz not null default now(),
  foreign key (org_id, company_id, branch_id) references branches(org_id, company_id, id)
);

-- =====================================================================
-- 5. RESTAURANTE
-- =====================================================================
create type kitchen_status as enum ('pending','preparing','ready','served','cancelled');
create type order_type     as enum ('counter','dine_in','takeaway','delivery','field_presale','work_order');
create type delivery_status as enum ('pending','dispatched','delivered','failed');

create table dining_areas (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  company_id  uuid not null,
  branch_id   uuid not null,
  name        text not null,
  created_at  timestamptz not null default now(),
  foreign key (org_id, company_id, branch_id) references branches(org_id, company_id, id)
);

create table dining_tables (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  company_id  uuid not null,
  branch_id   uuid not null,
  area_id     uuid references dining_areas(id),
  name        text not null,
  seats       int not null default 4 check (seats > 0),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  foreign key (org_id, company_id, branch_id) references branches(org_id, company_id, id),
  unique (branch_id, name),
  unique (org_id, branch_id, id)
);

create table modifier_groups (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  company_id  uuid not null,
  name        text not null,              -- ej. "Término de la carne", "Extras"
  min_select  int not null default 0,
  max_select  int not null default 1,
  foreign key (org_id, company_id) references companies(org_id, id),
  check (max_select >= min_select)
);

create table modifier_options (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id),
  group_id     uuid not null references modifier_groups(id) on delete cascade,
  name         text not null,
  price_delta  numeric(14,2) not null default 0
);

create table product_modifier_groups (
  org_id      uuid not null references organizations(id),
  product_id  uuid not null references products(id),
  group_id    uuid not null references modifier_groups(id),
  primary key (product_id, group_id)
);

-- Campos nuevos del pedido para cada tipo de negocio
alter table orders
  add column order_type       order_type not null default 'counter',
  add column table_id         uuid,
  add column guests           int check (guests > 0),
  add column route_id         uuid,                 -- preventa en ruta (distribución)
  add column delivery_status  delivery_status,
  add column delivery_address text,
  add column warehouse_id     uuid,
  add column tip_amount       numeric(14,2) not null default 0 check (tip_amount >= 0),
  add column confirmed_at     timestamptz,
  add foreign key (org_id, branch_id, table_id)     references dining_tables(org_id, branch_id, id),
  add foreign key (org_id, branch_id, route_id)     references collection_routes(org_id, branch_id, id),
  add foreign key (org_id, branch_id, warehouse_id) references warehouses(org_id, branch_id, id),
  add check (order_type <> 'dine_in' or table_id is not null),
  add check (order_type <> 'field_presale' or route_id is not null);
-- Una sola cuenta abierta por mesa
create unique index one_open_order_per_table on orders(table_id) where status = 'draft' and table_id is not null;

alter table order_items
  add column item_kind      text not null default 'product' check (item_kind in ('product','service','labor')),
  add column kitchen_status kitchen_status,
  add column notes          text,
  add column technician_id  uuid references profiles(id);

create table order_item_modifiers (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id),
  order_item_id  uuid not null references order_items(id) on delete cascade,
  option_id      uuid references modifier_options(id),
  name           text not null,
  price_delta    numeric(14,2) not null default 0
);

-- =====================================================================
-- 6. TALLER
-- =====================================================================
create type asset_kind        as enum ('vehicle','motorcycle','equipment','device','other');
create type work_order_status as enum ('received','diagnosing','waiting_approval','waiting_parts',
                                       'in_progress','done','delivered','cancelled');

-- Vehículo / equipo del cliente
create table assets (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null,
  company_id   uuid not null,
  branch_id    uuid not null,
  customer_id  uuid not null,
  kind         asset_kind not null,
  brand        text,
  model        text,
  identifier   text,          -- placa, serie o IMEI
  year         int,
  color        text,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  foreign key (org_id, company_id, branch_id) references branches(org_id, company_id, id),
  foreign key (org_id, branch_id, customer_id) references customers(org_id, branch_id, id)
);

create table work_orders (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null,
  company_id        uuid not null,
  branch_id         uuid not null,
  order_id          uuid not null unique,
  asset_id          uuid references assets(id),
  technician_id     uuid references profiles(id),
  status            work_order_status not null default 'received',
  problem_reported  text not null,
  diagnosis         text,
  odometer          int,
  received_at       timestamptz not null default now(),
  promised_at       timestamptz,
  delivered_at      timestamptz,
  warranty_days     int not null default 0 check (warranty_days >= 0),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  foreign key (org_id, company_id, branch_id) references branches(org_id, company_id, id),
  foreign key (org_id, branch_id, order_id) references orders(org_id, branch_id, id)
);

-- =====================================================================
-- 7. PERSONAL
-- =====================================================================
create table attendance (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  company_id  uuid not null,
  branch_id   uuid not null,
  user_id     uuid not null references profiles(id),
  check_in    timestamptz not null default now(),
  check_out   timestamptz,
  gps_lat     numeric(9,6),
  gps_lng     numeric(9,6),
  foreign key (org_id, company_id, branch_id) references branches(org_id, company_id, id),
  check (check_out is null or check_out > check_in)
);
create unique index one_open_attendance on attendance(user_id) where check_out is null;

-- Comisión sobre ventas: por usuario, o por rol si no tiene regla propia
create table commission_rules (
  id       uuid primary key default gen_random_uuid(),
  org_id   uuid not null references organizations(id),
  user_id  uuid references profiles(id),
  role     app_role,
  rate     numeric(6,4) not null check (rate between 0 and 1),
  check ((user_id is null) <> (role is null))
);

-- =====================================================================
-- 8. REGLAS DEL PEDIDO AMPLIADAS (reemplazan las del núcleo)
-- =====================================================================
create function order_type_module(p_type order_type) returns text language sql immutable as $$
  select case p_type when 'dine_in' then 'restaurant' when 'takeaway' then 'restaurant'
                     when 'work_order' then 'workshop' when 'field_presale' then 'distribution' end;
$$;

create function check_order_module() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_mod text := order_type_module(new.order_type); v_org uuid;
begin
  select org_id into v_org from branches where id = new.branch_id;
  if v_mod is not null and not module_enabled(v_org, v_mod) then
    raise exception 'El módulo % no está activo en esta cuenta', v_mod;
  end if;
  return new;
end $$;
create trigger orders_zmodule before insert on orders for each row execute function check_order_module();

-- ¿Puede el usuario editar este pedido en borrador?
create function can_edit_order(p_order uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from orders o where o.id = p_order and o.status = 'draft'
      and ( o.vendor_id = auth.uid() or is_branch_manager(o.branch_id)
         or (o.order_type in ('dine_in','takeaway','delivery') and has_branch_role(o.branch_id, '{waiter,cashier}'))
         or (o.order_type = 'work_order' and has_branch_role(o.branch_id, '{technician}')) ));
$$;

create or replace function order_lifecycle() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_sub numeric; v_tax numeric; v_inst numeric; c record;
begin
  -- Borrador → Confirmado
  if old.status = 'draft' and new.status = 'confirmed' then
    select coalesce(sum(line_total),0), coalesce(sum(round(line_total * tax_rate, 2)),0)
      into v_sub, v_tax from order_items
     where order_id = new.id and kitchen_status is distinct from 'cancelled';
    if v_sub <= 0 then raise exception 'El pedido no tiene ítems'; end if;
    new.subtotal := v_sub; new.tax_amount := v_tax;
    new.total_amount := v_sub + v_tax + new.tip_amount;
    new.approved_by := null; new.approved_at := null; new.confirmed_at := now();
    select credit_status, credit_limit, is_walk_in into c from customers where id = new.customer_id;

    if new.payment_condition = 'cash' then
      delete from installments where order_id = new.id;
      insert into installments (order_id, number, due_date, amount)
      values (new.id, 1, branch_today(new.branch_id), new.total_amount);
      new.approval_status := 'auto_approved';
    else
      if c.is_walk_in then raise exception 'Consumidor final no puede comprar a crédito'; end if;
      select coalesce(sum(amount),0) into v_inst from installments where order_id = new.id;
      if v_inst <> new.total_amount then
        raise exception 'Las cuotas suman % pero el total es %', v_inst, new.total_amount;
      end if;
      if c.credit_status <> 'approved'
         or customer_open_balance(new.customer_id) + new.total_amount > c.credit_limit then
        new.approval_status := 'pending_supervisor';
      else
        new.approval_status := 'auto_approved';
      end if;
    end if;

    -- Descuento de inventario (productos + recetas)
    perform apply_order_stock(new.id, new.branch_id, new.warehouse_id, new.order_type::text, 1);
    if new.order_type = 'delivery' or new.order_type = 'field_presale' then
      new.delivery_status := coalesce(new.delivery_status, 'pending');
    end if;
    return new;
  end if;

  if old.status = 'draft' then
    if new.approval_status is distinct from old.approval_status then
      raise exception 'La aprobación la define el sistema o el supervisor';
    end if;
    return new;
  end if;

  -- Pedido confirmado
  if (new.customer_id, new.payment_condition, new.currency, new.subtotal, new.tax_amount, new.total_amount, new.branch_id)
     is distinct from
     (old.customer_id, old.payment_condition, old.currency, old.subtotal, old.tax_amount, old.total_amount, old.branch_id) then
    raise exception 'Los montos de un pedido confirmado no se pueden cambiar';
  end if;
  if new.status = 'draft' then raise exception 'Un pedido confirmado no vuelve a borrador'; end if;

  -- Solo cambia el estado de entrega: lo puede hacer quien vende o reparte
  if (to_jsonb(new) - array['delivery_status','updated_at']) = (to_jsonb(old) - array['delivery_status','updated_at']) then
    return new;
  end if;

  if auth.uid() is not null and not is_branch_manager(old.branch_id) then
    raise exception 'Solo supervisor u owner pueden modificar un pedido confirmado';
  end if;
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    if exists (select 1 from installments i where i.order_id = old.id and installment_paid(i.id) <> 0) then
      raise exception 'El pedido tiene cobros: primero hay que reversarlos';
    end if;
    if old.approval_status <> 'rejected' then
      perform apply_order_stock(old.id, old.branch_id, old.warehouse_id, old.order_type::text, -1);
    end if;
  end if;
  if new.approval_status is distinct from old.approval_status then
    if old.approval_status <> 'pending_supervisor' or new.approval_status not in ('approved','rejected') then
      raise exception 'Cambio de aprobación no permitido';
    end if;
    new.approved_by := auth.uid(); new.approved_at := now();
    if new.approval_status = 'rejected' then   -- crédito rechazado: la mercadería vuelve al stock
      perform apply_order_stock(old.id, old.branch_id, old.warehouse_id, old.order_type::text, -1);
    end if;
  end if;
  return new;
end $$;

-- Ítems: editables solo en borrador, salvo el estado de cocina
create or replace function guard_draft_children() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_order uuid := coalesce(new.order_id, old.order_id);
begin
  if tg_op = 'UPDATE' and tg_table_name = 'order_items'
     and (to_jsonb(new) - 'kitchen_status') = (to_jsonb(old) - 'kitchen_status') then
    return new;
  end if;
  if exists (select 1 from orders where id = v_order and status <> 'draft') then
    raise exception 'El pedido ya está confirmado: no se puede modificar';
  end if;
  return coalesce(new, old);
end $$;

-- Ítems de cocina entran como "pendiente" automáticamente
create function set_kitchen_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kitchen_status is null and exists (
       select 1 from products where id = new.product_id and kitchen_station is not null) then
    new.kitchen_status := 'pending';
  end if;
  return new;
end $$;
create trigger order_items_kitchen before insert on order_items for each row execute function set_kitchen_status();

-- =====================================================================
-- 9. FUNCIONES DE NEGOCIO DE LOS MÓDULOS
-- =====================================================================

-- Consumidor final de la sucursal (se crea solo la primera vez)
create function walk_in_customer(p_branch uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not is_branch_member(p_branch) then raise exception 'Sin acceso a esta sucursal'; end if;
  select id into v_id from customers where branch_id = p_branch and is_walk_in;
  if v_id is null then
    insert into customers (branch_id, name, is_walk_in) values (p_branch, 'Consumidor final', true)
    returning id into v_id;
  end if;
  return v_id;
end $$;

-- ---------- Restaurante ----------
create function open_table(p_table uuid, p_guests int default null) returns uuid
language plpgsql security invoker set search_path = public as $$
declare t dining_tables%rowtype; v_id uuid; v_cur char(3);
begin
  select * into t from dining_tables where id = p_table and is_active;
  if not found then raise exception 'Mesa inexistente'; end if;
  select id into v_id from orders where table_id = p_table and status = 'draft';
  if v_id is not null then return v_id; end if;           -- ya estaba abierta
  select c.base_currency into v_cur from companies c where c.id = t.company_id;
  insert into orders (branch_id, org_id, company_id, customer_id, vendor_id, payment_condition,
                      currency, order_type, table_id, guests)
  values (t.branch_id, t.org_id, t.company_id, walk_in_customer(t.branch_id), auth.uid(), 'cash',
          v_cur, 'dine_in', p_table, p_guests)
  returning id into v_id;
  return v_id;
end $$;

-- Mesas y su consumo en curso (mesero / cajero)
create function get_open_tables(p_branch uuid)
returns table (table_id uuid, table_name text, area text, order_id uuid, waiter text,
               guests int, running_total numeric, opened_at timestamptz)
language sql stable security definer set search_path = public as $$
  select t.id, t.name, a.name, o.id, p.full_name, o.guests,
         coalesce((select sum(line_total + round(line_total * tax_rate, 2)) from order_items
                    where order_id = o.id and kitchen_status is distinct from 'cancelled'), 0),
         o.created_at
    from dining_tables t
    left join dining_areas a on a.id = t.area_id
    left join orders o on o.table_id = t.id and o.status = 'draft'
    left join profiles p on p.id = o.vendor_id
   where t.branch_id = p_branch and t.is_active
     and (is_branch_manager(p_branch) or has_branch_role(p_branch, '{waiter,cashier}'))
   order by a.name nulls first, t.name;
$$;

-- Pantalla de cocina
create function get_kitchen_queue(p_branch uuid, p_station text default null)
returns table (item_id uuid, order_id uuid, order_type order_type, table_name text, description text,
               qty numeric, notes text, modifiers text, station text, kitchen_status kitchen_status,
               created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select oi.id, o.id, o.order_type, t.name, oi.description, oi.qty, oi.notes,
         (select string_agg(m.name, ', ') from order_item_modifiers m where m.order_item_id = oi.id),
         p.kitchen_station, oi.kitchen_status, oi.created_at
    from order_items oi
    join orders o on o.id = oi.order_id
    join products p on p.id = oi.product_id
    left join dining_tables t on t.id = o.table_id
   where o.branch_id = p_branch and o.status <> 'cancelled'
     and oi.kitchen_status in ('pending','preparing','ready')
     and (p_station is null or p.kitchen_station = p_station)
     and (is_branch_manager(p_branch) or has_branch_role(p_branch, '{kitchen,waiter}'))
   order by oi.created_at;
$$;

create function set_kitchen_item_status(p_item uuid, p_status kitchen_status) returns void
language plpgsql security definer set search_path = public as $$
declare v_branch uuid; v_cur kitchen_status; v_order_status order_status;
begin
  select o.branch_id, oi.kitchen_status, o.status into v_branch, v_cur, v_order_status
    from order_items oi join orders o on o.id = oi.order_id where oi.id = p_item;
  if v_cur is null then raise exception 'Este ítem no pasa por cocina'; end if;
  if p_status = 'cancelled' then
    if v_order_status <> 'draft' then raise exception 'La cuenta ya se cerró: anule con un reverso'; end if;
    if not (is_branch_manager(v_branch) or has_branch_role(v_branch, '{waiter}')) then
      raise exception 'Solo mesero o supervisor anulan ítems';
    end if;
  elsif p_status = 'served' then
    if not (is_branch_manager(v_branch) or has_branch_role(v_branch, '{waiter,kitchen}')) then
      raise exception 'Sin permiso';
    end if;
  elsif not (is_branch_manager(v_branch) or has_branch_role(v_branch, '{kitchen}')) then
    raise exception 'Solo cocina cambia este estado';
  end if;
  update order_items set kitchen_status = p_status where id = p_item;
end $$;

-- ---------- Taller ----------
create function create_work_order(p_customer uuid, p_asset uuid, p_problem text,
                                  p_technician uuid default null, p_promised_at timestamptz default null)
returns uuid language plpgsql security invoker set search_path = public as $$
declare c customers%rowtype; v_order uuid; v_wo uuid; v_cur char(3);
begin
  select * into c from customers where id = p_customer;
  if not found then raise exception 'Cliente inexistente'; end if;
  select base_currency into v_cur from companies where id = c.company_id;
  insert into orders (branch_id, org_id, company_id, customer_id, vendor_id, payment_condition, currency, order_type)
  values (c.branch_id, c.org_id, c.company_id, c.id, auth.uid(), 'cash', v_cur, 'work_order')
  returning id into v_order;
  insert into work_orders (branch_id, order_id, asset_id, technician_id, problem_reported, promised_at)
  values (c.branch_id, v_order, p_asset, p_technician, p_problem, p_promised_at)
  returning id into v_wo;
  return v_wo;
end $$;

create function set_work_order_status(p_wo uuid, p_status work_order_status, p_diagnosis text default null)
returns void language plpgsql security definer set search_path = public as $$
declare w work_orders%rowtype; v_order_status order_status;
begin
  select * into w from work_orders where id = p_wo for update;
  if not found then raise exception 'Orden inexistente'; end if;
  if not (is_branch_manager(w.branch_id) or has_branch_role(w.branch_id, '{technician}')) then
    raise exception 'Sin permiso';
  end if;
  if p_status = 'delivered' then
    select status into v_order_status from orders where id = w.order_id;
    if v_order_status <> 'confirmed' then raise exception 'Primero se factura (confirma) la orden'; end if;
  end if;
  update work_orders set status = p_status, diagnosis = coalesce(p_diagnosis, diagnosis),
         delivered_at = case when p_status = 'delivered' then now() else delivered_at end,
         updated_at = now()
   where id = p_wo;
end $$;

-- ---------- Compras ----------
create function receive_purchase(p_purchase uuid) returns void
language plpgsql security definer set search_path = public as $$
declare pu purchases%rowtype; it record; v_total numeric; v_onhand numeric; v_cost numeric; v_terms int;
begin
  select * into pu from purchases where id = p_purchase for update;
  if not found or pu.status <> 'draft' then raise exception 'Compra inexistente o ya recibida'; end if;
  if not (is_branch_manager(pu.branch_id) or has_branch_role(pu.branch_id, '{storekeeper}')) then
    raise exception 'Sin permiso para recibir mercadería';
  end if;
  select coalesce(sum(line_total), 0) into v_total from purchase_items where purchase_id = pu.id;
  if v_total <= 0 then raise exception 'La compra no tiene ítems'; end if;

  for it in select product_id, qty, unit_cost from purchase_items where purchase_id = pu.id loop
    -- Costo promedio ponderado de la empresa
    select coalesce(sum(sl.qty), 0) into v_onhand
      from stock_levels sl join warehouses w on w.id = sl.warehouse_id
     where sl.product_id = it.product_id and w.company_id = pu.company_id and sl.qty > 0;
    select cost into v_cost from products where id = it.product_id;
    update products set cost = round((v_onhand * v_cost + it.qty * it.unit_cost) / (v_onhand + it.qty), 4),
                        track_stock = true
     where id = it.product_id;
    perform post_stock(pu.branch_id, pu.warehouse_id, it.product_id, it.qty, 'purchase', it.unit_cost, 'purchases', pu.id);
  end loop;

  select payment_terms_days into v_terms from suppliers where id = pu.supplier_id;
  update purchases set status = 'received', received_at = now(), total_amount = v_total,
         due_date = coalesce(due_date, current_date + v_terms), updated_at = now()
   where id = pu.id;
end $$;

create function pay_supplier(p_purchase uuid, p_account uuid, p_amount numeric) returns uuid
language plpgsql security definer set search_path = public as $$
declare pu purchases%rowtype; v_paid numeric; v_id uuid; a financial_accounts%rowtype;
begin
  select * into pu from purchases where id = p_purchase for update;
  if not found or pu.status <> 'received' then raise exception 'Solo se pagan compras recibidas'; end if;
  if not (is_branch_manager(pu.branch_id) or has_branch_role(pu.branch_id, '{accountant}')) then
    raise exception 'Sin permiso para pagar proveedores';
  end if;
  select * into a from financial_accounts where id = p_account and company_id = pu.company_id and is_active;
  if not found then raise exception 'Cuenta de pago inválida'; end if;
  if a.currency <> pu.currency then raise exception 'La cuenta está en otra moneda'; end if;
  select coalesce(sum(amount), 0) into v_paid from supplier_payments where purchase_id = pu.id;
  if p_amount <= 0 or v_paid + p_amount > pu.total_amount then
    raise exception 'El pago excede el saldo (% pendiente)', pu.total_amount - v_paid;
  end if;
  insert into supplier_payments (branch_id, purchase_id, account_id, amount, currency, created_by)
  values (pu.branch_id, pu.id, p_account, p_amount, pu.currency, auth.uid()) returning id into v_id;
  return v_id;
end $$;

-- ---------- Personal ----------
create function clock_in(p_branch uuid, p_lat numeric default null, p_lng numeric default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not is_branch_member(p_branch) then raise exception 'No pertenece a esta sucursal'; end if;
  insert into attendance (branch_id, user_id, gps_lat, gps_lng) values (p_branch, auth.uid(), p_lat, p_lng)
  returning id into v_id;
  return v_id;
end $$;

create function clock_out() returns void
language plpgsql security definer set search_path = public as $$
begin
  update attendance set check_out = now() where user_id = auth.uid() and check_out is null;
  if not found then raise exception 'No tiene una entrada abierta'; end if;
end $$;

-- =====================================================================
-- 10. TRIGGERS DE LOS MÓDULOS
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array['warehouses','stock_movements','purchases','supplier_payments','expenses',
                           'dining_areas','dining_tables','assets','work_orders','attendance']
  loop
    execute format('create trigger %I_scope before insert or update of branch_id on %I for each row execute function fill_scope_from_branch()', t, t);
  end loop;
  foreach t in array array['warehouses','suppliers','purchases','assets','work_orders']
  loop
    execute format('create trigger %I_updated_at before update on %I for each row execute function set_updated_at()', t, t);
  end loop;
  foreach t in array array['org_modules','product_categories','warehouses','stock_movements','recipes','suppliers',
                           'purchases','purchase_items','supplier_payments','financial_accounts','expenses',
                           'dining_tables','modifier_groups','modifier_options','order_item_modifiers',
                           'assets','work_orders','attendance','commission_rules']
  loop
    execute format('create trigger %I_audit after insert or update or delete on %I for each row execute function audit_row()', t, t);
  end loop;
end $$;

create trigger stock_movements_level   after insert on stock_movements for each row execute function apply_stock_level();
create trigger stock_movements_immut   before update or delete on stock_movements for each row execute function forbid_change();
create trigger supplier_payments_immut before update or delete on supplier_payments for each row execute function forbid_change();
create trigger expenses_no_delete      before delete on expenses for each row execute function forbid_change();

create function fill_org_from_purchase() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select org_id into new.org_id from purchases where id = new.purchase_id;
  if exists (select 1 from purchases where id = new.purchase_id and status <> 'draft') then
    raise exception 'La compra ya fue recibida: no se puede modificar';
  end if;
  return new;
end $$;
create trigger purchase_items_scope before insert or update on purchase_items
  for each row execute function fill_org_from_purchase();

create function fill_org_from_item() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select org_id into new.org_id from order_items where id = new.order_item_id;
  return new;
end $$;
create trigger order_item_modifiers_scope before insert on order_item_modifiers
  for each row execute function fill_org_from_item();

-- =====================================================================
-- 11. VISTAS DE GESTIÓN
-- =====================================================================
create view v_stock with (security_invoker = true) as
select sl.org_id, sl.branch_id, sl.warehouse_id, w.name as warehouse, p.id as product_id, p.sku, p.barcode,
       p.name as product, p.unit, sl.qty, p.cost, round(sl.qty * p.cost, 2) as stock_value
  from stock_levels sl join warehouses w on w.id = sl.warehouse_id join products p on p.id = sl.product_id;

create view v_purchase_balance with (security_invoker = true) as
select pu.id, pu.org_id, pu.branch_id, pu.supplier_id, s.name as supplier, pu.total_amount, pu.currency, pu.due_date,
       coalesce((select sum(amount) from supplier_payments sp where sp.purchase_id = pu.id), 0) as paid,
       pu.total_amount - coalesce((select sum(amount) from supplier_payments sp where sp.purchase_id = pu.id), 0) as balance
  from purchases pu join suppliers s on s.id = pu.supplier_id
 where pu.status = 'received';

-- Estado de resultados mensual por sucursal: ventas − costo de lo vendido − gastos
create view v_profit_and_loss with (security_invoker = true) as
with rev as (
  select org_id, branch_id, date_trunc('month', confirmed_at)::date as month, sum(subtotal) as revenue
    from orders where status = 'confirmed' and approval_status <> 'rejected'
   group by 1,2,3),
cogs as (
  select org_id, branch_id, date_trunc('month', created_at)::date as month, sum(-qty * unit_cost) as cogs
    from stock_movements where movement_type in ('sale','sale_return','recipe_consumption','work_order')
   group by 1,2,3),
exp as (
  select org_id, branch_id, date_trunc('month', expense_date)::date as month, sum(amount) as expenses
    from expenses group by 1,2,3
  union all
  select org_id, branch_id, date_trunc('month', created_at)::date, sum(amount)
    from cash_movements where type = 'expense' group by 1,2,3),
keys as (select org_id, branch_id, month from rev union select org_id, branch_id, month from cogs
         union select org_id, branch_id, month from exp)
select k.org_id, k.branch_id, k.month,
       coalesce(r.revenue, 0)                                   as revenue,
       round(coalesce(c.cogs, 0), 2)                            as cost_of_sales,
       round(coalesce(r.revenue, 0) - coalesce(c.cogs, 0), 2)   as gross_profit,
       coalesce((select sum(expenses) from exp e where e.org_id = k.org_id and e.branch_id = k.branch_id and e.month = k.month), 0) as expenses,
       round(coalesce(r.revenue, 0) - coalesce(c.cogs, 0)
             - coalesce((select sum(expenses) from exp e where e.org_id = k.org_id and e.branch_id = k.branch_id and e.month = k.month), 0), 2) as net_profit
  from keys k
  left join rev r  on r.org_id = k.org_id and r.branch_id = k.branch_id and r.month = k.month
  left join cogs c on c.org_id = k.org_id and c.branch_id = k.branch_id and c.month = k.month;

create view v_commissions with (security_invoker = true) as
select o.org_id, o.branch_id, o.vendor_id, pr.full_name as seller,
       date_trunc('month', o.confirmed_at)::date as month,
       sum(o.subtotal) as sales,
       coalesce((select rate from commission_rules cr where cr.org_id = o.org_id and cr.user_id = o.vendor_id),
                (select max(cr.rate) from commission_rules cr join memberships m
                    on m.role = cr.role and m.user_id = o.vendor_id and m.org_id = o.org_id
                  where cr.org_id = o.org_id and cr.user_id is null), 0) as rate,
       round(sum(o.subtotal) * coalesce((select rate from commission_rules cr where cr.org_id = o.org_id and cr.user_id = o.vendor_id),
                (select max(cr.rate) from commission_rules cr join memberships m
                    on m.role = cr.role and m.user_id = o.vendor_id and m.org_id = o.org_id
                  where cr.org_id = o.org_id and cr.user_id is null), 0), 2) as commission
  from orders o join profiles pr on pr.id = o.vendor_id
 where o.status = 'confirmed' and o.approval_status <> 'rejected'
 group by o.org_id, o.branch_id, o.vendor_id, pr.full_name, date_trunc('month', o.confirmed_at);

-- =====================================================================
-- 12. RLS DE LOS MÓDULOS
-- =====================================================================
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- ---------- Políticas del núcleo ampliadas a los nuevos roles ----------
drop policy customers_read   on customers;
drop policy customers_insert on customers;
drop policy customers_update on customers;
create policy customers_read on customers for select to authenticated
  using (org_reader(org_id) or branch_reader(branch_id)
         or has_branch_role(branch_id, '{vendor,technician}')
         or collector_sees_customer(id)
         or (is_walk_in and is_branch_member(branch_id)));
create policy customers_insert on customers for insert to authenticated
  with check ((has_branch_role(branch_id, '{supervisor,vendor,technician}') or is_branch_manager(branch_id))
              and org_writable(org_id));
create policy customers_update on customers for update to authenticated
  using (has_branch_role(branch_id, '{supervisor,vendor,technician}') or is_branch_manager(branch_id))
  with check (has_branch_role(branch_id, '{supervisor,vendor,technician}') or is_branch_manager(branch_id));

drop policy orders_read   on orders;
drop policy orders_insert on orders;
drop policy orders_update on orders;
create policy orders_read on orders for select to authenticated
  using (org_reader(org_id) or branch_reader(branch_id) or vendor_id = auth.uid()
         or (order_type in ('dine_in','takeaway','delivery') and has_branch_role(branch_id, '{waiter,cashier}'))
         or (order_type = 'work_order' and has_branch_role(branch_id, '{technician}')));
create policy orders_insert on orders for insert to authenticated
  with check (vendor_id = auth.uid() and can_sell(branch_id)
              and status = 'draft' and approval_status is null and org_writable(org_id));
create policy orders_update on orders for update to authenticated
  using (is_branch_manager(branch_id) or can_edit_order(id)
         or (status = 'confirmed' and delivery_status is not null and (vendor_id = auth.uid() or can_sell(branch_id))))
  with check (is_branch_manager(branch_id) or can_sell(branch_id));

drop policy items_write on order_items;
create policy items_write on order_items for all to authenticated
  using (can_edit_order(order_id)) with check (can_edit_order(order_id));
drop policy inst_write on installments;
create policy inst_write on installments for all to authenticated
  using (can_edit_order(order_id)) with check (can_edit_order(order_id));

drop policy payments_read on payments;
create policy payments_read on payments for select to authenticated
  using (org_reader(org_id) or branch_reader(branch_id) or collected_by = auth.uid()
         or exists (select 1 from register_shifts s where s.id = shift_id and s.cashier_id = auth.uid()));
drop policy settlements_read on route_settlements;
create policy settlements_read on route_settlements for select to authenticated
  using (org_reader(org_id) or branch_reader(branch_id) or collector_id = auth.uid());
drop policy cashmov_read on cash_movements;
create policy cashmov_read on cash_movements for select to authenticated
  using (org_reader(org_id) or branch_reader(branch_id) or created_by = auth.uid());

-- ---------- Módulos ----------
create policy modules_read on org_modules for select to authenticated
  using (is_org_member(org_id) or has_support_grant(org_id) or is_platform_admin());
create policy modules_write on org_modules for insert to authenticated with check (is_org_owner(org_id));
create policy modules_update on org_modules for update to authenticated
  using (is_org_owner(org_id)) with check (is_org_owner(org_id));

-- Inventario
create policy categories_read on product_categories for select to authenticated
  using (is_company_member(company_id) or has_support_grant(org_id));
create policy categories_write on product_categories for insert to authenticated
  with check (has_company_role(company_id, '{supervisor,storekeeper}'));
create policy categories_update on product_categories for update to authenticated
  using (has_company_role(company_id, '{supervisor,storekeeper}'))
  with check (has_company_role(company_id, '{supervisor,storekeeper}'));

-- Productos: además del owner, supervisor y almacenero mantienen el catálogo
create policy products_staff_insert on products for insert to authenticated
  with check (has_company_role(company_id, '{supervisor,storekeeper}') and org_writable(org_id));
create policy products_staff_update on products for update to authenticated
  using (has_company_role(company_id, '{supervisor,storekeeper}'))
  with check (has_company_role(company_id, '{supervisor,storekeeper}'));

create policy warehouses_read on warehouses for select to authenticated
  using (org_reader(org_id) or is_branch_member(branch_id));
create policy warehouses_insert on warehouses for insert to authenticated
  with check (is_org_owner(org_id) and module_enabled(org_id, 'inventory'));
create policy warehouses_update on warehouses for update to authenticated
  using (is_org_owner(org_id)) with check (is_org_owner(org_id));

create policy stock_read on stock_levels for select to authenticated
  using (org_reader(org_id) or is_branch_member(branch_id));
create policy kardex_read on stock_movements for select to authenticated
  using (org_reader(org_id) or branch_reader(branch_id) or has_branch_role(branch_id, '{storekeeper}'));

create policy recipes_read on recipes for select to authenticated using (is_org_member(org_id));
create policy recipes_write on recipes for all to authenticated
  using (is_org_owner(org_id) or exists (select 1 from products p where p.id = product_id
                                          and has_company_role(p.company_id, '{supervisor,storekeeper}')))
  with check (is_org_owner(org_id) or exists (select 1 from products p where p.id = product_id
                                          and has_company_role(p.company_id, '{supervisor,storekeeper}')));

-- Compras
create policy suppliers_read on suppliers for select to authenticated
  using (has_company_role(company_id, '{supervisor,storekeeper,accountant}') or has_support_grant(org_id));
create policy suppliers_insert on suppliers for insert to authenticated
  with check (has_company_role(company_id, '{supervisor,storekeeper,accountant}') and module_enabled(org_id, 'purchasing'));
create policy suppliers_update on suppliers for update to authenticated
  using (has_company_role(company_id, '{supervisor,storekeeper,accountant}'))
  with check (has_company_role(company_id, '{supervisor,storekeeper,accountant}'));

create policy purchases_read on purchases for select to authenticated
  using (org_reader(org_id) or branch_reader(branch_id) or has_branch_role(branch_id, '{storekeeper}'));
create policy purchases_insert on purchases for insert to authenticated
  with check ((is_branch_manager(branch_id) or has_branch_role(branch_id, '{storekeeper}'))
              and status = 'draft' and module_enabled(org_id, 'purchasing') and org_writable(org_id));
create policy purchases_update on purchases for update to authenticated
  using (status = 'draft' and (is_branch_manager(branch_id) or has_branch_role(branch_id, '{storekeeper}')))
  with check (status in ('draft','cancelled'));

create policy pitems_read on purchase_items for select to authenticated
  using (exists (select 1 from purchases p where p.id = purchase_id));
create policy pitems_write on purchase_items for all to authenticated
  using (exists (select 1 from purchases p where p.id = purchase_id and p.status = 'draft'
                  and (is_branch_manager(p.branch_id) or has_branch_role(p.branch_id, '{storekeeper}'))))
  with check (exists (select 1 from purchases p where p.id = purchase_id and p.status = 'draft'
                  and (is_branch_manager(p.branch_id) or has_branch_role(p.branch_id, '{storekeeper}'))));

create policy spay_read on supplier_payments for select to authenticated
  using (org_reader(org_id) or branch_reader(branch_id));

-- Finanzas
create policy accounts_read on financial_accounts for select to authenticated
  using (org_reader(org_id) or has_company_role(company_id, '{supervisor,accountant}'));
create policy accounts_insert on financial_accounts for insert to authenticated
  with check (is_org_owner(org_id) and module_enabled(org_id, 'finance'));
create policy accounts_update on financial_accounts for update to authenticated
  using (is_org_owner(org_id)) with check (is_org_owner(org_id));

create policy expcat_read on expense_categories for select to authenticated using (is_org_member(org_id));
create policy expcat_write on expense_categories for insert to authenticated with check (is_org_owner(org_id));

create policy expenses_read on expenses for select to authenticated
  using (org_reader(org_id) or branch_reader(branch_id) or created_by = auth.uid());
create policy expenses_insert on expenses for insert to authenticated
  with check (created_by = auth.uid() and branch_reader(branch_id)
              and module_enabled(org_id, 'finance') and org_writable(org_id));

-- Restaurante
create policy areas_read on dining_areas for select to authenticated
  using (org_reader(org_id) or is_branch_member(branch_id));
create policy areas_write on dining_areas for all to authenticated
  using (is_branch_manager(branch_id)) with check (is_branch_manager(branch_id) and module_enabled(org_id, 'restaurant'));
create policy tables_read on dining_tables for select to authenticated
  using (org_reader(org_id) or is_branch_member(branch_id));
create policy tables_write on dining_tables for all to authenticated
  using (is_branch_manager(branch_id)) with check (is_branch_manager(branch_id) and module_enabled(org_id, 'restaurant'));

create policy modgroups_read on modifier_groups for select to authenticated using (is_company_member(company_id));
create policy modgroups_write on modifier_groups for all to authenticated
  using (has_company_role(company_id, '{supervisor}')) with check (has_company_role(company_id, '{supervisor}'));
create policy modopts_read on modifier_options for select to authenticated using (is_org_member(org_id));
create policy modopts_write on modifier_options for all to authenticated
  using (exists (select 1 from modifier_groups g where g.id = group_id and has_company_role(g.company_id, '{supervisor}')))
  with check (exists (select 1 from modifier_groups g where g.id = group_id and has_company_role(g.company_id, '{supervisor}')));
create policy pmg_read on product_modifier_groups for select to authenticated using (is_org_member(org_id));
create policy pmg_write on product_modifier_groups for all to authenticated
  using (exists (select 1 from products p where p.id = product_id and has_company_role(p.company_id, '{supervisor}')))
  with check (exists (select 1 from products p where p.id = product_id and has_company_role(p.company_id, '{supervisor}')));

create policy oim_read on order_item_modifiers for select to authenticated
  using (exists (select 1 from order_items oi where oi.id = order_item_id));
create policy oim_write on order_item_modifiers for all to authenticated
  using (exists (select 1 from order_items oi where oi.id = order_item_id and can_edit_order(oi.order_id)))
  with check (exists (select 1 from order_items oi where oi.id = order_item_id and can_edit_order(oi.order_id)));

-- Taller
create policy assets_read on assets for select to authenticated
  using (org_reader(org_id) or has_branch_role(branch_id, '{supervisor,technician,vendor,cashier}'));
create policy assets_write on assets for insert to authenticated
  with check (has_branch_role(branch_id, '{supervisor,technician,vendor}') and module_enabled(org_id, 'workshop'));
create policy assets_update on assets for update to authenticated
  using (has_branch_role(branch_id, '{supervisor,technician,vendor}'))
  with check (has_branch_role(branch_id, '{supervisor,technician,vendor}'));

create policy wo_read on work_orders for select to authenticated
  using (org_reader(org_id) or branch_reader(branch_id) or has_branch_role(branch_id, '{technician,cashier}'));
create policy wo_insert on work_orders for insert to authenticated
  with check (can_sell(branch_id) and module_enabled(org_id, 'workshop'));
create policy wo_update on work_orders for update to authenticated
  using (is_branch_manager(branch_id) or technician_id = auth.uid())
  with check (is_branch_manager(branch_id) or technician_id = auth.uid());

-- Personal
create policy att_read on attendance for select to authenticated
  using (user_id = auth.uid() or org_reader(org_id) or is_branch_manager(branch_id));
create policy comm_read on commission_rules for select to authenticated
  using (org_reader(org_id) or user_id = auth.uid());
create policy comm_write on commission_rules for all to authenticated
  using (is_org_owner(org_id)) with check (is_org_owner(org_id) and module_enabled(org_id, 'hr'));

-- =====================================================================
-- 13. PERMISOS
-- =====================================================================
grant select, insert, update on all tables in schema public to authenticated;
grant delete on order_items, installments, route_assignments, purchase_items, order_item_modifiers,
               recipes, product_modifier_groups, modifier_options, dining_tables, dining_areas to authenticated;
grant select on v_stock, v_purchase_balance, v_profit_and_loss, v_commissions to authenticated;
revoke execute on function post_stock(uuid, uuid, uuid, numeric, stock_movement_type, numeric, text, uuid, text) from public, anon, authenticated;
revoke execute on function apply_order_stock(uuid, uuid, uuid, text, int) from public, anon, authenticated;
