alter table products add column if not exists min_stock numeric(14,3) not null default 0 check (min_stock >= 0);

create or replace function can_stock(p_branch uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_branch_manager(p_branch) or has_branch_role(p_branch, '{storekeeper}');
$$;

create or replace function org_has_module(p_org uuid, p_module text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from org_modules where org_id = p_org and module = p_module and enabled);
$$;

create or replace function inv_overview(p_branch uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare b branches%rowtype; v_wh uuid; v_cur char(3);
begin
  select * into b from branches where id = p_branch and deleted_at is null;
  if not found or not can_stock(b.id) then raise exception 'Sin permiso'; end if;
  select base_currency into v_cur from companies where id = b.company_id;
  v_wh := default_warehouse(b.id);

  return (
    with items as (
      select p.id, p.name, p.sku, p.unit, p.product_type, p.cost, p.unit_price, p.min_stock,
             coalesce((select s.qty from stock_levels s where s.warehouse_id = v_wh and s.product_id = p.id), 0) as qty
        from products p
       where p.company_id = b.company_id and p.deleted_at is null and p.is_active and p.track_stock
         and p.product_type in ('good', 'ingredient')
    )
    select jsonb_build_object(
      'currency', v_cur,
      'purchasing', org_has_module(b.org_id, 'purchasing'),
      'summary', jsonb_build_object(
        'products', (select count(*) from items),
        'value', (select coalesce(round(sum(greatest(qty, 0) * cost), 2), 0) from items),
        'retail_value', (select coalesce(round(sum(greatest(qty, 0) * unit_price), 2), 0) from items),
        'low', (select count(*) from items where qty > 0 and qty <= min_stock),
        'out', (select count(*) from items where qty <= 0)),
      'items', (select coalesce(jsonb_agg(jsonb_build_object(
                  'id', id, 'name', name, 'sku', sku, 'unit', unit, 'type', product_type, 'qty', qty,
                  'min', min_stock, 'cost', cost, 'price', unit_price,
                  'value', round(greatest(qty, 0) * cost, 2))
                  order by (qty <= min_stock) desc, name), '[]'::jsonb) from items),
      'untracked', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name) order by p.name), '[]'::jsonb)
                      from products p
                     where p.company_id = b.company_id and p.deleted_at is null and p.is_active
                       and not p.track_stock and p.product_type in ('good', 'ingredient')),
      'suppliers', (select coalesce(jsonb_agg(jsonb_build_object(
                      'id', s.id, 'name', s.name, 'phone', s.phone, 'email', s.email, 'tax_id', s.tax_id,
                      'terms', s.payment_terms_days) order by s.name), '[]'::jsonb)
                      from suppliers s where s.company_id = b.company_id and s.deleted_at is null)
    )
  );
end $$;

create or replace function inv_set_min(p_product uuid, p_min numeric) returns void
language plpgsql security definer set search_path = public as $$
declare v_company uuid;
begin
  select company_id into v_company from products where id = p_product and deleted_at is null;
  if v_company is null or not can_manage_catalog(v_company) then raise exception 'Sin permiso'; end if;
  if p_min is null or p_min < 0 then raise exception 'Cantidad inválida'; end if;
  update products set min_stock = p_min, updated_at = now() where id = p_product;
end $$;

create or replace function inv_adjust(p_branch uuid, p_product uuid, p_counted numeric, p_note text)
returns numeric
language plpgsql security definer set search_path = public as $$
declare b branches%rowtype;
begin
  select * into b from branches where id = p_branch and deleted_at is null;
  if not found or not can_stock(b.id) then raise exception 'Sin permiso'; end if;
  if not org_writable(b.org_id) then raise exception 'Cuenta suspendida: solo lectura'; end if;
  if p_counted is null or p_counted < 0 then raise exception 'Cantidad inválida'; end if;
  if not exists (select 1 from products where id = p_product and company_id = b.company_id and track_stock) then
    raise exception 'Este producto no controla stock';
  end if;
  return adjust_stock(ensure_default_warehouse(b.id), p_product, p_counted, left(trim(coalesce(p_note, '')), 200));
end $$;

create or replace function inv_receive(p_branch uuid, p_supplier uuid, p_items jsonb,
                                       p_doc_ref text default null, p_due_days int default null)
returns numeric
language plpgsql security definer set search_path = public as $$
declare b branches%rowtype; v_wh uuid; v_cur char(3); it jsonb; v_pid uuid; v_qty numeric; v_cost numeric;
        v_total numeric := 0; v_purchase uuid; v_onhand numeric; v_old numeric; v_ref uuid := gen_random_uuid();
