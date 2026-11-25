alter table public.delivery_requests
  add column if not exists assigned_to uuid references auth.users(id),
  add column if not exists assigned_at timestamptz,
  add column if not exists fulfilled_at timestamptz;
create index if not exists delivery_requests_assigned_idx on public.delivery_requests (assigned_to) where assigned_to is not null;

create or replace function public.perm_catalog() returns text[] language sql immutable set search_path = public as $$
  select array['cash.see_expected', 'cash.expense', 'cash.withdraw', 'cash.deposit', 'cash.change_fund',
    'sales.credit', 'customers.create', 'customers.edit', 'customers.view_docs', 'customers.upload_docs', 'collector.expenses',
    'loans.create', 'loans.customers', 'loans.interest', 'loans.cancel', 'loans.reschedule',
    'routes.liquidate', 'routes.invest', 'routes.approve_loans',
    'payments.reverse', 'products.create', 'products.edit', 'products.price', 'products.delete',
    'inv.receive', 'inv.purchase', 'inv.adjust',
    'inv.out_waste', 'inv.out_damaged', 'inv.out_expired', 'inv.out_internal', 'inv.out_supplier_return', 'inv.out_other',
    'inv.transfer', 'reports.export', 'sales.cancel_request', 'inv.see_cost',
    'store.photo', 'store.publish', 'store.edit_info', 'store.orders', 'store.assign'];
$$;

create or replace function public.my_store_access(p_company uuid) returns boolean language sql stable security definer set search_path = public as $$
  select store_perm('store.photo', p_company) or store_perm('store.publish', p_company) or store_perm('store.edit_info', p_company)
      or store_perm('store.orders', p_company) or store_perm('store.assign', p_company)
      or exists (select 1 from delivery_requests r join branches b on b.id = r.branch_id
                  where b.company_id = p_company and r.assigned_to = auth.uid() and r.fulfilled_at is null and r.status = 'accepted');
$$;

-- Bandeja: quien tiene store.orders ve todos; quien solo recibió un pedido delegado ve los suyos
create or replace function public.store_orders(p_company uuid) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_all boolean; v_assign boolean; c companies%rowtype;
begin
  select * into c from companies where id = p_company and deleted_at is null;
  if not found then raise exception 'PERM_DENIED'; end if;
  v_all := store_perm('store.orders', p_company); v_assign := store_perm('store.assign', p_company);
  if not (v_all or v_assign or exists (select 1 from delivery_requests r join branches b on b.id = r.branch_id where b.company_id = p_company and r.assigned_to = auth.uid())) then
    raise exception 'PERM_DENIED';
  end if;
  return jsonb_build_object(
    'can_resolve', v_all, 'can_assign', v_assign, 'me', auth.uid(),
    'workers', case when v_assign then (
      select coalesce(jsonb_agg(jsonb_build_object('id', x.user_id, 'name', coalesce(x.full_name, x.email, '—')) order by x.full_name), '[]'::jsonb) from (
        select distinct m.user_id, pr.full_name, pr.email from memberships m join profiles pr on pr.id = m.user_id
         where m.org_id = c.org_id and m.is_active and m.deleted_at is null and m.user_id <> auth.uid()
           and (m.company_id is null or m.company_id = c.id)) x) else '[]'::jsonb end,
    'orders', (select coalesce(jsonb_agg(o order by (o->>'status') = 'pending' desc, o->>'at' desc), '[]'::jsonb) from (
      select jsonb_build_object('id', r.id, 'at', r.created_at, 'status', r.status, 'kind', r.kind, 'customer', r.customer_name, 'phone', r.phone,
               'address', r.address, 'lat', r.lat, 'lng', r.lng, 'notes', r.notes, 'pay_pref', r.pay_pref, 'subtotal', r.subtotal,
               'reject_reason', r.reject_reason, 'assigned_to', r.assigned_to,
               'assigned_name', (select coalesce(full_name, email) from profiles where id = r.assigned_to), 'fulfilled_at', r.fulfilled_at,
               'items', (select coalesce(jsonb_agg(jsonb_build_object('name', pr.name, 'qty', (i->>'qty')::numeric) order by pr.name), '[]'::jsonb)
                           from jsonb_array_elements(r.items) i join products pr on pr.id = (i->>'product_id')::uuid)) as o
        from delivery_requests r join branches b on b.id = r.branch_id
       where b.company_id = p_company
         and (v_all or v_assign or r.assigned_to = auth.uid())
         and (r.status = 'pending' or (r.status = 'accepted' and r.fulfilled_at is null) or r.created_at > now() - interval '2 days')
       order by r.created_at desc limit 100) t)
  );
