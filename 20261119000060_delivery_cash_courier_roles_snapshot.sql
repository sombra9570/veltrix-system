-- Veltrix · 060 · Delivery (efectivo del repartidor, encargos) y asignación de roles.
--
-- NOTA: estos cambios se aplicaron directamente en Supabase con las migraciones
-- 20261118230246 delivery_zones_orders, 20261118230324 delivery_branches,
-- 20261119005339 delivery_cash_courier_tasks y 20261119024352 set_member_role.
-- Este archivo es una FOTO del estado vivo de esos objetos, volcada desde la base,
-- para que el repo los tenga. No es el texto original de aquellas migraciones:
-- las tablas se dejan con "if not exists" y sin RLS/grants (las originales los traen),
-- así que NO usar este archivo para reconstruir desde cero sin revisar RLS y permisos.
-- RLS: delivery_cash y courier_tasks tienen RLS activo y sin permisos para anon/authenticated (solo por RPC).

alter table branches add column if not exists delivery_enabled boolean not null default false;
alter table branches add column if not exists delivery_cash_mode text not null default 'none';  -- 'none' | 'fee' | 'full'

create table if not exists delivery_cash (
  order_id uuid not null,
  org_id uuid not null,
  branch_id uuid not null,
  driver_id uuid not null,
  amount numeric not null,
  status text not null default 'with_driver',  -- with_driver | received
  collected_at timestamptz not null default now(),
  received_by uuid,
  received_at timestamptz,
  counted numeric,
  difference numeric
);

create table if not exists courier_tasks (
  id uuid not null default gen_random_uuid(),
  org_id uuid not null,
  branch_id uuid not null,
  kind text not null,                        -- purchase | document | errand
  title text not null,
  details text,
  pickup_address text,
  pickup_lat numeric,
  pickup_lng numeric,
  drop_address text,
  drop_lat numeric,
  drop_lng numeric,
  budget numeric not null default 0,
  status text not null default 'open',       -- open | taken | done | cancelled
  driver_id uuid,
  created_by uuid,
  taken_at timestamptz,
  done_at timestamptz,
  spent numeric,
  returned numeric,
  receipt_path text,
  result_note text,
  created_at timestamptz not null default now()
);

-- delivery_requests (pedidos que llegan desde la tienda pública): columnas vivas
-- id, org_id, branch_id, zone_id, zone_name, items jsonb, customer_name, phone, address, reference,
-- lat, lng, notes, pay_pref, subtotal, fee, eta_min, status, reject_reason, order_id, resolved_by,
-- resolved_at, created_at