begin
  select * into b from branches where id = p_branch and deleted_at is null;
  if not found or not can_stock(b.id) then raise exception 'Sin permiso'; end if;
  if not org_writable(b.org_id) then raise exception 'Cuenta suspendida: solo lectura'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Agregue productos';
  end if;
  if jsonb_array_length(p_items) > 200 then raise exception 'Demasiados ítems'; end if;
  select base_currency into v_cur from companies where id = b.company_id;
  v_wh := ensure_default_warehouse(b.id);

  for it in select * from jsonb_array_elements(p_items) loop
    v_pid := (it->>'product_id')::uuid; v_qty := (it->>'qty')::numeric; v_cost := coalesce((it->>'cost')::numeric, 0);
    if v_qty is null or v_qty <= 0 or v_cost < 0 then raise exception 'Cantidad o costo inválido'; end if;
    if not exists (select 1 from products where id = v_pid and company_id = b.company_id and deleted_at is null
                     and product_type in ('good', 'ingredient')) then
      raise exception 'Producto inválido';
    end if;
  end loop;

  if p_supplier is not null then
    if not org_has_module(b.org_id, 'purchasing') then raise exception 'MODULE_PURCHASING'; end if;
    if not exists (select 1 from suppliers where id = p_supplier and company_id = b.company_id and deleted_at is null) then
      raise exception 'Proveedor inválido';
    end if;
    insert into purchases (org_id, company_id, branch_id, supplier_id, warehouse_id, currency, supplier_doc_ref,
                           due_date, created_by)
    values (b.org_id, b.company_id, b.id, p_supplier, v_wh, v_cur, nullif(trim(coalesce(p_doc_ref, '')), ''),
            case when p_due_days is not null then current_date + greatest(p_due_days, 0) end, auth.uid())
    returning id into v_purchase;
    insert into purchase_items (org_id, purchase_id, product_id, qty, unit_cost)
    select b.org_id, v_purchase, (x->>'product_id')::uuid, (x->>'qty')::numeric, coalesce((x->>'cost')::numeric, 0)
      from jsonb_array_elements(p_items) x;
    perform receive_purchase(v_purchase);
    select total_amount into v_total from purchases where id = v_purchase;
    return v_total;
  end if;

  for it in select * from jsonb_array_elements(p_items) loop
    v_pid := (it->>'product_id')::uuid; v_qty := (it->>'qty')::numeric; v_cost := coalesce((it->>'cost')::numeric, 0);
    select coalesce(sum(sl.qty), 0) into v_onhand
      from stock_levels sl join warehouses w on w.id = sl.warehouse_id
     where sl.product_id = v_pid and w.company_id = b.company_id and sl.qty > 0;
    select cost into v_old from products where id = v_pid;
    update products
       set cost = case when v_cost > 0 then round((v_onhand * v_old + v_qty * v_cost) / (v_onhand + v_qty), 4) else cost end,
           track_stock = true, updated_at = now()
     where id = v_pid;
    perform post_stock(b.id, v_wh, v_pid, v_qty, 'purchase', v_cost, 'manual_entry', v_ref,
                       nullif(left(trim(coalesce(p_doc_ref, '')), 120), ''));
    v_total := v_total + round(v_qty * v_cost, 2);
  end loop;
  return v_total;
end $$;