end $$;

do $m$
declare d text;
begin
  d := pg_get_functiondef('public.delivery_request_resolve(uuid,boolean,text)'::regprocedure);
  d := replace(d, 'FUNCTION public.delivery_request_resolve(', 'FUNCTION public.store_order_resolve(');
  d := replace(d, 'if not can_serve_tables(r.branch_id) then raise exception ''PERM_DENIED''; end if;',
    'if not store_perm(''store.orders'', (select company_id from branches where id = r.branch_id)) then raise exception ''PERM_DENIED''; end if;');
  execute d;
end $m$;

create or replace function public.store_order_assign(p_request uuid, p_user uuid) returns void language plpgsql security definer set search_path = public as $$
declare r delivery_requests%rowtype; v_comp uuid;
begin
  select * into r from delivery_requests where id = p_request for update;
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
  select company_id into v_comp from branches where id = r.branch_id;
  if not store_perm('store.assign', v_comp) then raise exception 'PERM_DENIED'; end if;
  if r.status <> 'accepted' or r.fulfilled_at is not null then raise exception 'REQUEST_NOT_PENDING'; end if;
  if p_user is not null and not exists (select 1 from memberships m where m.user_id = p_user and m.org_id = r.org_id and m.is_active and m.deleted_at is null) then
    raise exception 'DRIVER_INVALID';
  end if;
  update delivery_requests set assigned_to = p_user, assigned_at = case when p_user is null then null else now() end where id = r.id;
end $$;

create or replace function public.store_order_done(p_request uuid) returns void language plpgsql security definer set search_path = public as $$
declare r delivery_requests%rowtype; v_comp uuid;
begin
  select * into r from delivery_requests where id = p_request for update;
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
  select company_id into v_comp from branches where id = r.branch_id;
  if not (r.assigned_to = auth.uid() or store_perm('store.orders', v_comp) or store_perm('store.assign', v_comp)) then raise exception 'PERM_DENIED'; end if;
  if r.status <> 'accepted' then raise exception 'REQUEST_NOT_PENDING'; end if;
  update delivery_requests set fulfilled_at = now() where id = r.id;
end $$;

revoke all on function public.store_orders(uuid), public.store_order_resolve(uuid,boolean,text), public.store_order_assign(uuid,uuid), public.store_order_done(uuid) from public, anon;
grant execute on function public.store_orders(uuid), public.store_order_resolve(uuid,boolean,text), public.store_order_assign(uuid,uuid), public.store_order_done(uuid) to authenticated;

