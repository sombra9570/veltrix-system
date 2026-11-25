alter table dining_tables add column if not exists qr_token text unique
  default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
update dining_tables set qr_token = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '') where qr_token is null;

create table if not exists table_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  branch_id uuid not null references branches(id),
  table_id uuid not null references dining_tables(id),
  items jsonb not null,
  notes text,
  customer_name text,
  pay_pref text not null default 'cash' check (pay_pref in ('qr','cash')),
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  pay_method text check (pay_method in ('qr','cash')),
  reject_reason text,
  order_id uuid references orders(id),
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists table_requests_branch_idx on table_requests (branch_id, status, created_at desc);
create index if not exists table_requests_table_idx on table_requests (table_id, created_at desc);
alter table table_requests enable row level security;
revoke all on table_requests from anon, authenticated;

create or replace function public_table_menu(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t dining_tables%rowtype; s stores%rowtype; v_wh uuid; v_cur char(3);
begin
  select * into t from dining_tables where qr_token = p_token and is_active;
  if not found or not org_writable(t.org_id) then return null; end if;
  select * into s from stores where branch_id = t.branch_id and is_published limit 1;
  if not found then return null; end if;
  v_wh := default_warehouse(t.branch_id);
  select base_currency into v_cur from companies where id = t.company_id;
  return jsonb_build_object(
    'table', t.name, 'name', s.name, 'logo', s.logo_path, 'currency', v_cur,
    'products', (select coalesce(jsonb_agg(jsonb_build_object(
                   'id', p.id, 'name', p.name, 'price', p.unit_price, 'type', p.product_type,
                   'description', p.store_description, 'photo', p.photo_path, 'unit', p.unit,
                   'available', not p.track_stock
                                or coalesce((select qty from stock_levels where warehouse_id = v_wh and product_id = p.id), 0) > 0)
                 order by p.name), '[]'::jsonb)
                   from products p
                  where p.company_id = t.company_id and p.in_store and p.is_active and p.is_sellable and p.deleted_at is null
                  limit 500));
end $$;

create or replace function public_table_order(p_token text, p_items jsonb, p_notes text, p_name text, p_pay text)
returns uuid language plpgsql security definer set search_path = public as $$
declare t dining_tables%rowtype; it jsonb; pr products%rowtype; v_qty numeric; v_clean jsonb := '[]'::jsonb;
        v_wh uuid; v_stock numeric; v_id uuid;
begin
  select * into t from dining_tables where qr_token = p_token and is_active;
  if not found or not org_writable(t.org_id) then raise exception 'TABLE_INVALID'; end if;
  if not exists (select 1 from stores where branch_id = t.branch_id and is_published) then raise exception 'TABLE_INVALID'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 30 then
    raise exception 'ITEMS_INVALID';
  end if;
  if (select count(*) from table_requests where table_id = t.id and status = 'pending') >= 3
     or (select count(*) from table_requests where table_id = t.id and created_at > now() - interval '10 minutes') >= 8 then
    raise exception 'TOO_MANY_REQUESTS';
  end if;
  v_wh := default_warehouse(t.branch_id);
  for it in select * from jsonb_array_elements(p_items) loop
    v_qty := (it->>'qty')::numeric;
    if v_qty is null or v_qty <= 0 or v_qty > 20 or v_qty <> trunc(v_qty) then raise exception 'ITEMS_INVALID'; end if;
    select * into pr from products
     where id = (it->>'product_id')::uuid and company_id = t.company_id and in_store and is_active and is_sellable and deleted_at is null;
    if not found then raise exception 'PRODUCT_UNAVAILABLE'; end if;
    if pr.track_stock then
      select coalesce(qty, 0) into v_stock from stock_levels where warehouse_id = v_wh and product_id = pr.id;
      if coalesce(v_stock, 0) < v_qty then raise exception 'PRODUCT_UNAVAILABLE'; end if;
    end if;
    v_clean := v_clean || jsonb_build_array(jsonb_build_object(
      'product_id', pr.id, 'qty', v_qty, 'notes', nullif(left(trim(coalesce(it->>'notes', '')), 200), '')));
  end loop;
  insert into table_requests (org_id, branch_id, table_id, items, notes, customer_name, pay_pref)
  values (t.org_id, t.branch_id, t.id, v_clean, nullif(left(trim(coalesce(p_notes, '')), 300), ''),
          nullif(left(trim(coalesce(p_name, '')), 40), ''), case when p_pay = 'qr' then 'qr' else 'cash' end)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public_table_status(p_token text, p_request uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r table_requests%rowtype; t dining_tables%rowtype; b branches%rowtype; v_total numeric;
begin
  select * into t from dining_tables where qr_token = p_token;
  if not found then return null; end if;
  select * into r from table_requests where id = p_request and table_id = t.id;
  if not found then return null; end if;
  select * into b from branches where id = r.branch_id;
  select coalesce(sum(pr.unit_price * (i->>'qty')::numeric), 0) into v_total
    from jsonb_array_elements(r.items) i join products pr on pr.id = (i->>'product_id')::uuid;
  return jsonb_build_object('status', r.status, 'pay_method', r.pay_method, 'reject_reason', r.reject_reason,
    'total', v_total, 'has_qr', b.pay_qr_path is not null, 'qr_note', b.pay_qr_note);
end $$;

create or replace function public_table_pay_qr(p_token text, p_request uuid) returns text
language sql stable security definer set search_path = public as $$
  select b.pay_qr_path from table_requests r
    join dining_tables t on t.id = r.table_id and t.qr_token = p_token
    join branches b on b.id = r.branch_id
   where r.id = p_request and r.status = 'accepted' and r.pay_method = 'qr';
$$;

create or replace function table_requests_list(p_branch uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not can_serve_tables(p_branch) then raise exception 'PERM_DENIED'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'table', t.name, 'at', r.created_at, 'notes', r.notes, 'customer', r.customer_name, 'pay_pref', r.pay_pref,
      'items', (select coalesce(jsonb_agg(jsonb_build_object('name', pr.name, 'qty', (i->>'qty')::numeric,
                         'price', pr.unit_price, 'notes', i->>'notes') order by pr.name), '[]'::jsonb)
                  from jsonb_array_elements(r.items) i join products pr on pr.id = (i->>'product_id')::uuid),
      'total', (select coalesce(sum(pr.unit_price * (i->>'qty')::numeric), 0)
                  from jsonb_array_elements(r.items) i join products pr on pr.id = (i->>'product_id')::uuid))
      order by r.created_at)
    from table_requests r join dining_tables t on t.id = r.table_id
   where r.branch_id = p_branch and r.status = 'pending'), '[]'::jsonb);
