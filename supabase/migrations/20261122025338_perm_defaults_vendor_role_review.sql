create or replace function public.perm_default(p_role text, p_key text)
returns boolean
language sql
immutable
set search_path to 'public'
as $function$
  select case when p_key = 'cash.see_expected' then false
              -- Vendedor: solo lo suyo (vender, clientes, solicitar anulación, pedidos de tienda)
              when p_role = 'vendor' and (p_key like 'cash.%' or p_key like 'collector.%' or p_key like 'loans.%' or p_key like 'inv.out_%'
                   or p_key in ('inv.see_cost', 'payments.reverse', 'sales.credit', 'reports.export')) then false
              when p_role = 'vendor' and p_key = 'store.orders' then true
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
$function$;
