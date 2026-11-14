-- =====================================================================
-- Veltrix · Tarjetas de cobro para el cobrador
--   Cada crédito abierto del cliente llega con sus cuotas (número, vencimiento, monto, pagado,
--   fecha del último pago) y la frecuencia (cada cuántos días). También la última anotación de visita.
-- =====================================================================
create or replace function customer_credit_cards(p_customer uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by x->>'created'), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', o.id, 'created', o.created_at, 'total', o.total_amount,
      'every_days', (select i2.due_date - i1.due_date from installments i1 join installments i2
                       on i2.order_id = i1.order_id and i2.number = i1.number + 1
                      where i1.order_id = o.id order by i1.number limit 1),
      'installments', (select jsonb_agg(jsonb_build_object(
                          'id', i.id, 'n', i.number, 'due', i.due_date, 'amount', i.amount,
                          'paid', installment_paid(i.id),
                          'last_at', (select max(p.collected_at) from payment_allocations a join payments p on p.id = a.payment_id
                                       where a.installment_id = i.id and a.amount > 0))
                        order by i.number)
                         from installments i where i.order_id = o.id)
    ) as x
      from orders o
     where o.customer_id = p_customer and o.status = 'confirmed' and o.deleted_at is null
       and o.approval_status in ('auto_approved', 'approved')
       and exists (select 1 from installments i where i.order_id = o.id and i.amount - installment_paid(i.id) > 0)
  ) t;
$$;
revoke execute on function customer_credit_cards(uuid) from public, anon, authenticated;

do $$
declare d text;
begin
  d := pg_get_functiondef('collector_day()'::regprocedure);
  if position('customer_credit_cards' in d) = 0 then
    d := replace(d, '''lat'', c.gps_lat, ''lng'', c.gps_lng,',
      '''lat'', c.gps_lat, ''lng'', c.gps_lng,
              ''credits'', customer_credit_cards(c.id),
              ''last_visit'', (select jsonb_build_object(''at'', v.visited_at, ''result'', v.result, ''notes'', v.notes,
                                 ''promise_date'', v.promise_date, ''promise_amount'', v.promise_amount)
                                 from visits v where v.customer_id = c.id order by v.visited_at desc limit 1),');
    if position('customer_credit_cards' in d) = 0 then raise exception 'collector_day: no se pudo aplicar'; end if;
    execute d;
  end if;
end $$;
