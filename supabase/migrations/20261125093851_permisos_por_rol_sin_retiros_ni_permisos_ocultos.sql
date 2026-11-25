-- Etapa 2 · Permisos por rol
-- Retiros eliminados (todo egreso es un gasto); cada rol parte solo con lo que su función necesita;
-- todo permiso activado se ve en el panel; nuevos: tables.remove_item y workshop.remove_line.
-- Supervisor, cobrador y vendedor conservan sus valores anteriores (perm_default_base).

create or replace function public.perm_default_base(p_role text, p_key text)
 returns boolean language sql immutable set search_path to 'public' as $$
  select case when p_key = 'cash.see_expected' then p_role = 'supervisor'
              when p_role = 'vendor' and (p_key like 'cash.%' or p_key like 'collector.%' or p_key like 'loans.%' or p_key like 'inv.out_%'
                   or p_key in ('inv.see_cost', 'payments.reverse', 'sales.credit', 'reports.export')) then false
              when p_role = 'vendor' and p_key = 'store.orders' then true
              when p_role = 'cashier' and (p_key like 'loans.%' or p_key like 'collector.%' or p_key like 'inv.out_%'
                   or p_key in ('inv.see_cost', 'sales.credit', 'reports.export', 'customers.create', 'customers.edit')) then false
              when p_key in ('products.create', 'products.edit', 'products.price', 'products.delete', 'inv.receive', 'inv.adjust', 'inv.purchase', 'inv.transfer') then p_role in ('supervisor', 'storekeeper', 'director')
              when p_key = 'inv.photo' then p_role in ('supervisor', 'storekeeper')
              when p_key = 'store.orders' then p_role in ('supervisor', 'cashier', 'storekeeper')
              when p_key = 'store.assign' then p_role = 'supervisor'
              when p_key like 'store.%' then p_role in ('supervisor', 'storekeeper')
              when p_key in ('collector.delete_credits', 'collector.delete_customers', 'collector.delete_installments', 'loans.no_photo', 'loans.no_id_photo') then false
              when p_key = 'routes.liquidate' then p_role in ('supervisor', 'collector')
              when p_key in ('loans.interest', 'loans.cancel', 'loans.reschedule', 'routes.invest', 'routes.approve_loans', 'collector.portfolio')
                then p_role = 'supervisor'
              else true end;
$$;

create or replace function public.role_offered_keys(p_role text)
 returns text[] language sql immutable set search_path to 'public' as $$
  select case p_role
    when 'supervisor' then array['cash.see_expected','cash.expense','cash.deposit','cash.change_fund','payments.reverse','sales.credit','inv.see_cost','inv.adjust','products.price','products.delete','customers.edit','reports.export','store.publish','loans.create','loans.interest','loans.cancel','loans.reschedule','routes.invest','routes.liquidate','routes.approve_loans']
    when 'cashier' then array['products.see_code','cash.see_expected','cash.expense','cash.deposit','cash.change_fund','customers.view_docs','customers.upload_docs','payments.reverse','sales.cancel_request','store.photo','store.publish','store.edit_info','store.orders','store.assign']
    when 'vendor' then array['products.see_code','sales.credit','inv.see_cost','customers.create','customers.edit','customers.view_docs','customers.upload_docs','payments.reverse','sales.cancel_request','store.photo','store.publish','store.edit_info','store.orders','store.assign']
    when 'collector' then array['collector.expenses','collector.pay_out','collector.portfolio','loans.create','loans.customers','loans.interest','loans.cancel','loans.reschedule','payments.reverse','routes.liquidate','routes.invest']
    when 'storekeeper' then array['products.see_code','products.create','products.edit','products.price','products.delete','inv.receive','inv.purchase','inv.adjust','inv.out_waste','inv.out_damaged','inv.out_expired','inv.out_internal','inv.out_supplier_return','inv.out_other','inv.transfer','inv.see_cost','inv.photo','store.photo','store.publish','store.edit_info','store.orders','store.assign']
    when 'accountant' then array['reports.export','inv.see_cost','products.see_code','customers.view_docs']
    when 'director' then array['reports.export','inv.see_cost','products.see_code','customers.view_docs']
    when 'secretary' then array['reports.export','products.see_code','customers.view_docs']
    when 'waiter' then array['products.see_code','sales.cancel_request','tables.remove_item']
    when 'kitchen' then array['products.see_code']
    when 'technician' then array['customers.create','customers.edit','customers.view_docs','customers.upload_docs','products.see_code','workshop.remove_line']
    when 'delivery' then array['products.see_code']
    when 'reception' then array['customers.create','customers.edit','customers.view_docs','customers.upload_docs','products.see_code','sales.cancel_request','store.orders','cash.expense','cash.deposit','cash.change_fund','payments.reverse']
    else '{}'::text[] end;
