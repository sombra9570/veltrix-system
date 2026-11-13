-- =====================================================================
--  VELTRIX ENTERPRISE — 01 · Núcleo financiero (v3)
--  Motor: Supabase (PostgreSQL 15+) con Row Level Security (RLS)
--
--  Principios:
--   1. La verdad vive en la base de datos. Los permisos se aplican aquí
--      (RLS + funciones), no en la pantalla.
--   2. El dinero nunca se edita ni se borra: los errores se corrigen con
--      un REVERSO aprobado por el supervisor.
--   3. Los saldos no se guardan: se calculan a partir de los cobros
--      (no se pueden desincronizar).
--   4. Toda fila operativa lleva org_id + company_id + branch_id, y FKs
--      compuestas impiden mezclar datos de empresas o sucursales.
--   5. Todo cambio queda en audit_log. Si alguien que no es el cobrador
--      toca algo de una ruta, al cobrador le llega una notificación.
--
--  Orden: 0 tipos · 1 SaaS · 2 empresas · 3 IAM · 4 unidades operativas
--         5 comercial/cartera/tesorería · 6 auditoría · 7 helpers
--         8 triggers · 9 funciones de negocio · 10 vistas · 11 RLS · 12 permisos
-- =====================================================================

create extension if not exists pgcrypto;

-- =====================================================================
-- 0. TIPOS
-- =====================================================================
create type subscription_status as enum ('active','past_due_grace','suspended');
create type app_role            as enum ('owner','supervisor','cashier','vendor','collector',
                                         'waiter','kitchen','technician','storekeeper','accountant');
create type payment_condition   as enum ('cash','credit');
create type approval_status     as enum ('auto_approved','pending_supervisor','approved','rejected');
create type order_status        as enum ('draft','confirmed','cancelled');
create type payment_origin      as enum ('pos_counter','field_route');
create type payment_method      as enum ('cash','qr_transfer','card');
-- QR y tarjeta van directo a la cuenta: nunca quedan "en manos del cobrador"
create type custody_status      as enum ('in_collector_hands','in_register','direct_to_account');
create type shift_status        as enum ('open','closed_ok','discrepancy');
create type settlement_status   as enum ('pending_delivery','received_in_pos','audited');
create type credit_status       as enum ('approved','blocked','pending_approval');
create type visit_result        as enum ('paid','partial','promise','no_one_home','refused','other');
create type cash_movement_type  as enum ('expense','withdrawal','deposit','change_fund');
create type reversal_status     as enum ('pending','approved','rejected');

-- =====================================================================
-- 1. NIVEL SaaS
-- =====================================================================
create table plans (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique,
  name           text not null,
  price_usd      numeric(12,2) not null check (price_usd >= 0),
  max_companies  int,            -- null = ilimitado
  max_branches   int,
  max_users      int,
  features       jsonb not null default '{}',
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Superadmin = dueño de la plataforma. No pertenece a ninguna organización.
create table platform_admins (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table organizations (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,
  billing_email        text not null,
  plan_id              uuid not null references plans(id),
  subscription_status  subscription_status not null default 'active',
  next_billing_date    date,
  grace_ends_at        timestamptz,
  payment_method_token text,                       -- solo el token de la pasarela, nunca datos de tarjeta
  reporting_currency   char(3) not null default 'USD', -- moneda de los consolidados del Owner
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  deleted_at           timestamptz
);

-- Inmutable. Lo inserta el webhook de la pasarela (service role).
create table subscription_events (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id),
  gateway      text not null check (gateway in ('qr','card','manual')),
  gateway_ref  text,
  amount_usd   numeric(12,2) not null check (amount_usd >= 0),
  status       text not null check (status in ('pending','paid','failed','refunded')),
  period_start date,
  period_end   date,
  created_at   timestamptz not null default now(),
  unique (gateway, gateway_ref)                     -- un webhook repetido no duplica el pago
);

-- Acceso de soporte: el Owner autoriza al superadmin a VER (solo lectura) por tiempo limitado.
create table support_access_grants (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id),
  granted_by  uuid not null references auth.users(id),
  reason      text not null,
  expires_at  timestamptz not null,
  revoked_at  timestamptz,
  created_at  timestamptz not null default now(),
  check (expires_at <= created_at + interval '72 hours')
);

-- =====================================================================
-- 2. ENTIDAD LEGAL Y SUCURSALES
-- =====================================================================
create table companies (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id),
  legal_name     text not null,
  tax_id         text,
  country_code   char(2) not null,
  base_currency  char(3) not null,
  tax_regime     text,
  tax_rate       numeric(6,4) not null default 0 check (tax_rate between 0 and 1),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid,
  deleted_at     timestamptz,
  unique (org_id, id)
);

create table branches (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  company_id  uuid not null,
  code        text not null,
  name        text not null,
  timezone    text not null default 'America/La_Paz',
  address     text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid,
  deleted_at  timestamptz,
  foreign key (org_id, company_id) references companies(org_id, id),
  unique (company_id, code),
  unique (org_id, company_id, id)
);

-- =====================================================================
-- 3. IDENTIDAD Y ALCANCE (IAM)
--    profiles = la persona. memberships = qué rol tiene y dónde.
--    Una persona puede tener varias membresías (ej. supervisor en 2
--    sucursales, o dueño que también atiende una caja).
-- =====================================================================
create table profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  org_id          uuid references organizations(id),   -- null solo para superadmin
  full_name       text not null,
  phone           text,
  preferred_lang  text not null default 'es',
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (org_id, id)
);

create table memberships (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  user_id     uuid not null,
  company_id  uuid,
  branch_id   uuid,
  role        app_role not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid,
  deleted_at  timestamptz,
  foreign key (org_id, user_id) references profiles(org_id, id),
  foreign key (org_id, company_id, branch_id) references branches(org_id, company_id, id),
  -- owner abarca toda la organización; el resto del personal siempre tiene sucursal
  check ( (role = 'owner' and company_id is null and branch_id is null)
       or (role <> 'owner' and company_id is not null and branch_id is not null) ),
  unique nulls not distinct (user_id, branch_id, role)
);

-- =====================================================================
-- 4. UNIDADES OPERATIVAS
-- =====================================================================
-- Ya no guarda current_shift_id ni status: se sabe por el turno abierto
-- (evita referencias circulares y datos duplicados).
create table cash_registers (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  company_id  uuid not null,
  branch_id   uuid not null,
  name        text not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid,
  deleted_at  timestamptz,
  foreign key (org_id, company_id, branch_id) references branches(org_id, company_id, id),
  unique (branch_id, name),
  unique (org_id, branch_id, id)
);

create table register_shifts (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null,
  company_id     uuid not null,
  branch_id      uuid not null,
  register_id    uuid not null,
  cashier_id     uuid not null references profiles(id),
  opened_at      timestamptz not null default now(),
  closed_at      timestamptz,
  opening_cash   numeric(14,2) not null check (opening_cash >= 0),
  expected_cash  numeric(14,2),  -- ARQUEO CIEGO: queda NULL hasta que el cajero declara
  declared_cash  numeric(14,2),
  difference     numeric(14,2),  -- declarado − esperado
  status         shift_status not null default 'open',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  foreign key (org_id, company_id, branch_id) references branches(org_id, company_id, id),
  foreign key (org_id, branch_id, register_id) references cash_registers(org_id, branch_id, id),
  unique (org_id, branch_id, id),
  check ((status = 'open') = (closed_at is null)),
  check (status = 'open' or (expected_cash is not null and declared_cash is not null))
);
create unique index one_open_shift_per_register on register_shifts(register_id) where status = 'open';
create unique index one_open_shift_per_cashier  on register_shifts(cashier_id)  where status = 'open';

create table collection_routes (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null,
  company_id     uuid not null,
  branch_id      uuid not null,
  name           text not null,
  zone_code      text,
  supervisor_id  uuid references profiles(id),
  collector_id   uuid references profiles(id),
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid,
  deleted_at     timestamptz,
  foreign key (org_id, company_id, branch_id) references branches(org_id, company_id, id),
  unique (org_id, branch_id, id)
);

