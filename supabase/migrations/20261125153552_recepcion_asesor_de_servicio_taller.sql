-- Recepción como asesor de servicio en el rubro taller: opera el tablero y las órdenes de trabajo.
-- Facturar la orden es un permiso de una sola acción (workshop.invoice); técnico y recepción lo ofrecen.
create or replace function public.can_work_shop(p_branch uuid)
 returns boolean language sql stable security definer set search_path to 'public' as $$
  select is_branch_manager(p_branch) or has_branch_role(p_branch, '{technician}')
      or (has_branch_role(p_branch, '{reception}')
          and 'workshop' = any(company_modules((select b.company_id from branches b where b.id = p_branch))));
$$;

create or replace function public.perm_default(p_role text, p_key text)
 returns boolean language sql immutable set search_path to 'public' as $$
  select case
    when p_role = 'manager' then perm_default_base('supervisor', p_key)
    when p_key in ('tables.remove_item', 'workshop.remove_line', 'workshop.invoice') then p_role = 'supervisor' or p_key = any(role_offered_keys(p_role))
    when p_role in ('cashier','storekeeper','accountant','director','secretary','waiter','kitchen','technician','delivery','reception')
         and p_key = any(perm_catalog()) then p_key = any(role_default_keys(p_role))
    else perm_default_base(p_role, p_key) end;
$$;

create or replace function public.wo_invoice(p_wo uuid)
 returns void language plpgsql security definer set search_path to 'public' as $$
declare w work_orders%rowtype;
begin
  select * into w from work_orders where id = p_wo;
  if not found or not can_work_shop(w.branch_id) then raise exception 'Sin permiso'; end if;
  if not has_perm('workshop.invoice', w.branch_id) then raise exception 'PERM_DENIED'; end if;
  update orders set status = 'confirmed' where id = w.order_id and status = 'draft';
  if not found then raise exception 'La orden ya fue facturada'; end if;
  if w.status not in ('done','delivered') then
    update work_orders set status = 'done', updated_at = now() where id = w.id;
  end if;
end $$;

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
    'tables.remove_item', 'workshop.remove_line', 'workshop.invoice'];
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
    when 'technician' then array['customers.create','customers.edit','customers.view_docs','customers.upload_docs','products.see_code','workshop.remove_line','workshop.invoice']
    when 'delivery' then array['products.see_code']
    when 'reception' then array['customers.create','customers.edit','customers.view_docs','customers.upload_docs','products.see_code','sales.cancel_request','store.orders','cash.expense','cash.withdraw','cash.deposit','cash.change_fund','payments.reverse','workshop.remove_line','workshop.invoice']
    else '{}'::text[] end;
$$;
