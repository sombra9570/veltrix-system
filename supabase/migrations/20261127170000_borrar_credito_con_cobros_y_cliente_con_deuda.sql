-- Crédito con cobros y cliente con deuda se pueden borrar antes de la liquidación.
-- collector_delete_credit reversa las cuotas pagadas (collector_delete_installment) y
-- collector_delete_customer anula cada crédito vigente (collector_delete_credit).
do $$
declare src text; src2 text;
begin
  select pg_get_functiondef(p.oid) into src from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'collector_delete_credit';
  src2 := replace(src, 'declare l loans%rowtype; o orders%rowtype; r collection_routes%rowtype;', 'declare l loans%rowtype; o orders%rowtype; r collection_routes%rowtype; v_n integer;');
  src2 := replace(src2, E'  if exists (select 1 from installments i where i.order_id = p_order and installment_paid(i.id) <> 0) then\n    raise exception ''El pedido tiene cobros: primero hay que reversarlos'';\n  end if;\n',
    E'  loop\n    select min(i.number) into v_n from installments i where i.order_id = p_order and installment_paid(i.id) > 0;\n    exit when v_n is null;\n    perform collector_delete_installment(p_order, v_n);\n  end loop;\n');
  if src2 = src or src2 not like '%v_n integer%' or src2 like '%tiene cobros%' then raise exception 'collector_delete_credit no se pudo modificar'; end if;
  execute src2;

  select pg_get_functiondef(p.oid) into src from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'collector_delete_customer';
  src2 := replace(src, 'declare c customers%rowtype; r collection_routes%rowtype;', 'declare c customers%rowtype; r collection_routes%rowtype; v_o uuid;');
  src2 := replace(src2, E'  if customer_open_balance(c.id) > 0.004 then raise exception ''CUSTOMER_HAS_DEBT''; end if;\n',
    E'  for v_o in select l.order_id from loans l where l.customer_id = c.id and l.cancelled_at is null loop\n    perform collector_delete_credit(v_o);\n  end loop;\n');
  if src2 = src or src2 not like '%v_o uuid%' or src2 like '%CUSTOMER_HAS_DEBT%' then raise exception 'collector_delete_customer no se pudo modificar'; end if;
  execute src2;
end $$;