-- =====================================================================
-- 5. COMERCIAL, CARTERA Y TESORERÍA
-- =====================================================================
-- Sin current_balance: el saldo se calcula (vista v_customer_balance).
create table customers (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null,
  company_id     uuid not null,
  branch_id      uuid not null,
  route_id       uuid,
  name           text not null,
  tax_id         text,
  phone          text,
  address        text,
  gps_lat        numeric(9,6),
  gps_lng        numeric(9,6),
  credit_limit   numeric(14,2) not null default 0 check (credit_limit >= 0),
  credit_status  credit_status not null default 'approved',
  is_walk_in     boolean not null default false,   -- "Consumidor final" de la sucursal
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid,
  deleted_at     timestamptz,
  foreign key (org_id, company_id, branch_id) references branches(org_id, company_id, id),
  foreign key (org_id, branch_id, route_id) references collection_routes(org_id, branch_id, id),
  unique (org_id, branch_id, id)
);

create table products (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  company_id  uuid not null,
  sku         text not null,
  name        text not null,
  unit_price  numeric(14,2) not null check (unit_price >= 0),
  currency    char(3) not null,
  tax_rate    numeric(6,4) not null default 0 check (tax_rate between 0 and 1),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid,
  deleted_at  timestamptz,
  foreign key (org_id, company_id) references companies(org_id, id),
  unique (company_id, sku),
  unique (org_id, id)
);

-- Pedido (venta). La FACTURA FISCAL es un módulo aparte (no incluido),
-- porque cada país tiene sus propias reglas de facturación.
-- Tres estados separados: status (ciclo de vida), approval_status
-- (crédito) y el estado de pago, que se calcula en v_order_balance.
create table orders (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null,
  company_id         uuid not null,
  branch_id          uuid not null,
  customer_id        uuid not null,
  vendor_id          uuid not null references profiles(id),
  payment_condition  payment_condition not null,
  status             order_status not null default 'draft',
  approval_status    approval_status,          -- null mientras es borrador
  approved_by        uuid references profiles(id),
  approved_at        timestamptz,
  rejection_reason   text,
  currency           char(3) not null,
  subtotal           numeric(14,2) not null default 0,
  tax_amount         numeric(14,2) not null default 0,
  total_amount       numeric(14,2) not null default 0,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz,
  foreign key (org_id, company_id, branch_id) references branches(org_id, company_id, id),
  foreign key (org_id, branch_id, customer_id) references customers(org_id, branch_id, id),
  unique (org_id, branch_id, id),
  unique (org_id, id),
  check (status <> 'confirmed' or approval_status is not null)
);

create table order_items (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null,
  order_id     uuid not null,
  product_id   uuid references products(id),
  description  text not null,
  qty          numeric(12,3) not null check (qty > 0),
  unit_price   numeric(14,2) not null check (unit_price >= 0),
  tax_rate     numeric(6,4) not null default 0 check (tax_rate between 0 and 1),
  line_total   numeric(14,2) generated always as (round(qty * unit_price, 2)) stored,
  created_at   timestamptz not null default now(),
  foreign key (org_id, order_id) references orders(org_id, id) on delete cascade
);

-- CUOTAS. Una venta al contado tiene 1 cuota que vence hoy;
-- una venta a crédito tiene N cuotas. Todo cobro se aplica a cuotas.
create table installments (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  company_id  uuid not null,
  branch_id   uuid not null,
  order_id    uuid not null,
  customer_id uuid not null,   -- copiado del pedido (el cobrador no ve pedidos)
  number      int  not null check (number > 0),
  due_date    date not null,
  amount      numeric(14,2) not null check (amount > 0),
  currency    char(3) not null,
  created_at  timestamptz not null default now(),
  foreign key (org_id, branch_id, order_id) references orders(org_id, branch_id, id) on delete cascade,
  unique (order_id, number),
  unique (org_id, branch_id, id)
);

-- Hoja de ruta del día: qué cuota visita qué ruta en qué fecha.
create table route_assignments (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null,
  company_id      uuid not null,
  branch_id       uuid not null,
  route_id        uuid not null,
  installment_id  uuid not null,
  assign_date     date not null,
  visit_order     int,
  assigned_by     uuid references profiles(id),
  created_at      timestamptz not null default now(),
  foreign key (org_id, branch_id, route_id) references collection_routes(org_id, branch_id, id),
  foreign key (org_id, branch_id, installment_id) references installments(org_id, branch_id, id),
  unique (installment_id, assign_date)
);

-- Visitas: cobradas, fallidas, promesas de pago.
create table visits (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null,
  company_id      uuid not null,
  branch_id       uuid not null,
  route_id        uuid not null,
  customer_id     uuid not null,
  assignment_id   uuid references route_assignments(id) on delete set null,
  collector_id    uuid not null references profiles(id),
  result          visit_result not null,
  promise_date    date,
  promise_amount  numeric(14,2) check (promise_amount > 0),
  notes           text,
  gps_lat         numeric(9,6),
  gps_lng         numeric(9,6),
  offline_uuid    uuid unique,
  visited_at      timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  foreign key (org_id, branch_id, route_id) references collection_routes(org_id, branch_id, id),
  foreign key (org_id, branch_id, customer_id) references customers(org_id, branch_id, id),
  check (result <> 'promise' or promise_date is not null)
);

-- Rendición de calle (cierre de ruta → entrega en caja → auditoría).
create table route_settlements (
  id                       uuid primary key default gen_random_uuid(),
  org_id                   uuid not null,
  company_id               uuid not null,
  branch_id                uuid not null,
  route_id                 uuid not null,
  collector_id             uuid not null references profiles(id),
  supervisor_id            uuid references profiles(id),
  currency                 char(3) not null,
  total_cash_collected     numeric(14,2) not null default 0,
  total_digital_collected  numeric(14,2) not null default 0,  -- QR + tarjeta (informativo)
  total_expenses           numeric(14,2) not null default 0,
  expected_cash_delivery   numeric(14,2) not null default 0,  -- efectivo − gastos
  declared_cash_delivered  numeric(14,2),                     -- lo que cuenta el cajero (ciego)
  difference               numeric(14,2),
  received_by_shift_id     uuid,
  received_at              timestamptz,
  audited_by               uuid references profiles(id),
  audited_at               timestamptz,
  audit_notes              text,
  status                   settlement_status not null default 'pending_delivery',
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  foreign key (org_id, company_id, branch_id) references branches(org_id, company_id, id),
  foreign key (org_id, branch_id, route_id) references collection_routes(org_id, branch_id, id),
  foreign key (org_id, branch_id, received_by_shift_id) references register_shifts(org_id, branch_id, id),
  unique (org_id, branch_id, id)
);

-- COBROS. Inmutables (ver trigger guard_payment_update). Se crean solo
-- con la función register_payment(). Un error se corrige con un reverso
-- (fila negativa con reverses_payment_id).
create table payments (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null,
  company_id          uuid not null,
  branch_id           uuid not null,
  customer_id         uuid not null,
  origin_type         payment_origin not null,
  shift_id            uuid,   -- si fue en caja
  route_id            uuid,   -- si fue en calle
  settlement_id       uuid,   -- rendición en la que entró
  collected_by        uuid not null references profiles(id),
  method              payment_method not null,
  amount              numeric(14,2) not null check (amount <> 0),
  currency            char(3) not null,
  custody_status      custody_status not null,
  offline_uuid        uuid unique,          -- un cobro sincronizado 2 veces se rechaza solo
  reverses_payment_id uuid unique references payments(id),  -- un cobro solo se puede reversar 1 vez
  needs_review        boolean not null default false,
  review_note         text,
  collected_at        timestamptz not null default now(),  -- hora del dispositivo
  created_at          timestamptz not null default now(),  -- hora del servidor
  foreign key (org_id, company_id, branch_id) references branches(org_id, company_id, id),
  foreign key (org_id, branch_id, customer_id) references customers(org_id, branch_id, id),
  foreign key (org_id, branch_id, shift_id) references register_shifts(org_id, branch_id, id),
  foreign key (org_id, branch_id, route_id) references collection_routes(org_id, branch_id, id),
  foreign key (org_id, branch_id, settlement_id) references route_settlements(org_id, branch_id, id),
  unique (org_id, id),
  -- origen sin mezclar: caja XOR ruta
  check ( (origin_type = 'pos_counter' and shift_id is not null and route_id is null)
       or (origin_type = 'field_route' and route_id is not null and shift_id is null) ),
  -- solo el efectivo tiene custodia física
  check ( (method = 'cash') = (custody_status <> 'direct_to_account') ),
  check ( custody_status <> 'in_collector_hands' or origin_type = 'field_route' ),
  -- montos negativos solo para reversos
  check ( (amount > 0) = (reverses_payment_id is null) )
);
create index payments_route_unsettled on payments(route_id) where settlement_id is null;
create index payments_shift on payments(shift_id);