create or replace function inv_movements(p_branch uuid, p_product uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not can_stock(p_branch) then raise exception 'Sin permiso'; end if;
  return (select coalesce(jsonb_agg(x order by x->>'at' desc), '[]'::jsonb) from (
    select jsonb_build_object('at', m.created_at, 'product', p.name, 'unit', p.unit, 'type', m.movement_type,
             'qty', m.qty, 'cost', m.unit_cost, 'by', pr.full_name, 'note', m.note) as x
      from stock_movements m
      join products p on p.id = m.product_id
      left join profiles pr on pr.id = m.created_by
     where m.branch_id = p_branch and (p_product is null or m.product_id = p_product)
     order by m.created_at desc limit 200) t);
end $$;

create or replace function inv_purchases(p_branch uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not can_stock(p_branch) then raise exception 'Sin permiso'; end if;
  return (select coalesce(jsonb_agg(x order by x->>'at' desc), '[]'::jsonb) from (
    select jsonb_build_object('id', pu.id, 'at', coalesce(pu.received_at, pu.created_at), 'supplier', s.name,
             'total', pu.total_amount, 'doc', pu.supplier_doc_ref, 'due', pu.due_date, 'status', pu.status,
             'items', (select count(*) from purchase_items i where i.purchase_id = pu.id),
             'paid', coalesce((select sum(amount) from supplier_payments sp where sp.purchase_id = pu.id), 0)) as x
      from purchases pu join suppliers s on s.id = pu.supplier_id
     where pu.branch_id = p_branch
     order by pu.created_at desc limit 50) t);
end $$;

create or replace function save_supplier(p_id uuid, p_company uuid, p_name text, p_phone text default null,
                                         p_email text default null, p_tax_id text default null, p_terms int default 0)
returns uuid
language plpgsql security definer set search_path = public as $$
declare c companies%rowtype; v_id uuid; v_name text := trim(coalesce(p_name, ''));
begin
  select * into c from companies where id = p_company and deleted_at is null;
  if not found or not can_manage_catalog(c.id) then raise exception 'Sin permiso'; end if;
  if not org_writable(c.org_id) then raise exception 'Cuenta suspendida: solo lectura'; end if;
  if v_name = '' or length(v_name) > 120 then raise exception 'Indique el nombre'; end if;
  if coalesce(p_terms, 0) not between 0 and 365 then raise exception 'Plazo inválido'; end if;
  if p_id is null then
    insert into suppliers (org_id, company_id, name, phone, email, tax_id, payment_terms_days)
    values (c.org_id, c.id, v_name, nullif(trim(coalesce(p_phone, '')), ''), nullif(trim(coalesce(p_email, '')), ''),
            nullif(trim(coalesce(p_tax_id, '')), ''), coalesce(p_terms, 0))
    returning id into v_id;
  else
    update suppliers set name = v_name, phone = nullif(trim(coalesce(p_phone, '')), ''),
           email = nullif(trim(coalesce(p_email, '')), ''), tax_id = nullif(trim(coalesce(p_tax_id, '')), ''),
           payment_terms_days = coalesce(p_terms, 0), updated_at = now()
     where id = p_id and company_id = c.id and deleted_at is null returning id into v_id;
    if v_id is null then raise exception 'Proveedor inexistente'; end if;
  end if;
  return v_id;
end $$;

create or replace function report_summary(p_company uuid, p_branch uuid, p_from date, p_to date)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare c companies%rowtype; v_tz text; v_from timestamptz; v_to timestamptz; v_branches uuid[];
begin
  select * into c from companies where id = p_company and deleted_at is null;
  if not found then raise exception 'Sin permiso'; end if;
  if p_branch is null then
    if not has_company_role(c.id, '{supervisor}') then raise exception 'Sin permiso'; end if;
    select array_agg(id) into v_branches from branches where company_id = c.id and deleted_at is null;
    select timezone into v_tz from branches where company_id = c.id and deleted_at is null order by code limit 1;
  else
    if not exists (select 1 from branches where id = p_branch and company_id = c.id) or not is_branch_manager(p_branch) then
      raise exception 'Sin permiso';
    end if;
    v_branches := array[p_branch];
    select timezone into v_tz from branches where id = p_branch;
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then raise exception 'Rango de fechas inválido'; end if;
  v_tz := coalesce(v_tz, 'UTC');
  v_from := p_from::timestamp at time zone v_tz;
  v_to := (p_to + 1)::timestamp at time zone v_tz;
  v_branches := coalesce(v_branches, '{}');

  return (
    with ord as (
      select o.id, o.total_amount, o.confirmed_at, o.vendor_id, o.payment_condition
        from orders o
       where o.branch_id = any(v_branches) and o.status = 'confirmed' and o.deleted_at is null
         and o.approval_status is distinct from 'rejected'
         and o.confirmed_at >= v_from and o.confirmed_at < v_to
    ),
    pay as (
      select p.amount, p.method, p.collected_at from payments p
       where p.branch_id = any(v_branches) and p.collected_at >= v_from and p.collected_at < v_to
    ),
    cogs as (
      select coalesce(sum(-m.qty * m.unit_cost), 0) as v from stock_movements m
       where m.branch_id = any(v_branches) and m.created_at >= v_from and m.created_at < v_to
         and m.movement_type in ('sale', 'sale_return', 'recipe_consumption', 'work_order')
    ),
    exp as (
      select coalesce(sum(amount), 0) as v from cash_movements cm
       where cm.branch_id = any(v_branches) and cm.type = 'expense'
         and cm.created_at >= v_from and cm.created_at < v_to
    ),
    days as (select generate_series(p_from, p_to, interval '1 day')::date as d)
    select jsonb_build_object(
      'currency', c.base_currency,
      'totals', jsonb_build_object(
        'sales', (select coalesce(sum(total_amount), 0) from ord),
        'count', (select count(*) from ord),
        'avg_ticket', (select coalesce(round(avg(total_amount), 2), 0) from ord),
        'credit_sales', (select coalesce(sum(total_amount), 0) from ord where payment_condition = 'credit'),
        'collected', (select coalesce(sum(amount), 0) from pay),
        'cogs', (select round(v, 2) from cogs),
        'expenses', (select v from exp),
        'gross_profit', (select coalesce(sum(total_amount), 0) from ord) - (select round(v, 2) from cogs),
        'net_estimate', (select coalesce(sum(total_amount), 0) from ord) - (select round(v, 2) from cogs) - (select v from exp)),
      'daily', (select coalesce(jsonb_agg(jsonb_build_object(
                  'day', d,
                  'sales', (select coalesce(sum(total_amount), 0) from ord where (confirmed_at at time zone v_tz)::date = d),
                  'collected', (select coalesce(sum(amount), 0) from pay where (collected_at at time zone v_tz)::date = d))
                  order by d), '[]'::jsonb) from days),
      'by_hour', (select coalesce(jsonb_agg(jsonb_build_object('hour', h, 'sales', s, 'count', n) order by h), '[]'::jsonb)
                    from (select extract(hour from confirmed_at at time zone v_tz)::int as h,
                                 sum(total_amount) as s, count(*) as n from ord group by 1) x),
      'methods', (select coalesce(jsonb_agg(jsonb_build_object('method', method, 'amount', a) order by a desc), '[]'::jsonb)
                    from (select method, sum(amount) as a from pay group by method) x),
      'top_products', (select coalesce(jsonb_agg(x order by (x->>'total')::numeric desc), '[]'::jsonb) from (
                    select jsonb_build_object('name', min(oi.description), 'qty', sum(oi.qty), 'total', sum(oi.line_total)) as x
                      from order_items oi join ord on ord.id = oi.order_id
                     group by coalesce(oi.product_id::text, oi.description)
                     order by sum(oi.line_total) desc limit 10) t),
      'vendors', (select coalesce(jsonb_agg(jsonb_build_object('name', coalesce(pr.full_name, '—'), 'count', n, 'total', s)
                    order by s desc), '[]'::jsonb)
                    from (select vendor_id, count(*) as n, sum(total_amount) as s from ord group by vendor_id) x
                    left join profiles pr on pr.id = x.vendor_id),
      'credit', (
        select jsonb_build_object(
          'portfolio', coalesce(sum(greatest(i.amount - installment_paid(i.id), 0)), 0),
          'overdue', coalesce(sum(greatest(i.amount - installment_paid(i.id), 0)) filter (where i.due_date < current_date), 0),
          'customers_overdue', count(distinct o.customer_id) filter (
              where i.due_date < current_date and i.amount - installment_paid(i.id) > 0))
          from installments i join orders o on o.id = i.order_id
         where o.branch_id = any(v_branches) and o.status = 'confirmed' and o.payment_condition = 'credit'
           and o.approval_status is distinct from 'rejected' and o.deleted_at is null),
      'branches', (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name,
                      'sales', (select coalesce(sum(o.total_amount), 0) from orders o
                                 where o.branch_id = b.id and o.status = 'confirmed' and o.deleted_at is null
                                   and o.approval_status is distinct from 'rejected'
                                   and o.confirmed_at >= v_from and o.confirmed_at < v_to))
                      order by b.code), '[]'::jsonb)
                     from branches b where b.id = any(v_branches))
    )
  );