CREATE OR REPLACE FUNCTION public.courier_task_save(p_branch uuid, p_task jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare b branches%rowtype; v_id uuid; v_kind text := coalesce(p_task->>'kind', 'errand');
begin
  select * into b from branches where id = p_branch and deleted_at is null;
  if not found or not can_serve_tables(p_branch) then raise exception 'PERM_DENIED'; end if;
  if not org_writable(b.org_id) then raise exception 'Cuenta suspendida: solo lectura'; end if;
  if v_kind not in ('purchase','document','errand') or coalesce(trim(p_task->>'title'), '') = '' then raise exception 'TASK_INVALID'; end if;
  insert into courier_tasks (org_id, branch_id, kind, title, details, pickup_address, pickup_lat, pickup_lng, drop_address, drop_lat, drop_lng, budget, created_by)
  values (b.org_id, b.id, v_kind, left(trim(p_task->>'title'), 120), nullif(left(trim(coalesce(p_task->>'details', '')), 500), ''),
          nullif(left(trim(coalesce(p_task->>'pickup_address', '')), 200), ''), nullif(p_task->>'pickup_lat', '')::numeric, nullif(p_task->>'pickup_lng', '')::numeric,
          nullif(left(trim(coalesce(p_task->>'drop_address', '')), 200), ''), nullif(p_task->>'drop_lat', '')::numeric, nullif(p_task->>'drop_lng', '')::numeric,
          greatest(coalesce(nullif(p_task->>'budget', '')::numeric, 0), 0), auth.uid())
  returning id into v_id;
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.courier_task_set(p_task uuid, p_action text, p_data jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare t courier_tasks%rowtype; v_mgr boolean;
begin
  select * into t from courier_tasks where id = p_task for update;
  if not found then raise exception 'TASK_INVALID'; end if;
  v_mgr := can_serve_tables(t.branch_id);
  if not v_mgr and not has_branch_role(t.branch_id, '{delivery}') then raise exception 'PERM_DENIED'; end if;
  if p_action = 'take' then
    if t.status <> 'open' then raise exception 'TASK_TAKEN'; end if;
    update courier_tasks set status = 'taken', driver_id = auth.uid(), taken_at = now() where id = t.id;
  elsif p_action = 'done' then
    if t.status <> 'taken' or (t.driver_id <> auth.uid() and not is_branch_manager(t.branch_id)) then raise exception 'TASK_INVALID'; end if;
    if p_data is not null and nullif(p_data->>'receipt_path', '') is not null
       and (split_part(p_data->>'receipt_path', '/', 1) <> t.org_id::text or split_part(p_data->>'receipt_path', '/', 2) <> t.branch_id::text) then
      raise exception 'Ruta inválida';
    end if;
    update courier_tasks set status = 'done', done_at = now(),
           spent = nullif(p_data->>'spent', '')::numeric, returned = nullif(p_data->>'returned', '')::numeric,
           receipt_path = nullif(p_data->>'receipt_path', ''), result_note = nullif(left(trim(coalesce(p_data->>'note', '')), 300), '')
     where id = t.id;
  elsif p_action = 'cancel' then
    if not v_mgr or t.status in ('done', 'cancelled') then raise exception 'PERM_DENIED'; end if;
    update courier_tasks set status = 'cancelled', done_at = now() where id = t.id;
  else
    raise exception 'TASK_INVALID';
  end if;
end $function$;

CREATE OR REPLACE FUNCTION public.courier_tasks_list(p_branch uuid, p_done boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_mgr boolean;
begin
  v_mgr := can_serve_tables(p_branch);
  if not v_mgr and not has_branch_role(p_branch, '{delivery}') then raise exception 'PERM_DENIED'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', t.id, 'kind', t.kind, 'title', t.title, 'details', t.details, 'status', t.status, 'budget', t.budget,
      'pickup_address', t.pickup_address, 'pickup_lat', t.pickup_lat, 'pickup_lng', t.pickup_lng,
      'drop_address', t.drop_address, 'drop_lat', t.drop_lat, 'drop_lng', t.drop_lng,
      'driver', (select full_name from profiles where id = t.driver_id), 'mine', t.driver_id = auth.uid(),
      'created_by', (select full_name from profiles where id = t.created_by),
      'at', t.created_at, 'spent', t.spent, 'returned', t.returned, 'receipt', t.receipt_path, 'note', t.result_note) order by t.created_at desc)
    from courier_tasks t
   where t.branch_id = p_branch
     and ((not p_done and t.status in ('open', 'taken') and (v_mgr or t.status = 'open' or t.driver_id = auth.uid()))
          or (p_done and t.status in ('done', 'cancelled') and (v_mgr or t.driver_id = auth.uid())))), '[]'::jsonb);
end $function$;

CREATE OR REPLACE FUNCTION public.delivery_admin(p_branch uuid, p_enabled boolean DEFAULT NULL::boolean, p_zone jsonb DEFAULT NULL::jsonb, p_cash_mode text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare b branches%rowtype; v_id uuid;
begin
  select * into b from branches where id = p_branch and deleted_at is null;
  if not found or not is_branch_manager(p_branch) then raise exception 'PERM_DENIED'; end if;
  if not org_writable(b.org_id) then raise exception 'Cuenta suspendida: solo lectura'; end if;
  if p_enabled is not null then update branches set delivery_enabled = p_enabled where id = p_branch; end if;
  if p_cash_mode is not null then
    if p_cash_mode not in ('none','fee','full') then raise exception 'MODE_INVALID'; end if;
    update branches set delivery_cash_mode = p_cash_mode where id = p_branch;
  end if;
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
    'cash_mode', (select delivery_cash_mode from branches where id = p_branch),
    'zones', coalesce((select jsonb_agg(jsonb_build_object('id', z.id, 'name', z.name, 'fee', z.fee, 'free_over', z.free_over,
                       'eta_min', z.eta_min, 'active', z.is_active) order by z.name) from delivery_zones z where z.branch_id = p_branch), '[]'::jsonb));
