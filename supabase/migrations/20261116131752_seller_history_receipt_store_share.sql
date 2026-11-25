-- Historial propio de ventas (vendedor/cajero/etc. que venden), con rango de fechas en la hora local de la sucursal
create or replace function public.my_sales(p_branch uuid, p_from date, p_to date, p_search text default null)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare
  tz text; t0 timestamptz; t1 timestamptz; q text := nullif(lower(trim(coalesce(p_search, ''))), '');
  rows jsonb; s jsonb;
begin
  if not can_sell(p_branch) then raise exception 'Sin permiso'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then raise exception 'Rango de fechas no válido'; end if;
  select timezone into tz from branches where id = p_branch;
  t0 := p_from::timestamp at time zone tz;
  t1 := (p_to + 1)::timestamp at time zone tz;
  select coalesce(jsonb_agg(x order by (x->>'at') desc), '[]'::jsonb) into rows from (
    select jsonb_build_object(
      'id', o.id, 'at', coalesce(o.confirmed_at, o.created_at), 'status', o.status, 'total', o.total_amount, 'currency', o.currency,
      'items', (select count(*) from order_items i where i.order_id = o.id),
      'condition', o.payment_condition,
      'customer', (select case when c.is_walk_in then null else c.name end from customers c where c.id = o.customer_id),
      'paid', o.total_amount - coalesce((select sum(installment_paid(i.id)) from installments i where i.order_id = o.id), 0) <= 0) as x
    from orders o
    where o.vendor_id = auth.uid() and o.branch_id = p_branch and o.deleted_at is null
      and o.status in ('confirmed', 'cancelled')
      and coalesce(o.confirmed_at, o.created_at) >= t0 and coalesce(o.confirmed_at, o.created_at) < t1
      and (q is null or lower(o.id::text) like q || '%'
           or exists (select 1 from customers c where c.id = o.customer_id and lower(c.name) like '%' || q || '%'))
    order by coalesce(o.confirmed_at, o.created_at) desc limit 300) t;
  select jsonb_build_object(
    'count', count(*) filter (where o.status = 'confirmed'),
    'total', coalesce(sum(o.total_amount) filter (where o.status = 'confirmed'), 0),
    'cancelled', count(*) filter (where o.status = 'cancelled'),
    'cancelled_total', coalesce(sum(o.total_amount) filter (where o.status = 'cancelled'), 0)) into s
  from orders o
  where o.vendor_id = auth.uid() and o.branch_id = p_branch and o.deleted_at is null
    and o.status in ('confirmed', 'cancelled')
    and coalesce(o.confirmed_at, o.created_at) >= t0 and coalesce(o.confirmed_at, o.created_at) < t1;
  return jsonb_build_object('summary', s, 'sales', rows);
end $$;

-- Datos del comprobante: lo puede pedir quien hizo la venta, caja/mesas de la sucursal o quien gestiona/lee la sucursal
create or replace function public.receipt_data(p_order uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare o orders%rowtype;
begin
  select * into o from orders where id = p_order and deleted_at is null;
  if not found or not (o.vendor_id = auth.uid() or branch_reader(o.branch_id) or has_branch_role(o.branch_id, '{cashier,waiter}')) then
    raise exception 'Sin permiso';
  end if;
  return jsonb_build_object(
    'id', o.id, 'at', coalesce(o.confirmed_at, o.created_at), 'status', o.status, 'condition', o.payment_condition,
    'currency', o.currency, 'total', o.total_amount, 'tip', o.tip_amount, 'notes', o.notes,
    'paid', _order_paid(o.id),
    'company', (select jsonb_build_object('name', c.legal_name, 'tax_id', c.tax_id) from companies c where c.id = o.company_id),
    'branch', (select jsonb_build_object('name', b.name, 'address', b.address, 'timezone', b.timezone) from branches b where b.id = o.branch_id),
    'customer', (select case when c.is_walk_in then null else c.name end from customers c where c.id = o.customer_id),
    'vendor', (select full_name from profiles where id = o.vendor_id),
    'items', (select coalesce(jsonb_agg(jsonb_build_object('description', i.description, 'qty', i.qty, 'price', i.unit_price, 'total', i.line_total) order by i.created_at), '[]'::jsonb) from order_items i where i.order_id = o.id),
    'installments', (select coalesce(jsonb_agg(jsonb_build_object('number', i.number, 'due', i.due_date, 'amount', i.amount) order by i.number), '[]'::jsonb) from installments i where i.order_id = o.id));
end $$;

-- Tienda virtual publicada de la empresa de la sucursal, para que quien vende comparta el catálogo
create or replace function public.store_share(p_branch uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not can_sell(p_branch) then raise exception 'Sin permiso'; end if;
  return (select jsonb_build_object('slug', s.slug, 'name', s.name, 'description', s.description, 'whatsapp', s.whatsapp)
          from stores s join branches b on b.company_id = s.company_id
          where b.id = p_branch and s.is_published order by s.created_at limit 1);
end $$;

revoke all on function public.my_sales(uuid, date, date, text) from public, anon;
revoke all on function public.receipt_data(uuid) from public, anon;
revoke all on function public.store_share(uuid) from public, anon;
grant execute on function public.my_sales(uuid, date, date, text) to authenticated;
grant execute on function public.receipt_data(uuid) to authenticated;
grant execute on function public.store_share(uuid) to authenticated;
