-- Permisos del supervisor en cobranza a nivel de rol (panel Permisos del administrador): se agregan al catálogo
-- los permisos que solo existían por supervisor. Los de borrar siguen apagados por defecto.
do $$
declare src text; src2 text;
begin
  select pg_get_functiondef(p.oid) into src from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='perm_catalog';
  src2 := replace(src, '''ai.use'']', '''ai.use'',
    ''payments.record_installment'', ''payments.record_partial'', ''collector.delete_installments'', ''collector.delete_credits'', ''collector.delete_customers'', ''collector.delete_expenses'']');
  if src2 = src then raise exception 'perm_catalog no se pudo modificar'; end if;
  execute src2;

  select pg_get_functiondef(p.oid) into src from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='role_offered_keys_base';
  src2 := replace(src, '''routes.invest'',''routes.liquidate'',''routes.approve_loans'']
    when ''manager''',
    '''routes.invest'',''routes.liquidate'',''routes.approve_loans'',''loans.customers'',''payments.record_installment'',''payments.record_partial'',''collector.expenses'',''collector.pay_out'',''collector.delete_installments'',''collector.delete_credits'',''collector.delete_customers'',''collector.delete_expenses'']
    when ''manager''');
  if src2 = src then raise exception 'role_offered_keys_base no se pudo modificar'; end if;
  execute src2;
end $$;
