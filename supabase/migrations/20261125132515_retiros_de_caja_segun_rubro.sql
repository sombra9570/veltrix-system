-- Los retiros de caja existen en los rubros con caja (tienda, mayorista, restaurante, taller).
-- En microfinanzas, préstamos y cobranza en calle todo egreso es un gasto: allí el retiro no aplica.
create or replace function public.company_allows_withdrawals(p_company uuid)
 returns boolean language sql stable security definer set search_path to 'public' as $$
  select company_modules(p_company) && array['retail','distribution','restaurant','workshop'];
$$;
revoke execute on function public.company_allows_withdrawals(uuid) from public, anon;
grant execute on function public.company_allows_withdrawals(uuid) to authenticated, service_role;

create or replace function public.perm_catalog()
 returns text[] language sql immutable set search_path to 'public' as $$
  select array['cash.see_expected', 'cash.expense', 'cash.withdraw', 'cash.deposit', 'cash.change_fund',
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

create or replace function public.role_offered_keys(p_role text)
 returns text[] language sql immutable set search_path to 'public' as $$
  select case p_role
    when 'supervisor' then array['cash.see_expected','cash.expense','cash.withdraw','cash.deposit','cash.change_fund','payments.reverse','sales.credit','inv.see_cost','inv.adjust','products.price','products.delete','customers.edit','reports.export','store.publish','loans.create','loans.interest','loans.cancel','loans.reschedule','routes.invest','routes.liquidate','routes.approve_loans']
    when 'manager' then array['cash.see_expected','cash.expense','cash.withdraw','cash.deposit','cash.change_fund','payments.reverse','sales.credit','inv.see_cost','inv.adjust','products.price','products.delete','customers.edit','reports.export','store.publish','loans.create','loans.interest','loans.cancel','loans.reschedule','routes.invest','routes.liquidate','routes.approve_loans']
    when 'cashier' then array['products.see_code','cash.see_expected','cash.expense','cash.withdraw','cash.deposit','cash.change_fund','customers.view_docs','customers.upload_docs','payments.reverse','sales.cancel_request','store.photo','store.publish','store.edit_info','store.orders','store.assign']
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
    when 'reception' then array['customers.create','customers.edit','customers.view_docs','customers.upload_docs','products.see_code','sales.cancel_request','store.orders','cash.expense','cash.withdraw','cash.deposit','cash.change_fund','payments.reverse']
    else '{}'::text[] end;
$$;

create or replace function public.role_default_keys(p_role text)
 returns text[] language sql immutable set search_path to 'public' as $$
  select case p_role
    when 'cashier' then array['products.see_code','cash.expense','cash.withdraw','cash.deposit','cash.change_fund','customers.view_docs','customers.upload_docs','payments.reverse','sales.cancel_request','store.orders']
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

create or replace function public.add_cash_movement(p_type cash_movement_type, p_amount numeric, p_description text)
 returns uuid language plpgsql security definer set search_path to 'public' as $$
declare s register_shifts%rowtype; v_id uuid; v_cur char(3);
begin
  select * into s from register_shifts where cashier_id = auth.uid() and status = 'open';
  if s.id is null then raise exception 'Necesita un turno de caja abierto'; end if;
  if p_type = 'withdrawal' and not company_allows_withdrawals(s.company_id) then
    raise exception 'En este rubro no hay retiros: registre un gasto';
  end if;
  if not has_perm(case p_type when 'withdrawal' then 'cash.withdraw' when 'deposit' then 'cash.deposit' when 'change_fund' then 'cash.change_fund' else 'cash.expense' end, s.branch_id) then raise exception 'Tu usuario no tiene permiso para registrar este movimiento de caja'; end if;
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
declare b uuid; v_company uuid;
begin
  select branch_id, company_id into b, v_company from register_shifts where cashier_id = auth.uid() and status = 'open' limit 1;
  if b is null then return '{}'; end if;
  return array(select t from (values ('expense','cash.expense'),('withdrawal','cash.withdraw'),('deposit','cash.deposit'),('change_fund','cash.change_fund')) v(t,k)
                where has_perm(k, b) and (t <> 'withdrawal' or company_allows_withdrawals(v_company)));
end $$;
