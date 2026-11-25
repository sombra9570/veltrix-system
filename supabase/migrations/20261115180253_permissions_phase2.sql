create or replace function public.perm_catalog()
returns text[] language sql immutable as $$
  select array['cash.see_expected', 'cash.movements', 'sales.credit', 'customers.edit', 'customers.view_docs', 'collector.expenses',
    'loans.create', 'loans.customers', 'loans.interest', 'loans.cancel', 'loans.reschedule',
    'routes.liquidate', 'routes.invest', 'routes.approve_loans',
    'payments.reverse', 'products.edit', 'products.price', 'products.delete',
    'inv.receive', 'inv.adjust', 'inv.out', 'inv.transfer', 'reports.export',
    'sales.cancel_request', 'inv.see_cost'];
$$;

alter table organizations add column if not exists role_limits jsonb not null default '{}'::jsonb;
alter table memberships add column if not exists limits jsonb not null default '{}'::jsonb;

create or replace function public.my_limit(p_key text, p_branch uuid)
returns numeric language sql stable security definer set search_path to 'public' as $$
  select case
    when is_platform_admin() or is_branch_manager(p_branch)
      or exists (select 1 from branches b where b.id = p_branch and is_org_owner(b.org_id)) then null
    else coalesce(
      (select max((m.limits->>p_key)::numeric) from memberships m
        where m.user_id = auth.uid() and m.branch_id = p_branch and m.is_active and m.deleted_at is null and m.limits ? p_key),
      (select max((o.role_limits->(m.role::text)->>p_key)::numeric) from memberships m join organizations o on o.id = m.org_id
        where m.user_id = auth.uid() and m.branch_id = p_branch and m.is_active and m.deleted_at is null
          and (o.role_limits->(m.role::text)) ? p_key),
      0) end;
$$;

create or replace function public.set_role_limit(p_org uuid, p_role text, p_key text, p_value numeric)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not (is_org_owner(p_org) or is_platform_admin()) then raise exception 'Sin permiso'; end if;
  if p_key not in ('discount_pct') then raise exception 'Tope inválido'; end if;
  if p_value is null or p_value < 0 or p_value > 100 then raise exception 'Valor inválido'; end if;
  update organizations set role_limits = jsonb_set(coalesce(role_limits, '{}'::jsonb), array[p_role],
      coalesce(role_limits->p_role, '{}'::jsonb) || jsonb_build_object(p_key, p_value))
   where id = p_org;
end $$;

create or replace function public.set_member_limit(p_membership uuid, p_key text, p_value numeric)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_org uuid;
begin
  select org_id into v_org from memberships where id = p_membership and deleted_at is null;
  if v_org is null or not (is_org_owner(v_org) or is_platform_admin()) then raise exception 'Sin permiso'; end if;
  if p_key not in ('discount_pct') then raise exception 'Tope inválido'; end if;
  if p_value is not null and (p_value < 0 or p_value > 100) then raise exception 'Valor inválido'; end if;
  update memberships set limits = case when p_value is null then coalesce(limits, '{}'::jsonb) - p_key
                                       else coalesce(limits, '{}'::jsonb) || jsonb_build_object(p_key, p_value) end
   where id = p_membership;
end $$;