$$;

create or replace function public.role_default_keys(p_role text)
 returns text[] language sql immutable set search_path to 'public' as $$
  select case p_role
    when 'cashier' then array['products.see_code','cash.expense','cash.deposit','cash.change_fund','customers.view_docs','customers.upload_docs','payments.reverse','sales.cancel_request','store.orders']
    when 'storekeeper' then array['products.see_code','products.create','products.edit','products.price','products.delete','inv.receive','inv.purchase','inv.adjust','inv.out_waste','inv.out_damaged','inv.out_expired','inv.out_internal','inv.out_supplier_return','inv.out_other','inv.transfer','inv.see_cost','inv.photo','store.photo','store.publish','store.edit_info','store.orders']
    when 'accountant' then array['reports.export','inv.see_cost','products.see_code','customers.view_docs']
    when 'director' then array['reports.export','inv.see_cost','products.see_code','customers.view_docs']
    when 'secretary' then array['reports.export','products.see_code','customers.view_docs']
    when 'waiter' then array['products.see_code','sales.cancel_request']
    when 'kitchen' then array['products.see_code']
    when 'technician' then array['customers.create','customers.edit','customers.view_docs','customers.upload_docs','products.see_code']
    when 'delivery' then array['products.see_code']
    when 'reception' then array['customers.create','customers.edit','customers.view_docs','customers.upload_docs','products.see_code','sales.cancel_request','store.orders']
    else '{}'::text[] end;
$$;

create or replace function public.perm_catalog()
 returns text[] language sql immutable set search_path to 'public' as $$
  select array['cash.see_expected', 'cash.expense', 'cash.deposit', 'cash.change_fund',
    'sales.credit', 'customers.create', 'customers.edit', 'customers.view_docs', 'customers.upload_docs', 'collector.expenses', 'collector.pay_out',
    'loans.create', 'loans.customers', 'loans.interest', 'loans.cancel', 'loans.reschedule',
    'routes.liquidate', 'routes.invest', 'routes.approve_loans',
    'payments.reverse', 'products.create', 'products.edit', 'products.price', 'products.delete', 'products.see_code',
    'inv.receive', 'inv.purchase', 'inv.adjust',
    'inv.out_waste', 'inv.out_damaged', 'inv.out_expired', 'inv.out_internal', 'inv.out_supplier_return', 'inv.out_other',
    'inv.transfer', 'reports.export', 'sales.cancel_request', 'inv.see_cost', 'inv.photo',
    'store.photo', 'store.publish', 'store.edit_info', 'store.orders', 'store.assign',
    'tables.remove_item', 'workshop.remove_line'];
$$;

create or replace function public.perm_default(p_role text, p_key text)
 returns boolean language sql immutable set search_path to 'public' as $$
  select case
    when p_key in ('tables.remove_item', 'workshop.remove_line') then true
    when p_role in ('cashier','storekeeper','accountant','director','secretary','waiter','kitchen','technician','delivery','reception')
         and p_key = any(perm_catalog()) then p_key = any(role_default_keys(p_role))
    else perm_default_base(p_role, p_key) end;
$$;

revoke execute on function public.perm_default_base(text, text) from public, anon;
revoke execute on function public.role_offered_keys(text) from public, anon;
revoke execute on function public.role_default_keys(text) from public, anon;
grant execute on function public.perm_default_base(text, text) to authenticated, service_role;
grant execute on function public.role_offered_keys(text) to authenticated, service_role;
grant execute on function public.role_default_keys(text) to authenticated, service_role;

create or replace function public.permissions_admin(p_org uuid)
 returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v_roles text[] := array['supervisor','cashier','vendor','collector','waiter','kitchen','technician','storekeeper','accountant','director','secretary','reception','delivery'];
