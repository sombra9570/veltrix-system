-- Cada cuánto se paga un crédito: préstamo (loans.every_days) o, si no, la separación entre sus dos primeras cuotas.
create or replace function public.order_every_days(p_order uuid)
returns integer language sql stable security definer set search_path to 'public' as $$
  select coalesce(
    (select l.every_days from loans l where l.order_id = p_order limit 1),
    (select i2.due_date - i1.due_date from installments i1 join installments i2
        on i2.order_id = i1.order_id and i2.number = i1.number + 1
      where i1.order_id = p_order order by i1.number limit 1));
$$;

-- Cobrado y prestado desde el último cierre, separados en diario (cada 1 a 3 días) y semanal (el resto).
create or replace function public.route_freq_split(p_route uuid, p_collector uuid)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  with col as (
    select case when coalesce(order_every_days(i.order_id), 7) <= 3 then 'daily' else 'weekly' end f, sum(pa.amount) a
      from payments p
      join payment_allocations pa on pa.payment_id = p.id
      join installments i on i.id = pa.installment_id
     where p.route_id = p_route and p.collected_by = p_collector and p.settlement_id is null
     group by 1),
  lent as (
    select case when coalesce(l.every_days, 7) <= 3 then 'daily' else 'weekly' end f, sum(cm.amount) a
      from loans l join cash_movements cm on cm.id = l.movement_id
     where l.route_id = p_route and l.collector_id = p_collector and l.cancelled_at is null
       and cm.settlement_id is null and cm.created_by = p_collector
     group by 1)
  select jsonb_build_object(
    'daily',  jsonb_build_object('collected', coalesce((select a from col where f = 'daily'), 0),  'lent', coalesce((select a from lent where f = 'daily'), 0)),
    'weekly', jsonb_build_object('collected', coalesce((select a from col where f = 'weekly'), 0), 'lent', coalesce((select a from lent where f = 'weekly'), 0)));
$$;
revoke all on function public.route_freq_split(uuid, uuid) from public, anon, authenticated;
revoke all on function public.order_every_days(uuid) from public, anon, authenticated;

create or replace function public.collector_info()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_object_agg(r.id::text, route_freq_split(r.id, auth.uid())), '{}'::jsonb)
    from collection_routes r
   where r.collector_id = auth.uid() and r.is_active and r.deleted_at is null;
$$;
revoke all on function public.collector_info() from public, anon;
grant execute on function public.collector_info() to authenticated;