create or replace function public.limits_admin(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not (is_org_owner(p_org) or is_platform_admin()) then raise exception 'Sin permiso'; end if;
  return jsonb_build_object(
    'roles', (select role_limits from organizations where id = p_org),
    'users', (select coalesce(jsonb_object_agg(m.id, m.limits), '{}'::jsonb) from memberships m
               where m.org_id = p_org and m.is_active and m.deleted_at is null and m.limits <> '{}'::jsonb));
end $$;

drop function if exists public.create_sale(uuid, jsonb, text);
create or replace function public.create_sale(p_branch uuid, p_items jsonb, p_notes text, p_discount numeric default 0)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare b branches%rowtype; v_cur char(3); v_order uuid; v_customer uuid; it jsonb; pr products%rowtype; v_qty numeric;
  v_pct numeric := coalesce(p_discount, 0); v_cap numeric; v_full numeric := 0; v_net numeric := 0; v_price numeric;
begin
  select * into b from branches where id = p_branch and deleted_at is null;
  if not found then raise exception 'Sucursal inexistente'; end if;
  if not can_sell(b.id) then raise exception 'Sin permiso para vender en esta sucursal'; end if;
  if not org_writable(b.org_id) then raise exception 'Cuenta suspendida: solo lectura'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'El pedido no tiene ítems'; end if;
  if jsonb_array_length(p_items) > 200 then raise exception 'Demasiados ítems en un solo pedido'; end if;
  if v_pct < 0 or v_pct >= 100 then raise exception 'Descuento inválido'; end if;
  if v_pct > 0 then
    v_cap := my_limit('discount_pct', b.id);
    if v_cap is not null and v_pct > v_cap then raise exception 'DISCOUNT_OVER_LIMIT:%', v_cap; end if;
  end if;
  select base_currency into v_cur from companies where id = b.company_id;
  v_customer := walk_in_customer(b.id);
  perform ensure_default_warehouse(b.id);
  insert into orders (branch_id, customer_id, vendor_id, payment_condition, currency, order_type, notes)
  values (b.id, v_customer, auth.uid(), 'cash', v_cur, 'counter',
          nullif(concat_ws(' · ', nullif(trim(coalesce(p_notes, '')), ''), case when v_pct > 0 then 'Descuento ' || v_pct || '%' end), ''))
  returning id into v_order;
  for it in select * from jsonb_array_elements(p_items) loop
    v_qty := (it->>'qty')::numeric;
    if v_qty is null or v_qty <= 0 or v_qty > 100000 then raise exception 'Cantidad inválida'; end if;
    select * into pr from products where id = (it->>'product_id')::uuid and company_id = b.company_id and is_active and is_sellable and deleted_at is null;
    if not found then raise exception 'Producto no disponible'; end if;
    v_price := round(pr.unit_price * (1 - v_pct / 100), 2);
    v_full := v_full + v_qty * pr.unit_price; v_net := v_net + v_qty * v_price;
    insert into order_items (org_id, order_id, product_id, description, qty, unit_price, tax_rate)
    values (b.org_id, v_order, pr.id, pr.name, v_qty, v_price, pr.tax_rate);
  end loop;
  update orders set status = 'confirmed' where id = v_order;
  if v_pct > 0 then
    insert into audit_log (org_id, branch_id, table_name, row_id, action, actor_id, new_data)
    values (b.org_id, b.id, 'orders', v_order, 'sale_discount', auth.uid(),
            jsonb_build_object('pct', v_pct, 'amount', round(v_full - v_net, 2)));
  end if;
  return v_order;
end $$;
revoke all on function public.create_sale(uuid, jsonb, text, numeric) from public, anon;
grant execute on function public.create_sale(uuid, jsonb, text, numeric) to authenticated;

create table if not exists approval_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null, branch_id uuid not null references branches(id),
  kind text not null check (kind in ('cancel_sale')),
  ref_id uuid not null, amount numeric, reason text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_by uuid not null default auth.uid(), requested_at timestamptz not null default now(),
  decided_by uuid, decided_at timestamptz, decision_note text
);
create index if not exists approval_requests_pending_idx on approval_requests (branch_id) where status = 'pending';
alter table approval_requests enable row level security;
revoke all on approval_requests from anon, authenticated;

create or replace function public.request_cancel_sale(p_order uuid, p_reason text)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare o orders%rowtype; v_id uuid;
begin
  select * into o from orders where id = p_order and deleted_at is null;
  if not found then raise exception 'Venta inexistente'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Indique el motivo'; end if;
  if is_branch_manager(o.branch_id) then perform cancel_sale(p_order, p_reason); return null; end if;
  if not (o.vendor_id = auth.uid() or can_sell(o.branch_id)) then raise exception 'Sin permiso'; end if;
  if not has_perm('sales.cancel_request', o.branch_id) then raise exception 'PERM_DENIED'; end if;
  if o.status <> 'confirmed' then raise exception 'SALE_NOT_CANCELLABLE'; end if;
  if exists (select 1 from approval_requests where kind = 'cancel_sale' and ref_id = p_order and status = 'pending') then
    raise exception 'REQUEST_PENDING'; end if;
  insert into approval_requests (org_id, branch_id, kind, ref_id, amount, reason)
  values (o.org_id, o.branch_id, 'cancel_sale', o.id, o.total_amount, left(trim(p_reason), 300)) returning id into v_id;
  return v_id;