-- Un cobro puede cubrir varias cuotas (de una o varias ventas del mismo cliente).
create table payment_allocations (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null,
  payment_id      uuid not null,
  installment_id  uuid not null references installments(id),
  amount          numeric(14,2) not null check (amount <> 0),
  created_at      timestamptz not null default now(),
  foreign key (org_id, payment_id) references payments(org_id, id),
  unique (payment_id, installment_id)
);
create index payment_allocations_installment on payment_allocations(installment_id);

create table payment_reversals (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null,
  company_id           uuid not null,
  branch_id            uuid not null,
  payment_id           uuid not null unique references payments(id),
  requested_by         uuid not null references profiles(id),
  reason               text not null,
  status               reversal_status not null default 'pending',
  decided_by           uuid references profiles(id),
  decided_at           timestamptz,
  reversal_payment_id  uuid references payments(id),
  created_at           timestamptz not null default now(),
  foreign key (org_id, company_id, branch_id) references branches(org_id, company_id, id)
);

-- Gastos de ruta, retiros, depósitos y fondo de cambio.
-- Va contra un turno de caja O contra una ruta (nunca ambos).
create table cash_movements (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null,
  company_id     uuid not null,
  branch_id      uuid not null,
  type           cash_movement_type not null,
  amount         numeric(14,2) not null check (amount > 0),
  currency       char(3) not null,
  shift_id       uuid,
  route_id       uuid,
  settlement_id  uuid,
  description    text not null,
  created_by     uuid not null references profiles(id),
  approved_by    uuid references profiles(id),
  created_at     timestamptz not null default now(),
  foreign key (org_id, company_id, branch_id) references branches(org_id, company_id, id),
  foreign key (org_id, branch_id, shift_id) references register_shifts(org_id, branch_id, id),
  foreign key (org_id, branch_id, route_id) references collection_routes(org_id, branch_id, id),
  foreign key (org_id, branch_id, settlement_id) references route_settlements(org_id, branch_id, id),
  check ( (shift_id is not null) <> (route_id is not null) ),
  check ( route_id is null or type = 'expense' )   -- en calle solo se registran gastos
);

-- Tipos de cambio para los consolidados multi-moneda del Owner.
create table exchange_rates (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id),
  rate_date      date not null,
  from_currency  char(3) not null,
  to_currency    char(3) not null,
  rate           numeric(18,8) not null check (rate > 0),
  created_by     uuid,
  created_at     timestamptz not null default now(),
  unique (org_id, rate_date, from_currency, to_currency)
);

-- =====================================================================
-- 6. AUDITORÍA Y NOTIFICACIONES
-- =====================================================================
create table audit_log (
  id          bigint generated always as identity primary key,
  org_id      uuid,
  branch_id   uuid,
  table_name  text not null,
  row_id      uuid,
  action      text not null,
  actor_id    uuid,
  old_data    jsonb,
  new_data    jsonb,
  created_at  timestamptz not null default now()
);
create index audit_log_org on audit_log(org_id, created_at desc);

create table notifications (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid,
  user_id     uuid not null references profiles(id),
  kind        text not null,
  data        jsonb not null default '{}',
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index notifications_user on notifications(user_id, created_at desc);

-- =====================================================================
-- 7. FUNCIONES DE PERMISO (helpers para RLS)
--    security definer: leen memberships sin pasar por RLS (evita recursión)
-- =====================================================================
create function is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = auth.uid());
$$;

create function is_org_member(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships m join profiles p on p.id = m.user_id
    where m.user_id = auth.uid() and m.org_id = p_org
      and m.is_active and m.deleted_at is null and p.is_active);
$$;

create function is_org_owner(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships m join profiles p on p.id = m.user_id
    where m.user_id = auth.uid() and m.org_id = p_org and m.role = 'owner'
      and m.is_active and m.deleted_at is null and p.is_active);
$$;

