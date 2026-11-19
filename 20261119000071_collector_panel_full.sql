-- Panel del cobrador completo (19 nov 2026)
-- 1) Cliente: carnet por ambos lados, foto, garante (nombre, celular, dirección, ubicación, foto)
-- 2) Permisos nuevos: collector.portfolio (ver cartera, por defecto solo supervisor) y collector.settings (Ajustes)
-- 3) Avisos del administrador a la ruta (route_notices) con triggers y RPC de lectura
-- 4) collector_day: todos los clientes de la ruta, paid_today, datos del garante, permisos y QR de pago
-- 5) El cobrador puede subir y leer los archivos de los clientes de su propia ruta

alter table customers
  add column if not exists doc_back_photo_path text,
  add column if not exists guarantor_name text,
  add column if not exists guarantor_phone text,
  add column if not exists guarantor_address text,
  add column if not exists guarantor_lat numeric,
  add column if not exists guarantor_lng numeric,
  add column if not exists guarantor_photo_path text;

-- Permiso por defecto: ver la cartera total solo el supervisor, salvo que el administrador lo active
do $$
declare d text;
begin
  select pg_get_functiondef('public.perm_default(text,text)'::regprocedure) into d;
  if d not like '%collector.portfolio%' then
    d := replace(d, '''routes.approve_loans'')', '''routes.approve_loans'', ''collector.portfolio'')');
    if d not like '%collector.portfolio%' then raise exception 'perm_default sin cambios'; end if;
    execute d;
  end if;
end $$;

-- Avisos del administrador
create table if not exists route_notices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  route_id uuid not null references collection_routes(id) on delete cascade,
  created_at timestamptz not null default now(),
  kind text not null,
  body text not null,
  created_by uuid,
  read_at timestamptz
);
create index if not exists route_notices_route_idx on route_notices (route_id, created_at desc);
alter table route_notices enable row level security;

create or replace function trg_notice_customer_route() returns trigger language plpgsql security definer set search_path to 'public' as $$
declare r collection_routes%rowtype;
begin
  if tg_op = 'UPDATE' and old.route_id is distinct from new.route_id then
    if old.route_id is not null then
      select * into r from collection_routes where id = old.route_id;
      if found and coalesce(r.collector_id, '00000000-0000-0000-0000-000000000000') <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000001') then
        insert into route_notices (org_id, route_id, kind, body, created_by) values (r.org_id, r.id, 'customer_removed', 'Se quitó de tu ruta al cliente ' || new.name, auth.uid());
      end if;
    end if;
    if new.route_id is not null then
      select * into r from collection_routes where id = new.route_id;
      if found and coalesce(r.collector_id, '00000000-0000-0000-0000-000000000000') <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000001') then
        insert into route_notices (org_id, route_id, kind, body, created_by) values (r.org_id, r.id, 'customer_added', 'Se agregó a tu ruta al cliente ' || new.name, auth.uid());
      end if;
    end if;
  end if;
  return null;
end $$;
drop trigger if exists customers_notice_route on customers;
create trigger customers_notice_route after update of route_id on customers for each row execute function trg_notice_customer_route();

create or replace function trg_notice_route_change() returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if coalesce(auth.uid(), '00000000-0000-0000-0000-000000000001') = coalesce(new.collector_id, '00000000-0000-0000-0000-000000000000') then return null; end if;
  if old.name is distinct from new.name then
    insert into route_notices (org_id, route_id, kind, body, created_by) values (new.org_id, new.id, 'route_renamed', 'La ruta ahora se llama ' || new.name, auth.uid());
  end if;
  if old.is_active is distinct from new.is_active then
    insert into route_notices (org_id, route_id, kind, body, created_by)
    values (new.org_id, new.id, 'route_active', case when new.is_active then 'La ruta fue activada' else 'La ruta fue desactivada' end, auth.uid());
  end if;
  return null;
end $$;
drop trigger if exists routes_notice_change on collection_routes;
create trigger routes_notice_change after update of name, is_active on collection_routes for each row execute function trg_notice_route_change();

create or replace function trg_notice_permissions() returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if (old.permissions is distinct from new.permissions or old.custom_role_id is distinct from new.custom_role_id or old.role is distinct from new.role)
     and coalesce(auth.uid(), '00000000-0000-0000-0000-000000000001') <> new.user_id then
    insert into route_notices (org_id, route_id, kind, body, created_by)
    select r.org_id, r.id, 'permissions', 'El administrador cambió tus permisos', auth.uid()
      from collection_routes r where r.collector_id = new.user_id and r.deleted_at is null and r.branch_id = new.branch_id;
  end if;
  return null;
