-- =====================================================================
-- Veltrix · Clientes y crédito
--   Ficha del cliente con foto del documento (bucket privado, comprimida en el teléfono)
--   Ventas a crédito en cuotas con aprobación del supervisor/dueño
--   El cajero cobra cuotas buscando al deudor (sin ver la ficha completa)
-- =====================================================================

alter table customers
  add column if not exists doc_photo_path   text,
  add column if not exists photo_path       text,
  add column if not exists doc_consent_at   timestamptz,
  add column if not exists notes            text;

-- ---------- Almacenamiento privado de fotos de clientes ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('customer-files', 'customer-files', false, 1048576, array['image/webp','image/jpeg','image/png'])
on conflict (id) do update set public = false, file_size_limit = 1048576,
  allowed_mime_types = array['image/webp','image/jpeg','image/png'];

-- Megas usados por la organización (todas sus carpetas en el almacenamiento)
create or replace function org_storage_mb(p_org uuid) returns numeric
language sql stable security definer set search_path = public, storage as $$
  select round(coalesce(sum((o.metadata->>'size')::bigint), 0) / 1048576.0, 1)
    from storage.objects o where o.name like p_org::text || '/%';
$$;

-- Ruta: {org_id}/{customer_id}/archivo
create or replace function can_access_customer_file(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from customers c
     where c.id::text = split_part(p_name, '/', 2)
       and c.org_id::text = split_part(p_name, '/', 1)
       and c.deleted_at is null
       and (is_branch_manager(c.branch_id) or has_branch_role(c.branch_id, '{supervisor,vendor}')));
$$;

create or replace function storage_has_room(p_name text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare v_org uuid; v_max int;
begin
  begin v_org := split_part(p_name, '/', 1)::uuid; exception when others then return false; end;
  select max_storage_mb into v_max from org_limits(v_org);
  return v_max is null or org_storage_mb(v_org) < v_max;
end $$;

drop policy if exists customer_files_read on storage.objects;
drop policy if exists customer_files_insert on storage.objects;
drop policy if exists customer_files_update on storage.objects;
drop policy if exists customer_files_delete on storage.objects;
create policy customer_files_read on storage.objects for select to authenticated
  using (bucket_id = 'customer-files' and public.can_access_customer_file(name));
create policy customer_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'customer-files' and public.can_access_customer_file(name) and public.storage_has_room(name));
create policy customer_files_update on storage.objects for update to authenticated
  using (bucket_id = 'customer-files' and public.can_access_customer_file(name))
  with check (bucket_id = 'customer-files' and public.can_access_customer_file(name));
create policy customer_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'customer-files' and public.can_access_customer_file(name));

