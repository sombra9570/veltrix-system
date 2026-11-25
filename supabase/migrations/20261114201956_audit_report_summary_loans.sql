-- Auditoría 2026-11-14: report_summary contaba el capital de los préstamos como venta y
-- ganancia, e incluía préstamos pendientes de aprobación (no desembolsados).
-- Ahora: de un préstamo solo cuenta el interés (total - capital), los no desembolsados
-- no cuentan, y "Lo más vendido" no lista préstamos. Nada más cambia.
do $$
declare d text; n text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'report_summary';
  n := d;
  n := replace(n, 'select o.id, o.total_amount, o.confirmed_at, o.vendor_id, o.payment_condition',
                  'select o.id, (o.total_amount - coalesce(l.principal, 0)) as total_amount, o.confirmed_at, o.vendor_id, o.payment_condition, o.order_type');
  n := regexp_replace(n, 'from orders o\s+where o\.branch_id = any\(v_branches\) and o\.status = ''confirmed'' and o\.deleted_at is null',
                  'from orders o left join loans l on l.order_id = o.id
       where (l.order_id is null or l.disbursed_at is not null)
         and o.branch_id = any(v_branches) and o.status = ''confirmed'' and o.deleted_at is null');
  n := regexp_replace(n, '\(select coalesce\(sum\(o\.total_amount\), 0\) from orders o\s+where o\.branch_id = b\.id',
                  '(select coalesce(sum(o.total_amount - coalesce(l.principal, 0)), 0) from orders o left join loans l on l.order_id = o.id
                                 where (l.order_id is null or l.disbursed_at is not null) and o.branch_id = b.id');
  n := replace(n, 'from order_items oi join ord on ord.id = oi.order_id',
                  'from order_items oi join ord on ord.id = oi.order_id and ord.order_type <> ''loan''');
  n := regexp_replace(n, 'from installments i join orders o on o\.id = i\.order_id\s+where o\.branch_id = any\(v_branches\)',
                  'from installments i join orders o on o.id = i.order_id left join loans l on l.order_id = o.id
         where (l.order_id is null or l.disbursed_at is not null) and o.branch_id = any(v_branches)');
  if n = d or position('ord.order_type <> ''loan''' in n) = 0 or position('l.disbursed_at is not null) and o.branch_id = b.id' in n) = 0 then
    raise exception 'report_summary: el parche no se aplicó completo';
  end if;
  execute n;
end $$;