end $$;
drop trigger if exists memberships_notice_permissions on memberships;
create trigger memberships_notice_permissions after update of permissions, custom_role_id, role on memberships for each row execute function trg_notice_permissions();

-- El administrador escribe un aviso a la ruta
create or replace function admin_route_notice(p_route uuid, p_body text) returns void language plpgsql security definer set search_path to 'public' as $$
declare r collection_routes%rowtype;
begin
  select * into r from collection_routes where id = p_route and deleted_at is null;
  if not found or not (is_org_owner(r.org_id) or is_branch_manager(r.branch_id)) then raise exception 'PERM_DENIED'; end if;
  if coalesce(trim(p_body), '') = '' then raise exception 'NOTICE_INVALID'; end if;
  insert into route_notices (org_id, route_id, kind, body, created_by) values (r.org_id, r.id, 'message', left(trim(p_body), 500), auth.uid());
end $$;

-- El cobrador lee sus avisos y los marca como leídos
create or replace function collector_notices(p_route uuid) returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'at', n.created_at, 'kind', n.kind, 'body', n.body, 'unread', n.read_at is null) order by n.created_at desc), '[]'::jsonb)
    from (select x.* from route_notices x join collection_routes r on r.id = x.route_id
           where x.route_id = p_route and r.collector_id = auth.uid() order by x.created_at desc limit 50) n;
$$;
create or replace function collector_notices_read(p_route uuid) returns void language sql security definer set search_path to 'public' as $$
  update route_notices n set read_at = now()
   where n.route_id = p_route and n.read_at is null
     and exists (select 1 from collection_routes r where r.id = n.route_id and r.collector_id = auth.uid());
$$;

-- Alta de cliente de calle con garante y ubicación
drop function if exists collector_save_customer(uuid, text, text, text, text, text, numeric, numeric);
create or replace function collector_save_customer(
  p_route uuid, p_name text, p_phone text default null, p_address text default null, p_tax_id text default null,
  p_notes text default null, p_lat numeric default null, p_lng numeric default null,
  p_g_name text default null, p_g_phone text default null, p_g_address text default null, p_g_lat numeric default null, p_g_lng numeric default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare r collection_routes%rowtype; pol jsonb; v_id uuid;
begin
  select * into r from collection_routes where id = p_route and deleted_at is null and is_active;
  if not found or not (r.collector_id = auth.uid() or is_branch_manager(r.branch_id) or is_org_owner(r.org_id)) then
    raise exception 'Esta ruta no está asignada a usted';
  end if;
  if not has_perm('loans.customers', r.branch_id) then raise exception 'LOAN_NO_PERMISSION'; end if;
  if not org_writable(r.org_id) then raise exception 'Cuenta suspendida: solo lectura'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Indique el nombre'; end if;
  pol := loan_policy(r.org_id);
  if (pol->>'max_customers_collector')::numeric > 0
     and (select count(*) from customers where route_id = r.id and deleted_at is null) >= (pol->>'max_customers_collector')::numeric then
    raise exception 'LOAN_MAX_CUSTOMERS';
  end if;
  insert into customers (branch_id, route_id, name, phone, address, tax_id, notes, gps_lat, gps_lng,
                         guarantor_name, guarantor_phone, guarantor_address, guarantor_lat, guarantor_lng)
  values (r.branch_id, r.id, trim(p_name), nullif(trim(coalesce(p_phone, '')), ''), nullif(trim(coalesce(p_address, '')), ''),
          nullif(trim(coalesce(p_tax_id, '')), ''), nullif(trim(coalesce(p_notes, '')), ''), p_lat, p_lng,
          nullif(trim(coalesce(p_g_name, '')), ''), nullif(trim(coalesce(p_g_phone, '')), ''), nullif(trim(coalesce(p_g_address, '')), ''), p_g_lat, p_g_lng)
  returning id into v_id;
  return v_id;
end $$;

-- Rutas de los archivos del cliente (las sube el cobrador desde su ruta)
create or replace function collector_set_customer_files(p_customer uuid, p_doc_front text, p_doc_back text, p_photo text, p_g_photo text, p_consent boolean)
returns void language plpgsql security definer set search_path to 'public' as $$
declare c customers%rowtype; p text;
begin
  select * into c from customers where id = p_customer and deleted_at is null;
  if not found then raise exception 'Sin permiso'; end if;
  if not (is_branch_manager(c.branch_id) or exists (select 1 from collection_routes r where r.id = c.route_id and r.collector_id = auth.uid() and r.is_active and r.deleted_at is null)) then
    raise exception 'Sin permiso';
  end if;
  if not has_perm('loans.customers', c.branch_id) then raise exception 'LOAN_NO_PERMISSION'; end if;
  foreach p in array array[p_doc_front, p_doc_back, p_photo, p_g_photo] loop
    if p is not null and (split_part(p, '/', 2) <> c.id::text or split_part(p, '/', 1) <> c.org_id::text) then raise exception 'Ruta inválida'; end if;
  end loop;
  if (p_doc_front is not null or p_doc_back is not null) and not coalesce(p_consent, false) then raise exception 'Falta el consentimiento del cliente'; end if;
  update customers set
    doc_photo_path = coalesce(p_doc_front, doc_photo_path),
    doc_back_photo_path = coalesce(p_doc_back, doc_back_photo_path),
    photo_path = coalesce(p_photo, photo_path),
    guarantor_photo_path = coalesce(p_g_photo, guarantor_photo_path),
    doc_consent_at = case when p_doc_front is not null or p_doc_back is not null then now() else doc_consent_at end
  where id = c.id;
end $$;

-- Archivos de cliente: además de gerentes/supervisores/vendedores, el cobrador de la ruta del cliente
create or replace function can_access_customer_file(p_name text) returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from customers c
     where c.id::text = split_part(p_name, '/', 2)
       and c.org_id::text = split_part(p_name, '/', 1)
       and c.deleted_at is null
       and (
         ((is_branch_manager(c.branch_id) or has_branch_role(c.branch_id, '{supervisor,vendor}')) and has_perm('customers.view_docs', c.branch_id))
         or exists (select 1 from collection_routes r where r.id = c.route_id and r.collector_id = auth.uid() and r.is_active and r.deleted_at is null
                      and has_perm('loans.customers', c.branch_id))
       ));