create function has_support_grant(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_platform_admin() and exists (
    select 1 from support_access_grants g
    where g.org_id = p_org and g.expires_at > now() and g.revoked_at is null);
$$;

-- Lectura total de la organización: Owner, o superadmin con permiso de soporte vigente
create function org_reader(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_org_owner(p_org) or has_support_grant(p_org);
$$;

create function has_branch_role(p_branch uuid, p_roles app_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships m join profiles p on p.id = m.user_id
    where m.user_id = auth.uid() and m.branch_id = p_branch and m.role = any(p_roles)
      and m.is_active and m.deleted_at is null and p.is_active);
$$;

-- Owner de la org de esa sucursal, o supervisor de esa sucursal
create function is_branch_manager(p_branch uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from branches b where b.id = p_branch and is_org_owner(b.org_id))
      or has_branch_role(p_branch, '{supervisor}');
$$;

create function is_company_member(p_company uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from companies c where c.id = p_company and is_org_owner(c.org_id))
      or exists (
        select 1 from memberships m join profiles p on p.id = m.user_id
        where m.user_id = auth.uid() and m.company_id = p_company
          and m.is_active and m.deleted_at is null and p.is_active);
$$;

-- Una organización suspendida queda en SOLO LECTURA (pero puede rendir rutas)
create function org_writable(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select subscription_status <> 'suspended' from organizations where id = p_org), false);
$$;

create function branch_today(p_branch uuid) returns date
language sql stable security definer set search_path = public as $$
  select (now() at time zone (select timezone from branches where id = p_branch))::date;
$$;

-- El cobrador solo ve las cuotas asignadas HOY a su ruta
create function collector_sees_installment(p_installment uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from route_assignments ra join collection_routes r on r.id = ra.route_id
    where ra.installment_id = p_installment and r.collector_id = auth.uid()
      and ra.assign_date = branch_today(ra.branch_id));
$$;

create function collector_sees_customer(p_customer uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from customers c join collection_routes r on r.id = c.route_id
    where c.id = p_customer and r.collector_id = auth.uid())
  or exists (
    select 1 from route_assignments ra
    join collection_routes r on r.id = ra.route_id
    join installments i on i.id = ra.installment_id
    where i.customer_id = p_customer and r.collector_id = auth.uid()
      and ra.assign_date = branch_today(ra.branch_id));
$$;

-- Saldos calculados (nunca guardados)
create function installment_paid(p_installment uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(amount), 0) from payment_allocations where installment_id = p_installment;
$$;

create function customer_open_balance(p_customer uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(i.amount), 0) - coalesce(sum(installment_paid(i.id)), 0)
  from installments i join orders o on o.id = i.order_id
  where o.customer_id = p_customer and o.status = 'confirmed'
    and o.approval_status in ('auto_approved','approved','pending_supervisor');
$$;

-- =====================================================================
-- 8. TRIGGERS
-- =====================================================================
create function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

-- Rellena org_id/company_id desde la sucursal: el cliente no puede falsearlos
create function fill_scope_from_branch() returns trigger
language plpgsql security definer set search_path = public as $$
declare b record;
begin
  select org_id, company_id into b from branches where id = new.branch_id;
  if not found then raise exception 'Sucursal inexistente'; end if;
  new := jsonb_populate_record(new, jsonb_build_object('org_id', b.org_id, 'company_id', b.company_id));
  return new;
end $$;

create function fill_scope_from_order() returns trigger
language plpgsql security definer set search_path = public as $$
declare o record;
begin
  select org_id, company_id, branch_id, currency, customer_id into o from orders where id = new.order_id;
  if not found then raise exception 'Pedido inexistente'; end if;
  new := jsonb_populate_record(new, jsonb_build_object(
           'org_id', o.org_id, 'company_id', o.company_id,
           'branch_id', o.branch_id, 'currency', o.currency, 'customer_id', o.customer_id));
  return new;
end $$;

create function fill_org_from_payment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select org_id into new.org_id from payments where id = new.payment_id;
  return new;
end $$;

-- Valida que el personal asignado tenga el rol correcto en esa sucursal
create function assert_staff(p_user uuid, p_branch uuid, p_role app_role) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if p_user is not null and not exists (
      select 1 from memberships where user_id = p_user and branch_id = p_branch
        and role = p_role and is_active and deleted_at is null) then
    raise exception 'El usuario no tiene el rol % en esta sucursal', p_role;
  end if;
end $$;

create function validate_route_staff() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform assert_staff(new.collector_id,  new.branch_id, 'collector');
  perform assert_staff(new.supervisor_id, new.branch_id, 'supervisor');
  return new;
end $$;

create function validate_shift_staff() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform assert_staff(new.cashier_id, new.branch_id, 'cashier');
  if not exists (select 1 from cash_registers where id = new.register_id and is_active and deleted_at is null) then
    raise exception 'La caja está inactiva';
  end if;
  return new;
end $$;

-- Límites del plan SaaS
create function enforce_plan_limits() returns trigger
language plpgsql security definer set search_path = public as $$
declare v plans%rowtype; n int;
begin
  select p.* into v from organizations o join plans p on p.id = o.plan_id where o.id = new.org_id;
  if tg_table_name = 'companies' and v.max_companies is not null then
    select count(*) into n from companies where org_id = new.org_id and deleted_at is null;
    if n >= v.max_companies then raise exception 'Tu plan permite máximo % empresa(s)', v.max_companies; end if;
  elsif tg_table_name = 'branches' and v.max_branches is not null then
    select count(*) into n from branches where org_id = new.org_id and deleted_at is null;
    if n >= v.max_branches then raise exception 'Tu plan permite máximo % sucursal(es)', v.max_branches; end if;
  elsif tg_table_name = 'memberships' and v.max_users is not null then
    select count(distinct user_id) into n from memberships
     where org_id = new.org_id and deleted_at is null and user_id <> new.user_id;
    if n >= v.max_users then raise exception 'Tu plan permite máximo % usuario(s)', v.max_users; end if;
  end if;
  return new;
end $$;

-- Datos de suscripción: solo los cambia la pasarela (service role) o el superadmin
create function guard_org_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not is_platform_admin() and
     (new.subscription_status, new.plan_id, new.next_billing_date, new.grace_ends_at, new.payment_method_token)
     is distinct from
     (old.subscription_status, old.plan_id, old.next_billing_date, old.grace_ends_at, old.payment_method_token) then
    raise exception 'Los datos de suscripción solo los cambia la pasarela de pago';
  end if;
  return new;
end $$;

create function guard_profile_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.org_id is not null and new.org_id is distinct from old.org_id then
    raise exception 'Un usuario no puede cambiar de organización';
  end if;
  if new.is_active is distinct from old.is_active and auth.uid() is not null
     and not is_org_owner(old.org_id) then
    raise exception 'Solo el Owner puede activar o desactivar usuarios';
  end if;
  return new;
end $$;

-- Límite y estado de crédito: solo supervisor u owner
create function guard_customer_credit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or is_branch_manager(new.branch_id) then return new; end if;
  if tg_op = 'INSERT' then
    if new.credit_limit > 0 then new.credit_status := 'pending_approval'; end if;
  elsif (new.credit_limit, new.credit_status) is distinct from (old.credit_limit, old.credit_status) then
    raise exception 'Solo supervisor u owner pueden cambiar el crédito del cliente';
  end if;
  return new;
end $$;

-- Ciclo de vida del pedido + aprobación automática de crédito
create function order_lifecycle() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_sub numeric; v_tax numeric; v_inst numeric; c record;
begin
  -- Borrador → Confirmado: se calculan totales, cuotas y aprobación
  if old.status = 'draft' and new.status = 'confirmed' then
    select coalesce(sum(line_total),0), coalesce(sum(round(line_total * tax_rate, 2)),0)
      into v_sub, v_tax from order_items where order_id = new.id;
    if v_sub <= 0 then raise exception 'El pedido no tiene ítems'; end if;
    new.subtotal := v_sub; new.tax_amount := v_tax; new.total_amount := v_sub + v_tax;
    new.approved_by := null; new.approved_at := null;

    if new.payment_condition = 'cash' then
      delete from installments where order_id = new.id;
      insert into installments (order_id, number, due_date, amount)
      values (new.id, 1, branch_today(new.branch_id), new.total_amount);
      new.approval_status := 'auto_approved';      -- pasa a la cola de Caja
    else
      select coalesce(sum(amount),0) into v_inst from installments where order_id = new.id;
      if v_inst <> new.total_amount then
        raise exception 'Las cuotas suman % pero el total es %', v_inst, new.total_amount;
      end if;
      select credit_status, credit_limit into c from customers where id = new.customer_id;
      if c.credit_status <> 'approved'
         or customer_open_balance(new.customer_id) + new.total_amount > c.credit_limit then
        new.approval_status := 'pending_supervisor'; -- cae en la bandeja del Supervisor
      else
        new.approval_status := 'auto_approved';
      end if;
    end if;
    return new;
  end if;

  -- Borrador → Borrador / Cancelado: el vendedor no puede tocar la aprobación
  if old.status = 'draft' then
    if new.approval_status is distinct from old.approval_status then
      raise exception 'La aprobación la define el sistema o el supervisor';
    end if;
    return new;
  end if;

  -- Pedido ya confirmado: solo supervisor/owner y solo aprobación o cancelación
  if auth.uid() is not null and not is_branch_manager(old.branch_id) then
    raise exception 'Solo supervisor u owner pueden modificar un pedido confirmado';
  end if;
  if (new.customer_id, new.payment_condition, new.currency, new.subtotal, new.tax_amount, new.total_amount, new.branch_id)
     is distinct from
     (old.customer_id, old.payment_condition, old.currency, old.subtotal, old.tax_amount, old.total_amount, old.branch_id) then
    raise exception 'Los montos de un pedido confirmado no se pueden cambiar';
  end if;
  if new.status = 'draft' then raise exception 'Un pedido confirmado no vuelve a borrador'; end if;
  if new.status = 'cancelled' and old.status <> 'cancelled' and exists (
       select 1 from installments i where i.order_id = old.id and installment_paid(i.id) <> 0) then
    raise exception 'El pedido tiene cobros: primero hay que reversarlos';
  end if;
  if new.approval_status is distinct from old.approval_status then
    if old.approval_status <> 'pending_supervisor' or new.approval_status not in ('approved','rejected') then
      raise exception 'Cambio de aprobación no permitido';
    end if;
    new.approved_by := auth.uid(); new.approved_at := now();
  end if;
  return new;
end $$;

-- Ítems y cuotas solo se editan mientras el pedido es borrador
create function guard_draft_children() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_order uuid := coalesce(new.order_id, old.order_id);
begin
  if exists (select 1 from orders where id = v_order and status <> 'draft') then
    raise exception 'El pedido ya está confirmado: no se puede modificar';
  end if;
  return coalesce(new, old);
end $$;

-- Validaciones de cada aplicación de cobro a cuota
create function validate_allocation() returns trigger
language plpgsql security definer set search_path = public as $$
declare p payments%rowtype; i record; v_sum_pay numeric;
begin
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
    -- Conflicto offline: el cobro se acepta (el dinero ya se recibió),
    -- pero si la cuota ya no estaba asignada a esa ruta ese día, se marca para revisión.
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
end $$;

-- El dinero no se edita ni se borra
create function guard_payment_update() returns trigger
language plpgsql as $$
begin
  if (to_jsonb(new) - array['settlement_id','custody_status','needs_review','review_note'])
     <> (to_jsonb(old) - array['settlement_id','custody_status','needs_review','review_note']) then
    raise exception 'Un cobro no se puede modificar: solicite un reverso';
  end if;
  return new;
end $$;

create function forbid_change() returns trigger language plpgsql as $$
begin
  raise exception 'Los registros de % no se pueden % (son históricos)', tg_table_name, lower(tg_op);
end $$;

-- Auditoría universal + aviso al cobrador cuando otro toca su ruta
create function audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_route uuid; v_collector uuid;
begin
  insert into audit_log (org_id, branch_id, table_name, row_id, action, actor_id, old_data, new_data)
  values ((v_row->>'org_id')::uuid,
          (v_row->>'branch_id')::uuid,
          tg_table_name, (v_row->>'id')::uuid, tg_op, auth.uid(), v_old, v_new);

  v_route := (v_row->>'route_id')::uuid;
  if v_route is not null and auth.uid() is not null then
    select collector_id into v_collector from collection_routes where id = v_route;
    if v_collector is not null and v_collector <> auth.uid() then
      insert into notifications (org_id, user_id, kind, data)
      values ((v_row->>'org_id')::uuid, v_collector,
              tg_table_name || '.' || lower(tg_op),
              jsonb_build_object('row_id', v_row->>'id', 'by', auth.uid(), 'old', v_old, 'new', v_new));
    end if;
  end if;
  return coalesce(new, old);
end $$;

-- Suscripción: pago confirmado por webhook → reactivación automática
create function on_subscription_paid() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'paid' then
    update organizations
       set subscription_status = 'active', grace_ends_at = null,
           next_billing_date = coalesce(new.period_end, (coalesce(next_billing_date, current_date) + interval '1 month')::date)
     where id = new.org_id;
  end if;
  return new;
end $$;

-- ---------- Asignación de triggers ----------
do $$
declare t text;
begin
  -- updated_at
  foreach t in array array['plans','organizations','companies','branches','profiles','memberships',
    'cash_registers','register_shifts','collection_routes','customers','products','orders','route_settlements']
  loop
    execute format('create trigger %I_updated_at before update on %I for each row execute function set_updated_at()', t, t);
  end loop;

  -- org_id/company_id derivados de la sucursal
  foreach t in array array['cash_registers','register_shifts','collection_routes','customers','orders',
    'route_assignments','visits','route_settlements','payments','payment_reversals','cash_movements']
  loop
    execute format('create trigger %I_scope before insert or update of branch_id on %I for each row execute function fill_scope_from_branch()', t, t);
  end loop;

  -- auditoría
  foreach t in array array['organizations','companies','branches','profiles','memberships','cash_registers',
    'register_shifts','collection_routes','customers','products','orders','installments','route_assignments',
    'visits','payments','payment_allocations','payment_reversals','route_settlements','cash_movements',
    'exchange_rates','support_access_grants','subscription_events']
  loop
    execute format('create trigger %I_audit after insert or update or delete on %I for each row execute function audit_row()', t, t);
  end loop;
end $$;

create trigger order_items_scope   before insert on order_items  for each row execute function fill_scope_from_order();
create trigger installments_scope  before insert on installments for each row execute function fill_scope_from_order();
create trigger allocations_scope   before insert on payment_allocations for each row execute function fill_org_from_payment();

create trigger routes_staff  before insert or update of collector_id, supervisor_id on collection_routes
  for each row execute function validate_route_staff();
create trigger shifts_staff  before insert on register_shifts for each row execute function validate_shift_staff();

create trigger companies_plan   before insert on companies   for each row execute function enforce_plan_limits();
create trigger branches_plan    before insert on branches    for each row execute function enforce_plan_limits();
create trigger memberships_plan before insert on memberships for each row execute function enforce_plan_limits();

create trigger organizations_guard before update on organizations for each row execute function guard_org_update();
create trigger profiles_guard      before update on profiles      for each row execute function guard_profile_update();
create trigger customers_credit    before insert or update on customers for each row execute function guard_customer_credit();
create trigger orders_lifecycle    before update on orders        for each row execute function order_lifecycle();

create trigger order_items_draft  before insert or update or delete on order_items  for each row execute function guard_draft_children();
create trigger installments_draft before insert or update or delete on installments for each row execute function guard_draft_children();

create trigger allocations_validate before insert on payment_allocations for each row execute function validate_allocation();

create trigger payments_immutable    before update on payments for each row execute function guard_payment_update();
create trigger payments_no_delete    before delete on payments for each row execute function forbid_change();
create trigger allocations_immutable before update or delete on payment_allocations for each row execute function forbid_change();
create trigger audit_immutable       before update or delete on audit_log for each row execute function forbid_change();
create trigger subs_events_immutable before update or delete on subscription_events for each row execute function forbid_change();
create trigger cash_mov_no_delete    before delete on cash_movements for each row execute function forbid_change();

create trigger subscription_paid after insert on subscription_events for each row execute function on_subscription_paid();

-- =====================================================================
-- 9. FUNCIONES DE NEGOCIO (la app llama a estas, no escribe directo)
-- =====================================================================

-- Alta de una organización nueva desde /pricing (el usuario ya se registró en Supabase Auth)
create function create_organization(
  p_org_name text, p_billing_email text, p_plan_code text, p_full_name text,
  p_legal_name text, p_country char(2), p_currency char(3), p_tax_id text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_plan uuid;
begin
  if auth.uid() is null then raise exception 'Debe iniciar sesión'; end if;
  if exists (select 1 from profiles where id = auth.uid() and org_id is not null) then
    raise exception 'Este usuario ya pertenece a una organización';
  end if;
  select id into v_plan from plans where code = p_plan_code and is_active;
  if v_plan is null then raise exception 'Plan inexistente'; end if;

  insert into organizations (name, billing_email, plan_id, next_billing_date)
  values (p_org_name, p_billing_email, v_plan, (current_date + interval '1 month')::date)
  returning id into v_org;

  insert into profiles (id, org_id, full_name) values (auth.uid(), v_org, p_full_name)
  on conflict (id) do update set org_id = excluded.org_id, full_name = excluded.full_name;

  insert into memberships (org_id, user_id, role, created_by) values (v_org, auth.uid(), 'owner', auth.uid());
  insert into companies (org_id, legal_name, tax_id, country_code, base_currency, created_by)
  values (v_org, p_legal_name, p_tax_id, p_country, p_currency, auth.uid());
  return v_org;
end $$;

-- Genera cuotas de un pedido a crédito en borrador (opción de saltar domingos)
create function generate_installments(
  p_order uuid, p_count int, p_every_days int, p_first_due date, p_skip_sundays boolean default false
) returns void
language plpgsql security invoker set search_path = public as $$
declare v_total numeric; v_each numeric; v_due date := p_first_due; k int;
begin
  if p_count < 1 or p_every_days < 1 then raise exception 'Parámetros inválidos'; end if;
  select coalesce(sum(line_total + round(line_total * tax_rate, 2)),0) into v_total
    from order_items where order_id = p_order;
  if v_total <= 0 then raise exception 'Agregue ítems antes de generar cuotas'; end if;
  delete from installments where order_id = p_order;
  v_each := trunc(v_total / p_count, 2);
  for k in 1..p_count loop
    if p_skip_sundays and extract(isodow from v_due) = 7 then v_due := v_due + 1; end if;
    insert into installments (order_id, number, due_date, amount)
    values (p_order, k, v_due,
            case when k = p_count then v_total - v_each * (p_count - 1) else v_each end);
    v_due := v_due + p_every_days;
  end loop;
end $$;

-- Decisión del supervisor sobre un crédito retenido
create function decide_credit(p_order uuid, p_approve boolean, p_reason text default null) returns void
language plpgsql security invoker set search_path = public as $$
begin
  update orders set approval_status = case when p_approve then 'approved'::approval_status else 'rejected'::approval_status end,
                    rejection_reason = case when p_approve then null else p_reason end
   where id = p_order;
  if not found then raise exception 'Pedido no encontrado o sin permiso'; end if;
end $$;

-- ÚNICA puerta de entrada de dinero. Idempotente por offline_uuid.
-- Si no se indican cuotas, aplica a las más antiguas del cliente.
create function register_payment(
  p_customer uuid, p_origin payment_origin, p_method payment_method, p_amount numeric,
  p_shift uuid default null, p_route uuid default null,
  p_installment_ids uuid[] default null, p_offline_uuid uuid default null,
  p_collected_at timestamptz default now(), p_order uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid; c customers%rowtype; v_currency char(3); v_custody custody_status;
  v_left numeric := p_amount; v_take numeric; v_r record;
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

  -- Aplicación a cuotas (más antigua primero)
  for v_r in
    select i.id, i.amount - installment_paid(i.id) as balance
      from installments i join orders o on o.id = i.order_id
     where o.customer_id = c.id and o.status = 'confirmed'
       and o.approval_status in ('auto_approved','approved')
       and (p_installment_ids is null or i.id = any(p_installment_ids))
       and (p_order is null or o.id = p_order)
     order by i.due_date, o.created_at, i.number
  loop
    exit when v_left <= 0;
    continue when v_r.balance <= 0;
    v_take := least(v_left, v_r.balance);
    insert into payment_allocations (payment_id, installment_id, amount) values (v_id, v_r.id, v_take);
    v_left := v_left - v_take;
  end loop;

  if v_left > 0 then
    raise exception 'El monto excede la deuda pendiente en % (no se registró nada)', v_left;
  end if;
  return v_id;
end $$;

-- Solicitud de reverso (quien cobró o un supervisor)
create function request_reversal(p_payment uuid, p_reason text) returns uuid
language plpgsql security definer set search_path = public as $$
declare p payments%rowtype; v_id uuid;
begin
  select * into p from payments where id = p_payment;
  if not found then raise exception 'Cobro inexistente'; end if;
  if p.reverses_payment_id is not null then raise exception 'Un reverso no se puede reversar'; end if;
  if p.collected_by <> auth.uid() and not is_branch_manager(p.branch_id) then
    raise exception 'Sin permiso para solicitar este reverso';
  end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Indique el motivo'; end if;
  insert into payment_reversals (branch_id, payment_id, requested_by, reason)
  values (p.branch_id, p.id, auth.uid(), p_reason) returning id into v_id;
  return v_id;
end $$;

-- Aprobación del reverso (solo supervisor/owner): crea el cobro negativo espejo
create function decide_reversal(p_reversal uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public as $$
declare rv payment_reversals%rowtype; p payments%rowtype; v_new uuid; a record; v_late boolean;
begin
  select * into rv from payment_reversals where id = p_reversal for update;
  if not found or rv.status <> 'pending' then raise exception 'Solicitud inexistente o ya resuelta'; end if;
  if not is_branch_manager(rv.branch_id) then raise exception 'Solo supervisor u owner aprueban reversos'; end if;

  if not p_approve then
    update payment_reversals set status = 'rejected', decided_by = auth.uid(), decided_at = now() where id = rv.id;
    return;
  end if;

  select * into p from payments where id = rv.payment_id;
  -- ¿El dinero ya pasó por un cierre? Entonces es un ajuste posterior: queda marcado
  v_late := exists (select 1 from register_shifts where id = p.shift_id and status <> 'open')
         or exists (select 1 from route_settlements where id = p.settlement_id and status <> 'pending_delivery');

  insert into payments (branch_id, customer_id, origin_type, shift_id, route_id, settlement_id,
                        collected_by, method, amount, currency, custody_status, reverses_payment_id,
                        needs_review, review_note, collected_at)
  values (p.branch_id, p.customer_id, p.origin_type, p.shift_id, p.route_id, p.settlement_id,
          auth.uid(), p.method, -p.amount, p.currency, p.custody_status, p.id,
          v_late, case when v_late then 'Reverso posterior al cierre: ajustar en auditoría' end, now())
  returning id into v_new;

  for a in select installment_id, amount from payment_allocations where payment_id = p.id loop
    insert into payment_allocations (payment_id, installment_id, amount) values (v_new, a.installment_id, -a.amount);
  end loop;

  update payment_reversals set status = 'approved', decided_by = auth.uid(), decided_at = now(),
         reversal_payment_id = v_new where id = rv.id;
end $$;

-- Apertura de turno (cajero)
create function open_shift(p_register uuid, p_opening_cash numeric) returns uuid
language plpgsql security invoker set search_path = public as $$
declare v_id uuid; v_branch uuid;
begin
  select branch_id into v_branch from cash_registers where id = p_register;
  insert into register_shifts (branch_id, register_id, cashier_id, opening_cash)
  values (v_branch, p_register, auth.uid(), p_opening_cash) returning id into v_id;
  return v_id;
end $$;

-- Cálculo interno del efectivo esperado (NO expuesto al cajero)
create function _shift_expected_cash(p_shift uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select s.opening_cash
       + coalesce((select sum(amount) from payments where shift_id = s.id and method = 'cash'), 0)
       + coalesce((select sum(declared_cash_delivered) from route_settlements where received_by_shift_id = s.id), 0)
       + coalesce((select sum(case when type in ('deposit','change_fund') then amount else -amount end)
                     from cash_movements where shift_id = s.id), 0)
  from register_shifts s where s.id = p_shift;
$$;

-- Vista en vivo del esperado: solo supervisor/owner
create function shift_expected_cash(p_shift uuid) returns numeric
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from register_shifts s where s.id = p_shift and is_branch_manager(s.branch_id)) then
    raise exception 'Sin permiso';
  end if;
  return _shift_expected_cash(p_shift);
end $$;

-- Cierre con ARQUEO CIEGO: el cajero declara primero; recién ahí se calcula el esperado
create function close_shift(p_shift uuid, p_declared_cash numeric) returns shift_status
language plpgsql security definer set search_path = public as $$
declare s register_shifts%rowtype; v_expected numeric; v_status shift_status;
begin
  select * into s from register_shifts where id = p_shift for update;
  if not found or s.cashier_id <> auth.uid() then raise exception 'Este turno no es suyo'; end if;
  if s.status <> 'open' then raise exception 'El turno ya está cerrado'; end if;
  if p_declared_cash is null or p_declared_cash < 0 then raise exception 'Declare el efectivo contado'; end if;

  v_expected := _shift_expected_cash(p_shift);
  v_status := case when p_declared_cash = v_expected then 'closed_ok' else 'discrepancy' end;
  update register_shifts
     set expected_cash = v_expected, declared_cash = p_declared_cash,
         difference = p_declared_cash - v_expected, status = v_status, closed_at = now()
   where id = p_shift;
  return v_status;
end $$;

-- El cobrador cierra su ruta: se agrupan todos sus cobros y gastos sin rendir
create function close_route(p_route uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare r collection_routes%rowtype; v_id uuid; v_cash numeric; v_dig numeric; v_exp numeric; v_cur char(3);
begin
  select * into r from collection_routes where id = p_route;
  if not found or r.collector_id <> auth.uid() then raise exception 'Esta ruta no está asignada a usted'; end if;

  if (select count(distinct currency) from payments
       where route_id = p_route and settlement_id is null and collected_by = auth.uid()) > 1 then
    raise exception 'Hay cobros en más de una moneda en esta ruta';
  end if;
  select base_currency into v_cur from companies where id = r.company_id;

  insert into route_settlements (branch_id, route_id, collector_id, supervisor_id, currency)
  values (r.branch_id, r.id, auth.uid(), r.supervisor_id, v_cur) returning id into v_id;

  update payments set settlement_id = v_id
   where route_id = p_route and settlement_id is null and collected_by = auth.uid();
  update cash_movements set settlement_id = v_id
   where route_id = p_route and settlement_id is null and created_by = auth.uid();

  select coalesce(sum(amount) filter (where method = 'cash'), 0),
         coalesce(sum(amount) filter (where method <> 'cash'), 0)
    into v_cash, v_dig from payments where settlement_id = v_id;
  select coalesce(sum(amount), 0) into v_exp from cash_movements where settlement_id = v_id;

  if v_cash = 0 and v_dig = 0 and v_exp = 0 then raise exception 'No hay nada que rendir'; end if;

  update route_settlements
     set total_cash_collected = v_cash, total_digital_collected = v_dig,
         total_expenses = v_exp, expected_cash_delivery = v_cash - v_exp
   where id = v_id;
  return v_id;
end $$;

-- El cajero recibe el efectivo de la rendición (conteo ciego, no ve el esperado)
create function receive_settlement(p_settlement uuid, p_declared_cash numeric) returns void
language plpgsql security definer set search_path = public as $$
declare st route_settlements%rowtype; v_shift uuid;
begin
  select * into st from route_settlements where id = p_settlement for update;
  if not found or st.status <> 'pending_delivery' then raise exception 'Rendición inexistente o ya recibida'; end if;
  select id into v_shift from register_shifts
   where cashier_id = auth.uid() and status = 'open' and branch_id = st.branch_id;
  if v_shift is null then raise exception 'Necesita un turno de caja abierto en esta sucursal'; end if;
  if p_declared_cash is null or p_declared_cash < 0 then raise exception 'Declare el efectivo contado'; end if;

  update route_settlements
     set received_by_shift_id = v_shift, received_at = now(),
         declared_cash_delivered = p_declared_cash,
         difference = p_declared_cash - expected_cash_delivery,
         status = 'received_in_pos'
   where id = st.id;
  update payments set custody_status = 'in_register'
   where settlement_id = st.id and custody_status = 'in_collector_hands';
end $$;

-- Auditoría del supervisor
create function audit_settlement(p_settlement uuid, p_notes text default null) returns void
language plpgsql security definer set search_path = public as $$
declare st route_settlements%rowtype;
begin
  select * into st from route_settlements where id = p_settlement for update;
  if not found or st.status <> 'received_in_pos' then raise exception 'La rendición aún no fue recibida en caja'; end if;
  if not is_branch_manager(st.branch_id) then raise exception 'Solo supervisor u owner auditan'; end if;
  update route_settlements set status = 'audited', audited_by = auth.uid(), audited_at = now(), audit_notes = p_notes
   where id = st.id;
end $$;

-- Cola de Caja: pedidos al contado pendientes de cobro (el cajero no ve el CRM)
create function get_cashier_queue()
returns table (order_id uuid, customer_id uuid, customer_name text, vendor_name text,
               total numeric, balance numeric, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select o.id, c.id, c.name, pv.full_name, o.total_amount,
         o.total_amount - coalesce((select sum(installment_paid(i.id)) from installments i where i.order_id = o.id), 0),
         o.created_at
    from orders o
    join customers c on c.id = o.customer_id
    join profiles pv on pv.id = o.vendor_id
   where o.status = 'confirmed' and o.payment_condition = 'cash'
     and o.approval_status in ('auto_approved','approved')
     and o.branch_id in (select branch_id from register_shifts where cashier_id = auth.uid() and status = 'open')
     and o.total_amount - coalesce((select sum(installment_paid(i.id)) from installments i where i.order_id = o.id), 0) > 0
   order by o.created_at;
$$;

-- Rendiciones por recibir (sin montos esperados: conteo ciego)
create function get_pending_settlements()
returns table (settlement_id uuid, route_name text, collector_name text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select st.id, r.name, p.full_name, st.created_at
    from route_settlements st
    join collection_routes r on r.id = st.route_id
    join profiles p on p.id = st.collector_id
   where st.status = 'pending_delivery'
     and st.branch_id in (select branch_id from register_shifts where cashier_id = auth.uid() and status = 'open')
   order by st.created_at;
$$;

-- Cron de suscripciones (programar con pg_cron cada hora):
--   select cron.schedule('veltrix-subs', '0 * * * *', 'select public.process_subscriptions()');
create function process_subscriptions() returns void
language plpgsql security definer set search_path = public as $$
begin
  update organizations set subscription_status = 'past_due_grace', grace_ends_at = now() + interval '7 days'
   where subscription_status = 'active' and next_billing_date < current_date and deleted_at is null;
  update organizations set subscription_status = 'suspended'
   where subscription_status = 'past_due_grace' and grace_ends_at < now();
end $$;

-- =====================================================================
-- 10. VISTAS (security_invoker: respetan el RLS de quien consulta)
-- =====================================================================
create view v_installment_balance with (security_invoker = true) as
select i.id, i.org_id, i.branch_id, i.order_id, i.number, i.due_date, i.amount, i.currency,
       installment_paid(i.id)            as paid,
       i.amount - installment_paid(i.id) as balance,
       (i.amount - installment_paid(i.id)) > 0 and i.due_date < branch_today(i.branch_id) as is_overdue
  from installments i;

create view v_order_balance with (security_invoker = true) as
select o.id, o.org_id, o.branch_id, o.customer_id, o.total_amount, o.currency,
       coalesce(sum(installment_paid(i.id)), 0)                  as paid,
       o.total_amount - coalesce(sum(installment_paid(i.id)), 0) as balance,
       case when coalesce(sum(installment_paid(i.id)), 0) = 0 then 'unpaid'
            when coalesce(sum(installment_paid(i.id)), 0) >= o.total_amount then 'paid'
            else 'partial' end                                    as payment_status
  from orders o left join installments i on i.order_id = o.id
 where o.status = 'confirmed'
 group by o.id;

create view v_customer_balance with (security_invoker = true) as
select c.id, c.org_id, c.branch_id, c.name, c.credit_limit, c.credit_status,
       customer_open_balance(c.id)                  as open_balance,
       c.credit_limit - customer_open_balance(c.id) as available_credit
  from customers c where c.deleted_at is null;

-- Hoja de ruta del cobrador (solo ve lo de hoy, por RLS)
create view v_my_route_today with (security_invoker = true) as
select ra.id as assignment_id, ra.route_id, ra.visit_order, ra.assign_date,
       c.id as customer_id, c.name as customer_name, c.phone, c.address, c.gps_lat, c.gps_lng,
       i.id as installment_id, i.number, i.due_date, i.amount,
       i.amount - installment_paid(i.id) as balance
  from route_assignments ra
  join installments i on i.id = ra.installment_id
  join customers c on c.id = i.customer_id
 where ra.assign_date = branch_today(ra.branch_id);

-- =====================================================================
-- 11. ROW LEVEL SECURITY
-- =====================================================================
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- ---------- SaaS ----------
create policy plans_read  on plans for select to anon, authenticated using (true);
create policy plans_admin on plans for all to authenticated using (is_platform_admin()) with check (is_platform_admin());

create policy pa_read on platform_admins for select to authenticated
  using (user_id = auth.uid() or is_platform_admin());

create policy org_read on organizations for select to authenticated
  using (is_org_member(id) or is_platform_admin());
create policy org_update on organizations for update to authenticated
  using (is_org_owner(id) or is_platform_admin()) with check (is_org_owner(id) or is_platform_admin());

create policy subs_read on subscription_events for select to authenticated
  using (is_org_owner(org_id) or is_platform_admin());

create policy grants_read on support_access_grants for select to authenticated
  using (is_org_owner(org_id) or is_platform_admin());
create policy grants_insert on support_access_grants for insert to authenticated
  with check (is_org_owner(org_id) and granted_by = auth.uid());
create policy grants_update on support_access_grants for update to authenticated
  using (is_org_owner(org_id)) with check (is_org_owner(org_id));

-- ---------- Empresas y sucursales ----------
create policy companies_read on companies for select to authenticated
  using (is_org_member(org_id) or has_support_grant(org_id));
create policy companies_insert on companies for insert to authenticated
  with check (is_org_owner(org_id) and org_writable(org_id));
create policy companies_update on companies for update to authenticated
  using (is_org_owner(org_id)) with check (is_org_owner(org_id) and org_writable(org_id));

create policy branches_read on branches for select to authenticated
  using (is_org_member(org_id) or has_support_grant(org_id));
create policy branches_insert on branches for insert to authenticated
  with check (is_org_owner(org_id) and org_writable(org_id));
create policy branches_update on branches for update to authenticated
  using (is_org_owner(org_id)) with check (is_org_owner(org_id) and org_writable(org_id));

-- ---------- IAM ----------
create policy profiles_read on profiles for select to authenticated
  using (id = auth.uid() or (org_id is not null and (is_org_member(org_id) or has_support_grant(org_id))));
create policy profiles_insert on profiles for insert to authenticated
  with check (id = auth.uid() or is_org_owner(org_id));
create policy profiles_update on profiles for update to authenticated
  using (id = auth.uid() or is_org_owner(org_id)) with check (id = auth.uid() or is_org_owner(org_id));

create policy memberships_read on memberships for select to authenticated
  using (user_id = auth.uid() or org_reader(org_id) or (branch_id is not null and is_branch_manager(branch_id)));
create policy memberships_insert on memberships for insert to authenticated
  with check (is_org_owner(org_id) and org_writable(org_id));
create policy memberships_update on memberships for update to authenticated
  using (is_org_owner(org_id)) with check (is_org_owner(org_id));

-- ---------- Unidades operativas ----------
create policy registers_read on cash_registers for select to authenticated
  using (org_reader(org_id) or has_branch_role(branch_id, '{supervisor,cashier}'));
create policy registers_insert on cash_registers for insert to authenticated
  with check (is_org_owner(org_id) and org_writable(org_id));
create policy registers_update on cash_registers for update to authenticated
  using (is_org_owner(org_id)) with check (is_org_owner(org_id));

-- El cajero ve su propio turno (expected_cash está en NULL hasta que cierra)
create policy shifts_read on register_shifts for select to authenticated
  using (org_reader(org_id) or is_branch_manager(branch_id) or cashier_id = auth.uid());
create policy shifts_insert on register_shifts for insert to authenticated
  with check (cashier_id = auth.uid() and has_branch_role(branch_id, '{cashier}')
              and status = 'open' and expected_cash is null and declared_cash is null
              and difference is null and org_writable(org_id));

create policy routes_read on collection_routes for select to authenticated
  using (org_reader(org_id) or is_branch_manager(branch_id) or collector_id = auth.uid());
create policy routes_insert on collection_routes for insert to authenticated
  with check (is_org_owner(org_id) and org_writable(org_id));
create policy routes_update on collection_routes for update to authenticated
  using (is_branch_manager(branch_id)) with check (is_branch_manager(branch_id));

-- ---------- Comercial ----------
-- El cajero NO ve clientes (usa get_cashier_queue). El cobrador solo los de su ruta/hoy.
create policy customers_read on customers for select to authenticated
  using (org_reader(org_id) or has_branch_role(branch_id, '{supervisor,vendor}') or collector_sees_customer(id));
create policy customers_insert on customers for insert to authenticated
  with check ((has_branch_role(branch_id, '{supervisor,vendor}') or is_branch_manager(branch_id)) and org_writable(org_id));
create policy customers_update on customers for update to authenticated
  using (has_branch_role(branch_id, '{supervisor,vendor}') or is_branch_manager(branch_id))
  with check (has_branch_role(branch_id, '{supervisor,vendor}') or is_branch_manager(branch_id));

create policy products_read on products for select to authenticated
  using (is_company_member(company_id) or has_support_grant(org_id));
create policy products_insert on products for insert to authenticated
  with check (is_org_owner(org_id) and org_writable(org_id));
create policy products_update on products for update to authenticated
  using (is_org_owner(org_id)) with check (is_org_owner(org_id));

create policy orders_read on orders for select to authenticated
  using (org_reader(org_id) or is_branch_manager(branch_id) or vendor_id = auth.uid());
create policy orders_insert on orders for insert to authenticated
  with check (vendor_id = auth.uid() and has_branch_role(branch_id, '{vendor,supervisor}')
              and status = 'draft' and approval_status is null and org_writable(org_id));
create policy orders_update on orders for update to authenticated
  using (is_branch_manager(branch_id) or (vendor_id = auth.uid() and status = 'draft'))
  with check (is_branch_manager(branch_id) or vendor_id = auth.uid());

create policy items_read on order_items for select to authenticated
  using (exists (select 1 from orders o where o.id = order_id));
create policy items_write on order_items for all to authenticated
  using (exists (select 1 from orders o where o.id = order_id and o.status = 'draft'
                  and (o.vendor_id = auth.uid() or is_branch_manager(o.branch_id))))
  with check (exists (select 1 from orders o where o.id = order_id and o.status = 'draft'
                  and (o.vendor_id = auth.uid() or is_branch_manager(o.branch_id))));

create policy inst_read on installments for select to authenticated
  using (exists (select 1 from orders o where o.id = order_id) or collector_sees_installment(id));
create policy inst_write on installments for all to authenticated
  using (exists (select 1 from orders o where o.id = order_id and o.status = 'draft'
                  and (o.vendor_id = auth.uid() or is_branch_manager(o.branch_id))))
  with check (exists (select 1 from orders o where o.id = order_id and o.status = 'draft'
                  and (o.vendor_id = auth.uid() or is_branch_manager(o.branch_id))));

-- ---------- Cartera en calle ----------
create policy assign_read on route_assignments for select to authenticated
  using (org_reader(org_id) or is_branch_manager(branch_id)
         or exists (select 1 from collection_routes r where r.id = route_id and r.collector_id = auth.uid()));
create policy assign_write on route_assignments for all to authenticated
  using (is_branch_manager(branch_id))
  with check (is_branch_manager(branch_id) and org_writable(org_id));

create policy visits_read on visits for select to authenticated
  using (org_reader(org_id) or is_branch_manager(branch_id) or collector_id = auth.uid());
create policy visits_insert on visits for insert to authenticated
  with check (collector_id = auth.uid()
              and exists (select 1 from collection_routes r where r.id = route_id and r.collector_id = auth.uid()));

-- ---------- Tesorería (escritura SOLO por funciones) ----------
create policy payments_read on payments for select to authenticated
  using (org_reader(org_id) or is_branch_manager(branch_id) or collected_by = auth.uid()
         or exists (select 1 from register_shifts s where s.id = shift_id and s.cashier_id = auth.uid()));

create policy alloc_read on payment_allocations for select to authenticated
  using (exists (select 1 from payments p where p.id = payment_id));

create policy reversals_read on payment_reversals for select to authenticated
  using (org_reader(org_id) or is_branch_manager(branch_id) or requested_by = auth.uid());

-- El cajero no consulta rendiciones directo (usa get_pending_settlements: conteo ciego)
create policy settlements_read on route_settlements for select to authenticated
  using (org_reader(org_id) or is_branch_manager(branch_id) or collector_id = auth.uid());

create policy cashmov_read on cash_movements for select to authenticated
  using (org_reader(org_id) or is_branch_manager(branch_id) or created_by = auth.uid());
create policy cashmov_insert on cash_movements for insert to authenticated
  with check (created_by = auth.uid() and settlement_id is null and (
      (shift_id is not null and exists (select 1 from register_shifts s
          where s.id = shift_id and s.cashier_id = auth.uid() and s.status = 'open'))
   or (route_id is not null and exists (select 1 from collection_routes r
          where r.id = route_id and r.collector_id = auth.uid()))));

create policy fx_read on exchange_rates for select to authenticated
  using (is_org_member(org_id) or has_support_grant(org_id));
create policy fx_write on exchange_rates for insert to authenticated
  with check (is_org_owner(org_id));

-- ---------- Auditoría ----------
create policy audit_read on audit_log for select to authenticated
  using ((org_id is not null and org_reader(org_id))
         or (branch_id is not null and has_branch_role(branch_id, '{supervisor}')));

create policy notif_read on notifications for select to authenticated using (user_id = auth.uid());
create policy notif_update on notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- =====================================================================
-- 12. PERMISOS DE TABLAS Y FUNCIONES
-- =====================================================================
revoke all on all tables in schema public from anon, authenticated;
grant select on plans to anon;
grant select, insert, update on all tables in schema public to authenticated;
grant delete on order_items, installments, route_assignments to authenticated;
grant select on v_installment_balance, v_order_balance, v_customer_balance, v_my_route_today to authenticated;

-- Funciones internas: nadie las llama desde la app
revoke execute on function _shift_expected_cash(uuid)  from public, anon, authenticated;
revoke execute on function process_subscriptions()     from public, anon, authenticated;
revoke execute on function assert_staff(uuid, uuid, app_role) from public, anon, authenticated;