end $$;

create or replace function table_request_resolve(p_request uuid, p_accept boolean, p_pay text, p_reason text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare r table_requests%rowtype; v_order uuid;
begin
  select * into r from table_requests where id = p_request for update;
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
  if not can_serve_tables(r.branch_id) then raise exception 'PERM_DENIED'; end if;
  if r.status <> 'pending' then raise exception 'REQUEST_NOT_PENDING'; end if;
  if p_accept then
    v_order := open_table_order(r.table_id, null);
    perform add_table_items(v_order, r.items);
    if r.notes is not null or r.customer_name is not null then
      update orders set notes = concat_ws(' · ', nullif(notes, ''), 'QR' || coalesce(' ' || r.customer_name, ''), r.notes) where id = v_order;
    end if;
    update table_requests set status = 'accepted', order_id = v_order,
           pay_method = case when p_pay = 'qr' then 'qr' else 'cash' end, resolved_by = auth.uid(), resolved_at = now()
     where id = r.id;
    return v_order;
  end if;
  update table_requests set status = 'rejected', reject_reason = nullif(left(trim(coalesce(p_reason, '')), 200), ''),
         resolved_by = auth.uid(), resolved_at = now() where id = r.id;
  return null;
end $$;

create or replace function table_qr_info(p_branch uuid, p_regenerate uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not is_branch_manager(p_branch) then raise exception 'PERM_DENIED'; end if;
  if p_regenerate is not null then
    update dining_tables set qr_token = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
     where id = p_regenerate and branch_id = p_branch;
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'token', t.qr_token, 'active', t.is_active) order by t.name)
                     from dining_tables t where t.branch_id = p_branch), '[]'::jsonb);
end $$;

revoke all on function public_table_menu(text), public_table_order(text, jsonb, text, text, text), public_table_status(text, uuid),
  public_table_pay_qr(text, uuid), table_requests_list(uuid), table_request_resolve(uuid, boolean, text, text), table_qr_info(uuid, uuid) from public;
grant execute on function public_table_menu(text), public_table_order(text, jsonb, text, text, text), public_table_status(text, uuid) to anon, authenticated;
grant execute on function public_table_pay_qr(text, uuid) to service_role;
grant execute on function table_requests_list(uuid), table_request_resolve(uuid, boolean, text, text), table_qr_info(uuid, uuid) to authenticated;
