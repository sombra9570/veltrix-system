-- Veltrix · 061 · Delivery: límite de efectivo por repartidor, asignar pedido y reporte por repartidor.
-- (Aplicada en Supabase como "delivery_cash_limit_assign_report"; este es el texto aplicado.)

alter table branches add column if not exists delivery_cash_limit numeric check (delivery_cash_limit is null or delivery_cash_limit > 0);

drop function if exists public.delivery_admin(uuid, boolean, jsonb, text);
create function public.delivery_admin(p_branch uuid, p_enabled boolean default null, p_zone jsonb default null, p_cash_mode text default null, p_cash_limit numeric default null)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
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
  -- límite de efectivo que puede llevar un repartidor (0 = sin límite)
  if p_cash_limit is not null then
    update branches set delivery_cash_limit = nullif(greatest(p_cash_limit, 0), 0) where id = p_branch;
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
    'cash_limit', (select delivery_cash_limit from branches where id = p_branch),
    'zones', coalesce((select jsonb_agg(jsonb_build_object('id', z.id, 'name', z.name, 'fee', z.fee, 'free_over', z.free_over,
                       'eta_min', z.eta_min, 'active', z.is_active) order by z.name) from delivery_zones z where z.branch_id = p_branch), '[]'::jsonb));
end $function$;
revoke all on function public.delivery_admin(uuid, boolean, jsonb, text, numeric) from public, anon;
grant execute on function public.delivery_admin(uuid, boolean, jsonb, text, numeric) to authenticated, service_role;

create or replace function public.delivery_set_status(p_order uuid, p_status text, p_collected numeric default null)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
declare o orders%rowtype; v_mgr boolean; v_mine boolean; v_mode text; v_max numeric; v_limit numeric; v_held numeric;
begin
  select * into o from orders where id = p_order for update;
  if not found or o.order_type <> 'delivery' or o.status <> 'confirmed' then raise exception 'DELIVERY_INVALID'; end if;
  v_mgr := can_serve_tables(o.branch_id);
  if not v_mgr and not has_branch_role(o.branch_id, '{delivery}') then raise exception 'PERM_DENIED'; end if;
  select exists (select 1 from delivery_assignments where order_id = o.id and driver_id = auth.uid()) into v_mine;
  if p_status = 'dispatched' then
    if o.delivery_status <> 'pending' then raise exception 'DELIVERY_TAKEN'; end if;
    -- si ya lleva el efectivo permitido, primero debe entregarlo en caja
    select delivery_cash_limit into v_limit from branches where id = o.branch_id;
    if v_limit is not null then
      select coalesce(sum(amount), 0) into v_held from delivery_cash
       where driver_id = auth.uid() and branch_id = o.branch_id and status = 'with_driver';
      if v_held >= v_limit then raise exception 'DRIVER_CASH_LIMIT'; end if;
    end if;
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

-- Repartidores de una sucursal (para asignar pedidos)
create or replace function public.delivery_drivers(p_branch uuid)
 returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
begin
  if not can_serve_tables(p_branch) then raise exception 'PERM_DENIED'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', pf.id, 'name', pf.full_name) order by pf.full_name)
    from memberships m join profiles pf on pf.id = m.user_id
    left join custom_roles cr on cr.id = m.custom_role_id and cr.deleted_at is null
   where m.branch_id = p_branch and m.is_active and m.deleted_at is null and pf.is_active
     and (m.role = 'delivery' or (cr.id is not null and (cr.base_role = 'delivery' or 'delivery'::app_role = any(cr.also_roles))))), '[]'::jsonb);
end $function$;

-- El encargado asigna un pedido a un repartidor concreto
create or replace function public.delivery_assign(p_order uuid, p_driver uuid)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
declare o orders%rowtype;
begin
  select * into o from orders where id = p_order for update;
  if not found or o.order_type <> 'delivery' or o.status <> 'confirmed' then raise exception 'DELIVERY_INVALID'; end if;
  if not can_serve_tables(o.branch_id) then raise exception 'PERM_DENIED'; end if;
  if o.delivery_status not in ('pending', 'dispatched') then raise exception 'DELIVERY_INVALID'; end if;
  if not exists (
    select 1 from memberships m left join custom_roles cr on cr.id = m.custom_role_id and cr.deleted_at is null
     where m.user_id = p_driver and m.branch_id = o.branch_id and m.is_active and m.deleted_at is null
       and (m.role = 'delivery' or (cr.id is not null and (cr.base_role = 'delivery' or 'delivery'::app_role = any(cr.also_roles))))
  ) then raise exception 'DRIVER_INVALID'; end if;
  insert into delivery_assignments (order_id, org_id, branch_id, driver_id) values (o.id, o.org_id, o.branch_id, p_driver)
    on conflict (order_id) do update set driver_id = excluded.driver_id, taken_at = now();
  update orders set delivery_status = 'dispatched' where id = o.id;
end $function$;

-- Efectivo que lleva el repartidor y su límite
create or replace function public.delivery_my_cash(p_branch uuid)
 returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
begin
  if not can_serve_tables(p_branch) and not has_branch_role(p_branch, '{delivery}') then raise exception 'PERM_DENIED'; end if;
  return jsonb_build_object(
    'held', coalesce((select sum(amount) from delivery_cash where driver_id = auth.uid() and branch_id = p_branch and status = 'with_driver'), 0),
    'limit', (select delivery_cash_limit from branches where id = p_branch));
end $function$;

-- Reporte por repartidor (entregas, fallidas, efectivo) de los últimos días
create or replace function public.delivery_driver_report(p_branch uuid, p_days int default 7)
 returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare v_from timestamptz := now() - make_interval(days => least(greatest(coalesce(p_days, 7), 1), 90));
begin
  if not can_serve_tables(p_branch) then raise exception 'PERM_DENIED'; end if;
  return coalesce((select jsonb_agg(r order by (r->>'delivered')::int desc) from (
    select jsonb_build_object(
      'driver_id', da.driver_id,
      'name', (select full_name from profiles where id = da.driver_id),
      'delivered', count(*) filter (where o.delivery_status = 'delivered' and o.updated_at >= v_from),
      'failed', count(*) filter (where o.delivery_status = 'failed' and o.updated_at >= v_from),
      'active', count(*) filter (where o.delivery_status = 'dispatched'),
      'cash_collected', coalesce((select sum(dc.amount) from delivery_cash dc where dc.driver_id = da.driver_id and dc.branch_id = p_branch and dc.collected_at >= v_from), 0),
      'cash_pending', coalesce((select sum(dc.amount) from delivery_cash dc where dc.driver_id = da.driver_id and dc.branch_id = p_branch and dc.status = 'with_driver'), 0)) r
    from delivery_assignments da join orders o on o.id = da.order_id
   where da.branch_id = p_branch
   group by da.driver_id) t), '[]'::jsonb);
end $function$;

revoke all on function public.delivery_drivers(uuid), public.delivery_assign(uuid, uuid), public.delivery_my_cash(uuid), public.delivery_driver_report(uuid, int) from public, anon;
grant execute on function public.delivery_drivers(uuid), public.delivery_assign(uuid, uuid), public.delivery_my_cash(uuid), public.delivery_driver_report(uuid, int) to authenticated, service_role;