-- ---------- Clientes ----------
create or replace function can_handle_customers(p_branch uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_branch_manager(p_branch) or has_branch_role(p_branch, '{supervisor,vendor}');
$$;

-- Saldo vencido de un cliente (cuotas con fecha pasada y saldo pendiente)
create or replace function customer_overdue(p_customer uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(i.amount - installment_paid(i.id)), 0)
    from installments i join orders o on o.id = i.order_id
   where o.customer_id = p_customer and o.status = 'confirmed'
     and o.approval_status in ('auto_approved','approved')
     and i.due_date < branch_today(o.branch_id)
     and i.amount - installment_paid(i.id) > 0;
$$;

create or replace function customers_list(p_branch uuid, p_search text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare q text := nullif(lower(trim(coalesce(p_search, ''))), '');
begin
  if not can_handle_customers(p_branch) then raise exception 'Sin permiso'; end if;
  return (
    select coalesce(jsonb_agg(x order by x->>'name'), '[]'::jsonb) from (
      select jsonb_build_object(
               'id', c.id, 'name', c.name, 'tax_id', c.tax_id, 'phone', c.phone,
               'credit_limit', c.credit_limit, 'credit_status', c.credit_status,
               'balance', customer_open_balance(c.id), 'overdue', customer_overdue(c.id),
               'has_doc', c.doc_photo_path is not null) as x
        from customers c
       where c.branch_id = p_branch and not c.is_walk_in and c.deleted_at is null
         and (q is null or lower(c.name) like '%' || q || '%' or lower(coalesce(c.tax_id, '')) like '%' || q || '%'
              or coalesce(c.phone, '') like '%' || q || '%')
       limit 300) t);
end $$;

create or replace function save_customer(
  p_id uuid, p_branch uuid, p_name text, p_tax_id text default null, p_phone text default null,
  p_address text default null, p_credit_limit numeric default 0, p_notes text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_org uuid;
begin
  select org_id into v_org from branches where id = p_branch and deleted_at is null;
  if v_org is null then raise exception 'Sucursal inexistente'; end if;
  if not can_handle_customers(p_branch) then raise exception 'Sin permiso'; end if;
  if not org_writable(v_org) then raise exception 'Cuenta suspendida: solo lectura'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Indique el nombre'; end if;
  if p_credit_limit is null or p_credit_limit < 0 then raise exception 'Límite inválido'; end if;

  if p_id is null then
    insert into customers (branch_id, name, tax_id, phone, address, credit_limit, notes, created_by)
    values (p_branch, trim(p_name), nullif(trim(coalesce(p_tax_id, '')), ''), nullif(trim(coalesce(p_phone, '')), ''),
            nullif(trim(coalesce(p_address, '')), ''), round(p_credit_limit, 2), nullif(trim(coalesce(p_notes, '')), ''), auth.uid())
    returning id into v_id;
  else
    -- Quien no es supervisor/dueño no puede tocar el crédito (lo frena guard_customer_credit)
    update customers
       set name = trim(p_name), tax_id = nullif(trim(coalesce(p_tax_id, '')), ''),
           phone = nullif(trim(coalesce(p_phone, '')), ''), address = nullif(trim(coalesce(p_address, '')), ''),
           notes = nullif(trim(coalesce(p_notes, '')), ''),
           credit_limit = case when is_branch_manager(branch_id) then round(p_credit_limit, 2) else credit_limit end
     where id = p_id and branch_id = p_branch and not is_walk_in and deleted_at is null
    returning id into v_id;
    if v_id is null then raise exception 'Cliente inexistente'; end if;
  end if;
  return v_id;
end $$;

-- Guarda las rutas de las fotos ya subidas (el documento exige consentimiento)
create or replace function set_customer_files(p_customer uuid, p_doc_path text, p_photo_path text, p_consent boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare c customers%rowtype;
begin
  select * into c from customers where id = p_customer and deleted_at is null;
  if not found or not can_handle_customers(c.branch_id) then raise exception 'Sin permiso'; end if;
  if p_doc_path is not null then
    if not coalesce(p_consent, false) then raise exception 'Falta el consentimiento del cliente'; end if;
    if split_part(p_doc_path, '/', 2) <> c.id::text then raise exception 'Ruta inválida'; end if;
    update customers set doc_photo_path = p_doc_path, doc_consent_at = now() where id = c.id;
  end if;
  if p_photo_path is not null then
    if split_part(p_photo_path, '/', 2) <> c.id::text then raise exception 'Ruta inválida'; end if;
    update customers set photo_path = p_photo_path where id = c.id;
  end if;
end $$;

create or replace function customer_detail(p_customer uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare c customers%rowtype;
begin
  select * into c from customers where id = p_customer and deleted_at is null;
  if not found or not can_handle_customers(c.branch_id) then raise exception 'Sin permiso'; end if;
  return jsonb_build_object(
    'customer', jsonb_build_object(
      'id', c.id, 'org_id', c.org_id, 'branch_id', c.branch_id, 'name', c.name, 'tax_id', c.tax_id,
      'phone', c.phone, 'address', c.address, 'notes', c.notes,
      'credit_limit', c.credit_limit, 'credit_status', c.credit_status,
      'doc_photo_path', c.doc_photo_path, 'photo_path', c.photo_path, 'doc_consent_at', c.doc_consent_at,
      'balance', customer_open_balance(c.id), 'overdue', customer_overdue(c.id),
      'currency', (select base_currency from companies where id = c.company_id),
      'can_edit_credit', is_branch_manager(c.branch_id)),
    'credits', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'order_id', o.id, 'at', o.confirmed_at, 'total', o.total_amount, 'approval', o.approval_status,
               'installments', (select coalesce(jsonb_agg(jsonb_build_object(
                                   'number', i.number, 'due', i.due_date, 'amount', i.amount,
                                   'paid', installment_paid(i.id)) order by i.number), '[]'::jsonb)
                                  from installments i where i.order_id = o.id))
             order by o.confirmed_at desc), '[]'::jsonb)
        from orders o
       where o.customer_id = c.id and o.status = 'confirmed' and o.payment_condition = 'credit'),
    'payments', (
      select coalesce(jsonb_agg(jsonb_build_object('at', p.collected_at, 'amount', p.amount, 'method', p.method)
             order by p.collected_at desc), '[]'::jsonb)
        from (select * from payments where customer_id = c.id order by collected_at desc limit 50) p)
  );
end $$;

-- Venta a crédito en cuotas (queda aprobada o pendiente de supervisor según límite)
create or replace function create_credit_sale(
  p_branch uuid, p_customer uuid, p_items jsonb,
  p_count int, p_every_days int, p_first_due date, p_notes text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare b branches%rowtype; c customers%rowtype; v_cur char(3); v_order uuid; it jsonb; pr products%rowtype;
        v_qty numeric; v_status approval_status;
begin
  select * into b from branches where id = p_branch and deleted_at is null;
  if not found then raise exception 'Sucursal inexistente'; end if;
  if not can_sell(b.id) or not can_handle_customers(b.id) then raise exception 'Sin permiso para vender a crédito'; end if;
  if not org_writable(b.org_id) then raise exception 'Cuenta suspendida: solo lectura'; end if;
  select * into c from customers where id = p_customer and branch_id = b.id and deleted_at is null;
  if not found or c.is_walk_in then raise exception 'Elija un cliente registrado'; end if;
  if p_count is null or p_count < 1 or p_count > 120 then raise exception 'Número de cuotas inválido'; end if;
  if p_every_days is null or p_every_days < 1 or p_every_days > 92 then raise exception 'Frecuencia inválida'; end if;
  if p_first_due is null or p_first_due < branch_today(b.id) then raise exception 'Fecha de primera cuota inválida'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido no tiene ítems';
  end if;

  select base_currency into v_cur from companies where id = b.company_id;
  perform ensure_default_warehouse(b.id);

  insert into orders (branch_id, customer_id, vendor_id, payment_condition, currency, order_type, notes)
  values (b.id, c.id, auth.uid(), 'credit', v_cur, 'counter', nullif(trim(coalesce(p_notes, '')), ''))
  returning id into v_order;

  for it in select * from jsonb_array_elements(p_items) loop
    v_qty := (it->>'qty')::numeric;
    if v_qty is null or v_qty <= 0 or v_qty > 100000 then raise exception 'Cantidad inválida'; end if;
    select * into pr from products
     where id = (it->>'product_id')::uuid and company_id = b.company_id and is_active and is_sellable and deleted_at is null;
    if not found then raise exception 'Producto no disponible'; end if;
    insert into order_items (org_id, order_id, product_id, description, qty, unit_price, tax_rate)
    values (b.org_id, v_order, pr.id, pr.name, v_qty, pr.unit_price, pr.tax_rate);
  end loop;

  perform generate_installments(v_order, p_count, p_every_days, p_first_due, false);
  update orders set status = 'confirmed' where id = v_order;
  select approval_status into v_status from orders where id = v_order;
  return jsonb_build_object('order_id', v_order, 'approval', v_status);
end $$;

-- Pendientes de aprobar (dueño / supervisor)
create or replace function credit_approvals() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'orders', (select coalesce(jsonb_agg(jsonb_build_object(
                 'order_id', o.id, 'customer', c.name, 'customer_id', c.id, 'branch', b.name,
                 'total', o.total_amount, 'currency', o.currency, 'at', o.confirmed_at,
                 'vendor', (select full_name from profiles where id = o.vendor_id),
                 'limit', c.credit_limit, 'balance', customer_open_balance(c.id),
                 'installments', (select count(*) from installments i where i.order_id = o.id))
               order by o.confirmed_at), '[]'::jsonb)
                 from orders o join customers c on c.id = o.customer_id join branches b on b.id = o.branch_id
                where o.status = 'confirmed' and o.approval_status = 'pending_supervisor' and is_branch_manager(o.branch_id)),
    'customers', (select coalesce(jsonb_agg(jsonb_build_object(
                    'customer_id', c.id, 'customer', c.name, 'branch', b.name, 'limit', c.credit_limit,
                    'currency', (select base_currency from companies where id = c.company_id))
                  order by c.created_at), '[]'::jsonb)
                    from customers c join branches b on b.id = c.branch_id
                   where c.credit_status = 'pending_approval' and c.deleted_at is null and is_branch_manager(c.branch_id)));
$$;

create or replace function decide_customer_credit(p_customer uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public as $$
declare c customers%rowtype;
begin
  select * into c from customers where id = p_customer for update;
  if not found or not is_branch_manager(c.branch_id) then raise exception 'Sin permiso'; end if;
  update customers
     set credit_status = case when p_approve then 'approved'::credit_status else 'blocked'::credit_status end,
         credit_limit = case when p_approve then credit_limit else 0 end
   where id = c.id;
end $$;

-- ---------- Cobro de cuotas en caja ----------
create or replace function cashier_find_debtors(p_search text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_branch uuid; q text := nullif(lower(trim(coalesce(p_search, ''))), '');
begin
  select branch_id into v_branch from register_shifts where cashier_id = auth.uid() and status = 'open';
  if v_branch is null then raise exception 'Necesita un turno de caja abierto'; end if;
  if q is null or length(q) < 2 then return '[]'::jsonb; end if;
  return (
    select coalesce(jsonb_agg(x), '[]'::jsonb) from (
      select jsonb_build_object('id', c.id, 'name', c.name,
               'doc', case when c.tax_id is null then null else '•••' || right(c.tax_id, 3) end,
               'balance', customer_open_balance(c.id), 'overdue', customer_overdue(c.id)) as x
        from customers c
       where c.branch_id = v_branch and not c.is_walk_in and c.deleted_at is null
         and (lower(c.name) like '%' || q || '%' or lower(coalesce(c.tax_id, '')) = q)
         and customer_open_balance(c.id) > 0
       order by c.name limit 20) t);
end $$;

-- ---------- Panel del dueño: uso real del almacenamiento ----------
create or replace function owner_overview(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v jsonb; l record;
begin
  if not (is_org_owner(p_org) or is_platform_admin()) then raise exception 'Sin permiso'; end if;
  select * into l from org_limits(p_org);

  select jsonb_build_object(
    'org', (select jsonb_build_object(
               'name', o.name, 'plan_code', p.code, 'plan_name', p.name, 'price_usd', p.price_usd,
               'status', o.subscription_status, 'trial_ends_at', o.trial_ends_at,
               'next_billing_date', o.next_billing_date, 'grace_ends_at', o.grace_ends_at)
              from organizations o join plans p on p.id = o.plan_id where o.id = p_org),
    'usage', jsonb_build_object(
       'companies', jsonb_build_object('used', l.used_companies, 'max', l.max_companies),
       'branches',  jsonb_build_object('used', l.used_branches,  'max', l.max_branches),
       'users',     jsonb_build_object('used', l.used_users,     'max', l.max_users),
       'storage_mb', jsonb_build_object('used', org_storage_mb(p_org), 'max', l.max_storage_mb)),
    -- cobros de hoy (netos de reversos), por moneda, según la hora local de cada sucursal
    'today', coalesce((
       select jsonb_agg(jsonb_build_object('currency', x.currency, 'amount', x.amount, 'count', x.cnt))
         from (select pm.currency, sum(pm.amount) as amount, count(*) filter (where pm.amount > 0) as cnt
                 from payments pm join branches b on b.id = pm.branch_id
                where pm.org_id = p_org
                  and (pm.collected_at at time zone b.timezone)::date = (now() at time zone b.timezone)::date
                group by pm.currency) x), '[]'::jsonb),
    'open_shifts', (select count(*) from register_shifts s where s.org_id = p_org and s.status = 'open'),
    'pending_reversals', (select count(*) from payment_reversals r where r.org_id = p_org and r.status = 'pending'),
    'pending_settlements', (select count(*) from route_settlements st
                             where st.org_id = p_org and st.status = 'pending_delivery')
  ) into v;
  return v;
end $$;

revoke execute on function org_storage_mb(uuid), can_access_customer_file(text), storage_has_room(text),
  can_handle_customers(uuid), customer_overdue(uuid), customers_list(uuid, text),
  save_customer(uuid, uuid, text, text, text, text, numeric, text), set_customer_files(uuid, text, text, boolean),
  customer_detail(uuid), create_credit_sale(uuid, uuid, jsonb, int, int, date, text), credit_approvals(),
  decide_customer_credit(uuid, boolean), cashier_find_debtors(text) from public, anon;
grant execute on function can_access_customer_file(text), storage_has_room(text),
  can_handle_customers(uuid), customers_list(uuid, text),
  save_customer(uuid, uuid, text, text, text, text, numeric, text), set_customer_files(uuid, text, text, boolean),
  customer_detail(uuid), create_credit_sale(uuid, uuid, jsonb, int, int, date, text), credit_approvals(),
  decide_customer_credit(uuid, boolean), cashier_find_debtors(text) to authenticated;
grant execute on function org_storage_mb(uuid), can_access_customer_file(text), storage_has_room(text),
  can_handle_customers(uuid), customer_overdue(uuid), customers_list(uuid, text),
  save_customer(uuid, uuid, text, text, text, text, numeric, text), set_customer_files(uuid, text, text, boolean),
  customer_detail(uuid), create_credit_sale(uuid, uuid, jsonb, int, int, date, text), credit_approvals(),
  decide_customer_credit(uuid, boolean), cashier_find_debtors(text) to service_role;