begin
  if not (is_org_owner(p_org) or is_platform_admin()) then raise exception 'Sin permiso'; end if;
  return jsonb_build_object(
    'keys', to_jsonb(perm_catalog()),
    'offered', (select jsonb_object_agg(r, to_jsonb(role_offered_keys(r))) from unnest(v_roles) r),
    'roles', (select jsonb_object_agg(r, (select jsonb_object_agg(k,
                coalesce((o.role_permissions->r->>k)::boolean, perm_default(r, k))) from unnest(perm_catalog()) k))
              from unnest(v_roles) r, organizations o where o.id = p_org),
    'users', (select coalesce(jsonb_agg(jsonb_build_object(
                'membership_id', m.id, 'name', p.full_name, 'role', m.role, 'branch', b.name,
                'permissions', m.permissions) order by p.full_name, m.role), '[]'::jsonb)
                from memberships m
                join profiles p on p.id = m.user_id
                left join branches b on b.id = m.branch_id
               where m.org_id = p_org and m.is_active and m.deleted_at is null
                 and m.role <> 'owner')
  );
end $$;

create or replace function public.add_cash_movement(p_type cash_movement_type, p_amount numeric, p_description text)
 returns uuid language plpgsql security definer set search_path to 'public' as $$
declare s register_shifts%rowtype; v_id uuid; v_cur char(3);
begin
  select * into s from register_shifts where cashier_id = auth.uid() and status = 'open';
  if s.id is null then raise exception 'Necesita un turno de caja abierto'; end if;
  if p_type = 'withdrawal' then raise exception 'Los retiros ya no existen: registre un gasto'; end if;
  if not has_perm(case p_type when 'deposit' then 'cash.deposit' when 'change_fund' then 'cash.change_fund' else 'cash.expense' end, s.branch_id) then raise exception 'Tu usuario no tiene permiso para registrar este movimiento de caja'; end if;
  if not org_writable(s.org_id) then raise exception 'Cuenta suspendida: solo lectura'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Monto inválido'; end if;
  if coalesce(trim(p_description), '') = '' then raise exception 'Indique el motivo'; end if;
  select base_currency into v_cur from companies where id = s.company_id;

  insert into cash_movements (branch_id, type, amount, currency, shift_id, description, created_by)
  values (s.branch_id, p_type, round(p_amount, 2), v_cur, s.id, trim(p_description), auth.uid())
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.cash_movement_types()
 returns text[] language plpgsql stable security definer set search_path to 'public' as $$
declare b uuid;
begin
  select branch_id into b from register_shifts where cashier_id = auth.uid() and status = 'open' limit 1;
  if b is null then return '{}'; end if;
  return array(select t from (values ('expense','cash.expense'),('deposit','cash.deposit'),('change_fund','cash.change_fund')) v(t,k) where has_perm(k, b));
end $$;

create or replace function public.remove_table_item(p_item uuid)
 returns void language plpgsql security definer set search_path to 'public' as $$
declare i order_items%rowtype; o orders%rowtype;
begin
  select * into i from order_items where id = p_item;
  if not found then raise exception 'Ítem inexistente'; end if;
  select * into o from orders where id = i.order_id;
  if o.status <> 'draft' then raise exception 'La cuenta ya está cerrada'; end if;
  if not (is_branch_manager(o.branch_id) or has_branch_role(o.branch_id, '{waiter}')) then raise exception 'Sin permiso'; end if;
  if not has_perm('tables.remove_item', o.branch_id) then raise exception 'PERM_DENIED'; end if;
  if i.kitchen_status is null or i.kitchen_status = 'pending' then delete from order_items where id = i.id;
  else update order_items set kitchen_status = 'cancelled' where id = i.id; end if;
end $$;

create or replace function public.set_kitchen_item_status(p_item uuid, p_status kitchen_status)
 returns void language plpgsql security definer set search_path to 'public' as $$
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
    if not has_perm('tables.remove_item', v_branch) then raise exception 'PERM_DENIED'; end if;
  elsif p_status = 'served' then
    if not (is_branch_manager(v_branch) or has_branch_role(v_branch, '{waiter,kitchen}')) then
      raise exception 'Sin permiso';
    end if;
  elsif not (is_branch_manager(v_branch) or has_branch_role(v_branch, '{kitchen}')) then
    raise exception 'Solo cocina cambia este estado';
  end if;
  update order_items set kitchen_status = p_status where id = p_item;
end $$;

create or replace function public.wo_remove_line(p_item uuid)
 returns void language plpgsql security definer set search_path to 'public' as $$
declare i order_items%rowtype; w work_orders%rowtype;
begin
  select * into i from order_items where id = p_item;
  if not found then raise exception 'Ítem inexistente'; end if;
  select * into w from work_orders where order_id = i.order_id;
  if not found or not can_work_shop(w.branch_id) then raise exception 'Sin permiso'; end if;
  if not has_perm('workshop.remove_line', w.branch_id) then raise exception 'PERM_DENIED'; end if;
  delete from order_items where id = i.id;
end $$;