-- Pedido público: ahora lleva dirección y referencia para delivery
drop function if exists public.public_store_pickup(text,jsonb,text,text,text,text,text,numeric,numeric);
create or replace function public.public_store_pickup(p_slug text, p_items jsonb, p_name text, p_phone text, p_notes text, p_pay text, p_kind text default 'pickup', p_lat numeric default null, p_lng numeric default null, p_address text default null, p_reference text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare s stores%rowtype; it jsonb; pr products%rowtype; v_qty numeric; v_clean jsonb := '[]'::jsonb; v_wh uuid; v_stock numeric;
        v_sub numeric := 0; v_phone text; v_id uuid; v_kind text := case when p_kind = 'delivery' then 'delivery' else 'pickup' end;
begin
  select * into s from stores where slug = lower(trim(p_slug)) and is_published;
  if not found or not org_writable(s.org_id) then raise exception 'STORE_INVALID'; end if;
  v_phone := regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g');
  if length(v_phone) < 6 or length(v_phone) > 16 then raise exception 'PHONE_INVALID'; end if;
  if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'DATA_INVALID'; end if;
  if v_kind = 'delivery' and length(trim(coalesce(p_address, ''))) < 5 and (p_lat is null or p_lng is null) then raise exception 'DATA_INVALID'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 40 then raise exception 'ITEMS_INVALID'; end if;
  if (select count(*) from delivery_requests where branch_id = s.branch_id and status = 'pending') >= 40
     or (select count(*) from delivery_requests where phone = v_phone and status = 'pending') >= 3
     or (select count(*) from delivery_requests where phone = v_phone and created_at > now() - interval '1 hour') >= 6 then
    raise exception 'TOO_MANY_REQUESTS';
  end if;
  v_wh := default_warehouse(s.branch_id);
  for it in select * from jsonb_array_elements(p_items) loop
    v_qty := (it->>'qty')::numeric;
    if v_qty is null or v_qty <= 0 or v_qty > 30 or v_qty <> trunc(v_qty) then raise exception 'ITEMS_INVALID'; end if;
    select * into pr from products where id = (it->>'product_id')::uuid and company_id = s.company_id and in_store and is_active and is_sellable and deleted_at is null;
    if not found then raise exception 'PRODUCT_UNAVAILABLE'; end if;
    if pr.track_stock then
      select coalesce(qty, 0) into v_stock from stock_levels where warehouse_id = v_wh and product_id = pr.id;
      if coalesce(v_stock, 0) < v_qty then raise exception 'PRODUCT_UNAVAILABLE'; end if;
    end if;
    v_sub := v_sub + pr.unit_price * v_qty;
    v_clean := v_clean || jsonb_build_array(jsonb_build_object('product_id', pr.id, 'qty', v_qty, 'notes', null));
  end loop;
  select id into v_id from delivery_requests where branch_id = s.branch_id and phone = v_phone and status = 'pending' and kind = v_kind
     and items = v_clean and created_at > now() - interval '3 minutes' order by created_at desc limit 1;
  if v_id is not null then return v_id; end if;
  insert into delivery_requests (org_id, branch_id, kind, zone_id, zone_name, items, customer_name, phone, address, reference, lat, lng, notes, pay_pref, subtotal, fee)
  values (s.org_id, s.branch_id, v_kind, null, case when v_kind = 'pickup' then 'Recojo en tienda' else 'Delivery' end, v_clean,
          left(trim(p_name), 60), v_phone,
          case when v_kind = 'pickup' then 'Recojo en tienda' else coalesce(nullif(left(trim(coalesce(p_address, '')), 200), ''), 'Ubicación en el mapa') end,
          nullif(left(trim(coalesce(p_reference, '')), 150), ''),
          case when p_lat between -90 and 90 then round(p_lat, 6) end, case when p_lng between -180 and 180 then round(p_lng, 6) end,
          nullif(left(trim(coalesce(p_notes, '')), 300), ''), case when p_pay = 'qr' then 'qr' else 'cash' end, round(v_sub, 2), 0)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.public_store_pickup(text,jsonb,text,text,text,text,text,numeric,numeric,text,text) from public;
grant execute on function public.public_store_pickup(text,jsonb,text,text,text,text,text,numeric,numeric,text,text) to anon, authenticated;

-- store_admin: los pedidos también dan acceso a la pantalla de tienda
do $m$
declare d text;
begin
  d := pg_get_functiondef('public.store_admin(uuid)'::regprocedure);
  d := replace(d, 'if not (pp or pu or pe) then raise exception ''PERM_DENIED''; end if;', 'if not (pp or pu or pe or my_store_access(c.id)) then raise exception ''PERM_DENIED''; end if;');
  d := replace(d, '''perms'', jsonb_build_object(''photo'', pp, ''publish'', pu, ''edit'', pe),', '''perms'', jsonb_build_object(''photo'', pp, ''publish'', pu, ''edit'', pe, ''orders'', store_perm(''store.orders'', c.id) or store_perm(''store.assign'', c.id) or my_store_access(c.id)),');
  execute d;
end $m$;