end $$;

create or replace function public.approvals_list()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'kind', a.kind, 'ref', a.ref_id, 'amount', a.amount, 'reason', a.reason,
           'at', a.requested_at, 'by', p.full_name, 'branch', b.name, 'currency', o.currency, 'notes', o.notes) order by a.requested_at), '[]'::jsonb)
    from approval_requests a join branches b on b.id = a.branch_id
    left join profiles p on p.id = a.requested_by left join orders o on o.id = a.ref_id
   where a.status = 'pending' and is_branch_manager(a.branch_id);
$$;

create or replace function public.my_approval_requests()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'kind', a.kind, 'ref', a.ref_id, 'amount', a.amount, 'status', a.status,
           'at', a.requested_at, 'note', a.decision_note) order by a.requested_at desc), '[]'::jsonb)
    from (select * from approval_requests where requested_by = auth.uid() order by requested_at desc limit 30) a;
$$;

create or replace function public.decide_approval(p_id uuid, p_approve boolean, p_note text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare a approval_requests%rowtype;
begin
  select * into a from approval_requests where id = p_id for update;
  if not found or not is_branch_manager(a.branch_id) then raise exception 'Sin permiso'; end if;
  if a.status <> 'pending' then raise exception 'Ya fue resuelta'; end if;
  if p_approve and a.kind = 'cancel_sale' then perform cancel_sale(a.ref_id, a.reason); end if;
  update approval_requests set status = case when p_approve then 'approved' else 'rejected' end,
         decided_by = auth.uid(), decided_at = now(), decision_note = nullif(left(trim(coalesce(p_note, '')), 300), '')
   where id = p_id;
end $$;

alter function public.inv_overview(uuid) rename to _inv_overview_full;
revoke all on function public._inv_overview_full(uuid) from public, anon, authenticated;
create or replace function public.inv_overview(p_branch uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare r jsonb;
begin
  r := _inv_overview_full(p_branch);
  if not has_perm('inv.see_cost', p_branch) then
    r := jsonb_set(r, '{summary}', (r->'summary') - 'value');
    r := jsonb_set(r, '{items}', coalesce((select jsonb_agg(e - array['cost', 'value'] order by i)
            from jsonb_array_elements(r->'items') with ordinality t(e, i)), '[]'::jsonb));
    r := r || jsonb_build_object('hide_cost', true);
  end if;
  return r;
end $$;

revoke all on function public.my_limit(text, uuid) from public, anon;
revoke all on function public.set_role_limit(uuid, text, text, numeric) from public, anon;
revoke all on function public.set_member_limit(uuid, text, numeric) from public, anon;
revoke all on function public.limits_admin(uuid) from public, anon;
revoke all on function public.request_cancel_sale(uuid, text) from public, anon;
revoke all on function public.approvals_list() from public, anon;
revoke all on function public.my_approval_requests() from public, anon;
revoke all on function public.decide_approval(uuid, boolean, text) from public, anon;
revoke all on function public.inv_overview(uuid) from public, anon;
grant execute on function public.my_limit(text, uuid) to authenticated;
grant execute on function public.set_role_limit(uuid, text, text, numeric) to authenticated;
grant execute on function public.set_member_limit(uuid, text, numeric) to authenticated;
grant execute on function public.limits_admin(uuid) to authenticated;
grant execute on function public.request_cancel_sale(uuid, text) to authenticated;
grant execute on function public.approvals_list() to authenticated;
grant execute on function public.my_approval_requests() to authenticated;
grant execute on function public.decide_approval(uuid, boolean, text) to authenticated;
grant execute on function public.inv_overview(uuid) to authenticated;
