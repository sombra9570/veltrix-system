-- =====================================================================
-- Veltrix · Saldos de cuotas guardados (no se recalculan en cada pantalla)
--   installment_totals guarda lo pagado y la fecha del último pago de cada cuota;
--   se actualiza solo con cada abono. Las tarjetas del cobrador viajan compactas.
-- =====================================================================
create table if not exists installment_totals (
  installment_id uuid primary key references installments(id) on delete cascade,
  paid           numeric(14,2) not null default 0,
  last_at        timestamptz
);
alter table installment_totals enable row level security;

insert into installment_totals (installment_id, paid, last_at)
select a.installment_id, sum(a.amount), max(p.collected_at) filter (where a.amount > 0)
  from payment_allocations a join payments p on p.id = a.payment_id
 group by a.installment_id
on conflict (installment_id) do update set paid = excluded.paid, last_at = excluded.last_at;

create or replace function track_allocation() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_at timestamptz;
begin
  if tg_op = 'INSERT' then
    if new.amount > 0 then select collected_at into v_at from payments where id = new.payment_id; end if;
    insert into installment_totals (installment_id, paid, last_at) values (new.installment_id, new.amount, v_at)
    on conflict (installment_id) do update
      set paid = installment_totals.paid + excluded.paid,
          last_at = greatest(installment_totals.last_at, excluded.last_at);
  elsif tg_op = 'DELETE' then
    update installment_totals set paid = paid - old.amount where installment_id = old.installment_id;
  end if;
  return null;
end $$;
revoke execute on function track_allocation() from public, anon, authenticated;
drop trigger if exists payment_allocations_totals on payment_allocations;
create trigger payment_allocations_totals after insert or delete on payment_allocations
  for each row execute function track_allocation();

-- Lo pagado de una cuota: lectura directa
create or replace function installment_paid(p_installment uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce((select paid from installment_totals where installment_id = p_installment), 0);
$$;

-- Tarjetas compactas: [número, vencimiento, monto, pagado, último pago]
create or replace function customer_credit_cards(p_customer uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by x->>'created'), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', o.id, 'created', o.created_at, 'total', o.total_amount,
      'every_days', (select i2.due_date - i1.due_date from installments i1 join installments i2
                       on i2.order_id = i1.order_id and i2.number = i1.number + 1
                      where i1.order_id = o.id order by i1.number limit 1),
      'i', (select jsonb_agg(jsonb_build_array(i.number, i.due_date, i.amount, coalesce(t.paid, 0), t.last_at) order by i.number)
              from installments i left join installment_totals t on t.installment_id = i.id where i.order_id = o.id)
    ) as x
      from orders o
     where o.customer_id = p_customer and o.status = 'confirmed' and o.deleted_at is null
       and o.approval_status in ('auto_approved', 'approved')
       and exists (select 1 from installments i left join installment_totals t on t.installment_id = i.id
                    where i.order_id = o.id and i.amount - coalesce(t.paid, 0) > 0)
  ) t;
$$;

create or replace function customer_rating(p_customer uuid) returns text
language sql stable security definer set search_path = public as $$
  with i as (
    select i.due_date, i.amount, coalesce(t.paid, 0) as paid, t.last_at::date as last_pay, branch_today(o.branch_id) as today
      from installments i join orders o on o.id = i.order_id left join installment_totals t on t.installment_id = i.id
     where o.customer_id = p_customer and o.status = 'confirmed' and o.payment_condition = 'credit'
       and o.approval_status in ('auto_approved', 'approved')
  ), s as (
    select count(*) filter (where due_date < today) as due_n,
           count(*) filter (where due_date < today and paid >= amount and last_pay <= due_date) as on_time,
           coalesce(max(today - due_date) filter (where due_date < today and paid < amount), 0) as late_days
      from i
  )
  select case when due_n = 0 then 'new'
              when late_days = 0 and on_time::numeric / due_n >= 0.8 then 'green'
              when late_days <= 3 and on_time::numeric / due_n >= 0.5 then 'yellow'
              when late_days <= 15 then 'orange'
              else 'red' end
    from s;
$$;
