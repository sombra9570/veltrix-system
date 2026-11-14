-- =====================================================================
-- Veltrix · Panel del supervisor
--   Ve sus sucursales: cajas de ruta, cobrado y prestado por día, préstamos por aprobar.
--   Cierre de caja, inversión y aprobación de préstamos según permisos del administrador.
-- =====================================================================
create or replace function perm_catalog() returns text[]
language sql immutable as $$
  select array['cash.see_expected', 'cash.movements', 'sales.credit', 'customers.edit',
               'customers.view_docs', 'collector.expenses',
               'loans.create', 'loans.customers', 'loans.interest', 'loans.cancel',
               'routes.liquidate', 'routes.invest', 'routes.approve_loans'];
$$;

create or replace function perm_default(p_role text, p_key text) returns boolean
language sql immutable as $$
  select case when p_key = 'cash.see_expected' then false
              when p_key in ('loans.interest', 'loans.cancel', 'routes.liquidate', 'routes.invest', 'routes.approve_loans')
                then p_role = 'supervisor'
              else true end;
$$;

create or replace function supervisor_board() returns jsonb
language sql stable security definer set search_path = public as $$
  with br as (
    select b.id, b.name, b.org_id, c.legal_name as company, c.base_currency as currency
      from branches b join companies c on c.id = b.company_id
     where b.deleted_at is null
       and exists (select 1 from memberships m where m.user_id = auth.uid() and m.org_id = b.org_id
                     and m.role = 'supervisor' and m.is_active and m.deleted_at is null)
       and is_branch_manager(b.id))
  select jsonb_build_object(
    'branches', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'company', company, 'currency', currency,
                          'can_liquidate', has_perm('routes.liquidate', id), 'can_invest', has_perm('routes.invest', id),
                          'can_approve', has_perm('routes.approve_loans', id)) order by name) from br), '[]'::jsonb),
    'routes', coalesce((select jsonb_agg(jsonb_build_object(
        'id', r.id, 'name', r.name, 'branch_id', r.branch_id, 'branch', br.name, 'collector', p.full_name, 'currency', br.currency,
        'balance', route_fund_balance(r.id), 'period', route_period(r.id), 'days', route_days(r.id, 14),
        'liquidations', route_liquidations_list(r.id, 3),
        'lent_open', coalesce((select sum(l.principal) from loans l join orders o on o.id = l.order_id
                                where l.route_id = r.id and o.status = 'confirmed' and o.approval_status in ('approved', 'auto_approved')
                                  and exists (select 1 from installments i where i.order_id = o.id and i.amount - installment_paid(i.id) > 0)), 0),
        'portfolio', coalesce((select sum(i.amount - installment_paid(i.id)) from installments i join orders o on o.id = i.order_id
                                join customers cu on cu.id = o.customer_id
                                where cu.route_id = r.id and o.status = 'confirmed' and o.approval_status in ('approved', 'auto_approved')), 0),
        'customers', (select count(*) from customers cu where cu.route_id = r.id and cu.deleted_at is null),
        'late_customers', (select count(distinct o.customer_id) from installments i join orders o on o.id = i.order_id
                            join customers cu on cu.id = o.customer_id
                           where cu.route_id = r.id and o.status = 'confirmed' and o.approval_status in ('approved', 'auto_approved')
                             and i.due_date < branch_today(r.branch_id) and i.amount - installment_paid(i.id) > 0)
      ) order by br.name, r.name)
      from collection_routes r join br on br.id = r.branch_id left join profiles p on p.id = r.collector_id
     where r.deleted_at is null and r.is_active), '[]'::jsonb),
    'loans', coalesce((select jsonb_agg(x) from (
        select jsonb_build_object(
          'order_id', l.order_id, 'created_at', l.created_at, 'customer', cu.name, 'route', r.name, 'collector', p.full_name,
          'branch', br.name, 'branch_id', l.branch_id, 'currency', o.currency, 'principal', l.principal, 'interest', l.interest_pct,
          'total', o.total_amount, 'installments', l.installments, 'every_days', l.every_days,
          'reasons', to_jsonb(l.pending_reasons), 'approval', o.approval_status, 'status', o.status,
          'balance', (select coalesce(sum(i.amount - installment_paid(i.id)), 0) from installments i where i.order_id = o.id),
          'rating', customer_rating(cu.id)) as x
          from loans l join br on br.id = l.branch_id join orders o on o.id = l.order_id join customers cu on cu.id = l.customer_id
          left join collection_routes r on r.id = l.route_id left join profiles p on p.id = l.collector_id
         order by (o.approval_status = 'pending_supervisor' and o.status = 'confirmed') desc, l.created_at desc
         limit 100) t), '[]'::jsonb));
$$;

-- Aprobar o rechazar un préstamo: el administrador siempre; el supervisor u otro rol con permiso
create or replace function decide_street_loan(p_order uuid, p_approve boolean, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare o orders%rowtype;
begin
  select * into o from orders where id = p_order and order_type = 'loan';
  if not found then raise exception 'Préstamo inexistente'; end if;
  if not has_perm('routes.approve_loans', o.branch_id) then raise exception 'ROUTE_NO_PERMISSION'; end if;
  if o.status <> 'confirmed' or o.approval_status <> 'pending_supervisor' then raise exception 'LOAN_NOT_PENDING'; end if;
  perform set_config('veltrix.loan_cancel', 'on', true);
  update orders set approval_status = case when p_approve then 'approved'::approval_status else 'rejected'::approval_status end,
                    rejection_reason = case when p_approve then null else coalesce(nullif(trim(coalesce(p_reason, '')), ''), 'Rechazado') end
   where id = p_order;
  perform set_config('veltrix.loan_cancel', '', true);
end $$;

revoke execute on function supervisor_board(), decide_street_loan(uuid, boolean, text) from public, anon;
grant execute on function supervisor_board(), decide_street_loan(uuid, boolean, text) to authenticated;