end $$;

create or replace function manager_branches() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', b.id, 'name', b.name, 'company_id', c.id, 'company', c.legal_name, 'currency', c.base_currency,
           'company_wide', has_company_role(c.id, '{supervisor}'))
         order by c.legal_name, b.code), '[]'::jsonb)
    from branches b join companies c on c.id = b.company_id
   where b.deleted_at is null and b.is_active and c.deleted_at is null and can_stock(b.id);
$$;

revoke execute on function can_stock(uuid), org_has_module(uuid, text) from public, anon;
revoke execute on function inv_overview(uuid), inv_set_min(uuid, numeric), inv_adjust(uuid, uuid, numeric, text),
  inv_receive(uuid, uuid, jsonb, text, int), inv_movements(uuid, uuid), inv_purchases(uuid),
  save_supplier(uuid, uuid, text, text, text, text, int), report_summary(uuid, uuid, date, date),
  manager_branches() from public, anon;
grant execute on function can_stock(uuid), inv_overview(uuid), inv_set_min(uuid, numeric),
  inv_adjust(uuid, uuid, numeric, text), inv_receive(uuid, uuid, jsonb, text, int), inv_movements(uuid, uuid),
  inv_purchases(uuid), save_supplier(uuid, uuid, text, text, text, text, int),
  report_summary(uuid, uuid, date, date), manager_branches() to authenticated;
grant execute on function can_stock(uuid), org_has_module(uuid, text), inv_overview(uuid), inv_set_min(uuid, numeric),
  inv_adjust(uuid, uuid, numeric, text), inv_receive(uuid, uuid, jsonb, text, int), inv_movements(uuid, uuid),
  inv_purchases(uuid), save_supplier(uuid, uuid, text, text, text, text, int),
  report_summary(uuid, uuid, date, date), manager_branches() to service_role;
