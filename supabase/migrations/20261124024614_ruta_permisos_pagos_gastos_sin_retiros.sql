-- 1) Catálogo y permisos delegables del supervisor: nuevo permiso 'collector.pay_out' (Registrar pagos)
create or replace function public.perm_catalog() returns text[] language sql immutable set search_path to 'public' as $$
  select array['cash.see_expected', 'cash.expense', 'cash.withdraw', 'cash.deposit', 'cash.change_fund',
    'sales.credit', 'customers.create', 'customers.edit', 'customers.view_docs', 'customers.upload_docs', 'collector.expenses', 'collector.pay_out',
    'loans.create', 'loans.customers', 'loans.interest', 'loans.cancel', 'loans.reschedule',
    'routes.liquidate', 'routes.invest', 'routes.approve_loans',
    'payments.reverse', 'products.create', 'products.edit', 'products.price', 'products.delete', 'products.see_code',
    'inv.receive', 'inv.purchase', 'inv.adjust',
    'inv.out_waste', 'inv.out_damaged', 'inv.out_expired', 'inv.out_internal', 'inv.out_supplier_return', 'inv.out_other',
    'inv.transfer', 'reports.export', 'sales.cancel_request', 'inv.see_cost', 'inv.photo',
    'store.photo', 'store.publish', 'store.edit_info', 'store.orders', 'store.assign'];
$$;

create or replace function public.supervisor_set_permission(p_membership uuid, p_key text, p_value boolean)
returns void language plpgsql security definer set search_path to 'public' as $$
declare m memberships%rowtype;
begin
  select * into m from memberships where id = p_membership and role = 'supervisor' and deleted_at is null;
  if not found or not is_org_owner(m.org_id) then raise exception 'PERM_DENIED'; end if;
  if not (p_key = any(array['loans.customers','payments.record_installment','collector.delete_installments','loans.create','collector.delete_credits',
                            'payments.record_partial','collector.delete_customers','loans.interest','routes.liquidate','collector.expenses','collector.pay_out',
                            'collector.delete_expenses','routes.invest'])) then raise exception 'Permiso inexistente'; end if;
  update memberships set permissions = case when p_value is null then permissions - p_key else permissions || jsonb_build_object(p_key, p_value) end,
         updated_at = now() where id = p_membership;
end $$;

-- 2) Permisos efectivos para el formulario de cierre de caja
create or replace function public.route_cut_perms(p_route uuid)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object(
    'expenses', coalesce((r.permissions->>'collector.expenses')::boolean, has_perm('collector.expenses', r.branch_id)),
    'pay_out',  coalesce((r.permissions->>'collector.pay_out')::boolean,  has_perm('collector.pay_out',  r.branch_id)))
  from collection_routes r where r.id = p_route and r.deleted_at is null;
$$;

-- 3) Retiros: ya no se crean (todo egreso se registra como gasto con permiso)
create or replace function public.route_fund_move(p_route uuid, p_type text, p_amount numeric, p_note text default null)
returns numeric language plpgsql security definer set search_path to 'public' as $$
declare r collection_routes%rowtype;
begin
  select * into r from collection_routes where id = p_route and deleted_at is null;
  if not found or not has_perm('routes.invest', r.branch_id) then raise exception 'ROUTE_NO_PERMISSION'; end if;
  if not org_writable(r.org_id) then raise exception 'Cuenta suspendida: solo lectura'; end if;
  if p_type <> 'investment' then raise exception 'Movimiento inválido'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Monto inválido'; end if;
  insert into route_fund_moves (org_id, branch_id, route_id, type, amount, note)
  values (r.org_id, r.branch_id, r.id, p_type, round(p_amount, 2), nullif(trim(coalesce(p_note, '')), ''));
  insert into audit_log (org_id, branch_id, table_name, row_id, action, actor_id, new_data)
  values (r.org_id, r.branch_id, 'route_fund_moves', r.id, 'route_fund_' || p_type, auth.uid(),
          jsonb_build_object('amount', p_amount, 'note', p_note));
  return route_fund_balance(p_route);
end $$;

-- 4) Cierre de caja: sin líneas de retiro; gastos y pagos exigen su propio permiso
do $$
declare d text;
begin
  d := pg_get_functiondef('public.liquidate_route(uuid,numeric,jsonb,text)'::regprocedure);
  d := replace(d, $a$if v_kind not in ('op_expense', 'payment_out', 'withdrawal') or v_amt is null or v_amt <= 0 then raise exception 'LIQ_LINE_INVALID'; end if;$a$,
    $b$if v_kind not in ('op_expense', 'payment_out') or v_amt is null or v_amt <= 0 then raise exception 'LIQ_LINE_INVALID'; end if;
    if v_kind = 'op_expense' and not coalesce((r.permissions->>'collector.expenses')::boolean, has_perm('collector.expenses', r.branch_id)) then raise exception 'ROUTE_NO_PERMISSION'; end if;
    if v_kind = 'payment_out' and not coalesce((r.permissions->>'collector.pay_out')::boolean, has_perm('collector.pay_out', r.branch_id)) then raise exception 'ROUTE_NO_PERMISSION'; end if;$b$);
  if d not like '%collector.pay_out%' then raise exception 'reemplazo no aplicado'; end if;
  execute d;
end $$;
