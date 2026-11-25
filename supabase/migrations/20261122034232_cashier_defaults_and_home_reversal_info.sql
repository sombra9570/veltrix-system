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
              -- Cajero: caja, cobros, anulaciones, documentos de clientes y pedidos de tienda
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
$function$;

do $mig$
declare d text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'cashier_home';
  if position($a$'id', s.id,
      'opened_at', s.opened_at,$a$ in d) = 0 then raise exception 'fragmento 1 no encontrado'; end if;
  if position($a$'method', p.method, 'amount', p.amount)$a$ in d) = 0 then raise exception 'fragmento 2 no encontrado'; end if;
  d := replace(d, $a$'id', s.id,
      'opened_at', s.opened_at,$a$, $b$'id', s.id, 'can_reverse', has_perm('payments.reverse', s.branch_id),
      'opened_at', s.opened_at,$b$);
  d := replace(d, $a$'method', p.method, 'amount', p.amount)$a$,
    $b$'method', p.method, 'amount', p.amount, 'is_reversal', p.reverses_payment_id is not null,
                 'reversal', (select r.status::text from payment_reversals r where r.payment_id = p.id and r.status in ('pending', 'approved') limit 1))$b$);
  execute d;
end
$mig$;