$$;

-- collector_day: todos los clientes de la ruta, pagó hoy, garante, permisos y QR de pago
do $$
declare d text; o text;
begin
  select pg_get_functiondef('public.collector_day()'::regprocedure) into d;
  o := d;
  d := replace(d, '''can_interest'', has_perm(''loans.interest'', r.branch_id),',
    '''can_interest'', has_perm(''loans.interest'', r.branch_id),
        ''can_expenses'', has_perm(''collector.expenses'', r.branch_id),
        ''can_portfolio'', has_perm(''collector.portfolio'', r.branch_id),
        ''can_settings'', has_perm(''collector.settings'', r.branch_id),
        ''pay_qr'', (select b2.pay_qr_path from branches b2 where b2.id = r.branch_id),
        ''pay_qr_note'', (select b2.pay_qr_note from branches b2 where b2.id = r.branch_id),
        ''org_id'', r.org_id,
        ''notices_unread'', (select count(*) from route_notices n where n.route_id = r.id and n.read_at is null),');
  d := replace(d, '''id'', c.id, ''name'', c.name, ''phone'', c.phone, ''address'', c.address,',
    '''id'', c.id, ''name'', c.name, ''phone'', c.phone, ''address'', c.address, ''tax_id'', c.tax_id,
              ''g_name'', c.guarantor_name, ''g_phone'', c.guarantor_phone, ''g_lat'', c.guarantor_lat, ''g_lng'', c.guarantor_lng,');
  d := replace(d, '''balance'', customer_open_balance(c.id),
              ''overdue'', customer_overdue(c.id),',
    '''paid_today'', exists (select 1 from payments p2 where p2.customer_id = c.id and p2.route_id = r.id and p2.amount > 0 and p2.reverses_payment_id is null
                                    and (p2.collected_at at time zone b.timezone)::date = branch_today(r.branch_id)),
              ''balance'', customer_open_balance(c.id),
              ''overdue'', customer_overdue(c.id),');
  d := replace(d, 'where c.route_id = r.id and c.deleted_at is null and customer_open_balance(c.id) > 0) t)', 'where c.route_id = r.id and c.deleted_at is null) t)');
  if d = o or d not like '%paid_today%' or d not like '%can_portfolio%' or d not like '%g_name%' or d like '%customer_open_balance(c.id) > 0) t)%' then
    raise exception 'collector_day: reemplazo incompleto';
  end if;
  execute d;
end $$;