end $function$;

CREATE OR REPLACE FUNCTION public.delivery_branches()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'company', c.legal_name, 'currency', c.base_currency,
           'enabled', b.delivery_enabled, 'org_id', b.org_id, 'cash_mode', b.delivery_cash_mode) order by c.legal_name, b.code), '[]'::jsonb)
    from branches b join companies c on c.id = b.company_id
   where b.deleted_at is null and b.is_active and c.deleted_at is null
     and (can_serve_tables(b.id) or has_branch_role(b.id, '{delivery}'));
$function$;

CREATE OR REPLACE FUNCTION public.delivery_cash_list(p_branch uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not can_serve_tables(p_branch) then raise exception 'PERM_DENIED'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'order_id', dc.order_id, 'amount', dc.amount, 'at', dc.collected_at, 'driver', (select full_name from profiles where id = dc.driver_id),
      'address', o.delivery_address, 'currency', o.currency) order by dc.collected_at)
    from delivery_cash dc join orders o on o.id = dc.order_id
   where dc.branch_id = p_branch and dc.status = 'with_driver'), '[]'::jsonb);
end $function$;

CREATE OR REPLACE FUNCTION public.delivery_cash_receive(p_order uuid, p_counted numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare dc delivery_cash%rowtype; o orders%rowtype; v_shift uuid;
begin
  select * into dc from delivery_cash where order_id = p_order for update;
  if not found or dc.status <> 'with_driver' then raise exception 'CASH_NOT_PENDING'; end if;
  if not can_serve_tables(dc.branch_id) then raise exception 'PERM_DENIED'; end if;
  if p_counted is null or p_counted < 0 then raise exception 'CASH_INVALID'; end if;
  select * into o from orders where id = p_order;
  select id into v_shift from register_shifts where cashier_id = auth.uid() and status = 'open' and branch_id = dc.branch_id;
  if v_shift is null then raise exception 'SHIFT_REQUIRED'; end if;
  if p_counted > 0 then
    perform register_payment(o.customer_id, 'pos_counter', 'cash', round(p_counted, 2), v_shift, null, null, null, now(), o.id);
  end if;
  update delivery_cash set status = 'received', received_by = auth.uid(), received_at = now(),
         counted = round(p_counted, 2), difference = round(p_counted, 2) - amount where order_id = p_order;
end $function$;

CREATE OR REPLACE FUNCTION public.delivery_orders_list(p_branch uuid, p_done boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_mgr boolean; v_mode text;
begin
  v_mgr := can_serve_tables(p_branch);
  if not v_mgr and not has_branch_role(p_branch, '{delivery}') then raise exception 'PERM_DENIED'; end if;
  select delivery_cash_mode into v_mode from branches where id = p_branch;
  return coalesce((
    select jsonb_agg(x order by (x->>'at') desc) from (
      select jsonb_build_object(
        'id', o.id, 'at', coalesce(o.confirmed_at, o.created_at), 'address', o.delivery_address, 'notes', o.notes,
        'status', o.delivery_status, 'total', o.total_amount, 'currency', o.currency,
        'paid', coalesce((select sum(pa.amount) from payment_allocations pa join installments i on i.id = pa.installment_id where i.order_id = o.id), 0),
        'driver', (select pf.full_name from delivery_assignments da join profiles pf on pf.id = da.driver_id where da.order_id = o.id),
        'mine', exists (select 1 from delivery_assignments da where da.order_id = o.id and da.driver_id = auth.uid()),
        'eta_min', dr.eta_min, 'lat', dr.lat, 'lng', dr.lng, 'phone', dr.phone, 'customer', dr.customer_name,
        'cash_mode', v_mode,
        'expected', case v_mode when 'none' then 0
                      when 'fee' then coalesce(dr.fee, 0)
                      else greatest(o.total_amount - coalesce((select sum(pa.amount) from payment_allocations pa join installments i on i.id = pa.installment_id where i.order_id = o.id), 0), 0) end,
        'collected', (select jsonb_build_object('amount', dc.amount, 'status', dc.status) from delivery_cash dc where dc.order_id = o.id),
        'items', (select coalesce(jsonb_agg(jsonb_build_object('description', oi.description, 'qty', oi.qty) order by oi.created_at), '[]'::jsonb)
                    from order_items oi where oi.order_id = o.id and oi.kitchen_status is distinct from 'cancelled' and oi.description <> 'Envío (delivery)')) x
        from orders o left join delivery_requests dr on dr.order_id = o.id
       where o.branch_id = p_branch and o.order_type = 'delivery' and o.status = 'confirmed' and o.deleted_at is null
         and ((not p_done and o.delivery_status in ('pending', 'dispatched')) or (p_done and o.delivery_status in ('delivered', 'failed')))
         and (v_mgr or o.delivery_status = 'pending' or exists (select 1 from delivery_assignments da where da.order_id = o.id and da.driver_id = auth.uid()))
       limit 100) t), '[]'::jsonb);
end $function$;

CREATE OR REPLACE FUNCTION public.delivery_request_resolve(p_request uuid, p_accept boolean, p_reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$;

CREATE OR REPLACE FUNCTION public.delivery_requests_list(p_branch uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$;

CREATE OR REPLACE FUNCTION public.delivery_set_status(p_order uuid, p_status text, p_collected numeric DEFAULT NULL::numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare o orders%rowtype; v_mgr boolean; v_mine boolean; v_mode text; v_max numeric;
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
    if p_status = 'delivered' and coalesce(p_collected, 0) > 0 then
      select delivery_cash_mode into v_mode from branches where id = o.branch_id;
      if v_mode = 'none' then raise exception 'CASH_NOT_ALLOWED'; end if;
      if v_mode = 'fee' then
        select coalesce(fee, 0) into v_max from delivery_requests where order_id = o.id;
      else
        select greatest(o.total_amount - coalesce(sum(pa.amount), 0), 0) into v_max
          from installments i left join payment_allocations pa on pa.installment_id = i.id where i.order_id = o.id;
      end if;
      if p_collected > coalesce(v_max, 0) then raise exception 'CASH_OVER_LIMIT'; end if;
      insert into delivery_cash (order_id, org_id, branch_id, driver_id, amount)
      values (o.id, o.org_id, o.branch_id, auth.uid(), round(p_collected, 2))
      on conflict (order_id) do nothing;
    end if;
    update orders set delivery_status = p_status::delivery_status where id = o.id;
  else
    raise exception 'DELIVERY_INVALID';
  end if;
end $function$;

CREATE OR REPLACE FUNCTION public.plan_role_rules(p_org uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object('combo', p.max_role_combo, 'custom', p.max_custom_roles, 'big', p.max_big_roles)
    from organizations o join plans p on p.id = o.plan_id
   where o.id = p_org and (is_org_owner(o.id));
$function$;

CREATE OR REPLACE FUNCTION public.set_member_role(p_membership uuid, p_role text, p_custom uuid DEFAULT NULL::uuid, p_branch uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare m memberships%rowtype; c custom_roles%rowtype; v_role app_role;
begin
  select * into m from memberships where id = p_membership and deleted_at is null;
  if not found or m.role = 'owner' or not is_org_owner(m.org_id) then raise exception 'Solo el administrador asigna roles'; end if;
  if p_custom is not null then
    select * into c from custom_roles where id = p_custom and org_id = m.org_id and deleted_at is null;
    if not found then raise exception 'Rol no encontrado'; end if;
    v_role := c.base_role;
  else
    if p_role is null or p_role = 'owner' then raise exception 'Rol no permitido'; end if;
    v_role := p_role::app_role;
  end if;
  if p_branch is not null and not exists (select 1 from branches where id = p_branch and org_id = m.org_id and company_id = m.company_id and deleted_at is null) then
    raise exception 'Sucursal no encontrada';
  end if;
  update memberships set role = v_role, custom_role_id = p_custom, branch_id = coalesce(p_branch, branch_id), updated_at = now() where id = p_membership;
  insert into audit_log(org_id, branch_id, table_name, row_id, action, actor_id, old_data, new_data)
    values (m.org_id, coalesce(p_branch, m.branch_id), 'memberships', p_membership, 'set_role', auth.uid(),
            jsonb_build_object('role', m.role, 'custom_role_id', m.custom_role_id, 'branch_id', m.branch_id),
            jsonb_build_object('role', v_role, 'custom_role_id', p_custom, 'branch_id', coalesce(p_branch, m.branch_id)));
end $function$;
