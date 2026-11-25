create or replace function public.perm_default(p_role text, p_key text)
returns boolean language sql immutable set search_path to 'public' as $$
  select case when p_key = 'cash.see_expected' then false
              when p_key in ('collector.delete_credits', 'collector.delete_customers', 'collector.delete_installments', 'loans.no_photo', 'loans.no_id_photo') then false
              when p_key = 'routes.liquidate' then p_role in ('supervisor', 'collector')
              when p_key in ('loans.interest', 'loans.cancel', 'loans.reschedule', 'routes.invest', 'routes.approve_loans', 'collector.portfolio')
                then p_role = 'supervisor'
              else true end;
$$;

do $$
declare d text; n text;
begin
  select pg_get_functiondef('public.create_street_loan(uuid,uuid,numeric,numeric,integer,integer,date,text)'::regprocedure) into d;
  n := replace(d, '  v_total := round(p_principal * (1 + v_int / 100), 2);',
'  if coalesce((r.permissions->>''max_loan'')::numeric, 0) > 0 and p_principal > (r.permissions->>''max_loan'')::numeric then raise exception ''LOAN_ROUTE_MAX_AMOUNT''; end if;
  if coalesce((r.permissions->>''max_cards'')::numeric, 0) > 0
     and (select count(*) from loans l2 join orders o2 on o2.id = l2.order_id
           where l2.customer_id = c.id and l2.cancelled_at is null and o2.status = ''confirmed'' and o2.approval_status <> ''rejected''
             and exists (select 1 from installments i2 where i2.order_id = o2.id and i2.amount - installment_paid(i2.id) > 0))
         >= (r.permissions->>''max_cards'')::numeric then raise exception ''LOAN_ROUTE_MAX_CARDS''; end if;
  if not coalesce((r.permissions->>''loans.no_photo'')::boolean, false) and c.photo_path is null then raise exception ''LOAN_NEEDS_PHOTO''; end if;
  if not coalesce((r.permissions->>''loans.no_id_photo'')::boolean, false) and (c.doc_photo_path is null or c.doc_back_photo_path is null) then raise exception ''LOAN_NEEDS_ID''; end if;
  v_total := round(p_principal * (1 + v_int / 100), 2);');
  if n = d then raise exception 'create_street_loan sin cambios'; end if;
  execute n;

  select pg_get_functiondef('public.collector_day()'::regprocedure) into d;
  n := replace(d, '''can_settings'',', '''can_delete_credits'', coalesce((r.permissions->>''collector.delete_credits'')::boolean, has_perm(''collector.delete_credits'', r.branch_id)),
        ''can_delete_customers'', coalesce((r.permissions->>''collector.delete_customers'')::boolean, has_perm(''collector.delete_customers'', r.branch_id)),
        ''can_delete_installments'', coalesce((r.permissions->>''collector.delete_installments'')::boolean, has_perm(''collector.delete_installments'', r.branch_id)),
        ''commission_pct'', coalesce((r.permissions->>''commission_pct'')::numeric, 3),
        ''max_loan'', coalesce((r.permissions->>''max_loan'')::numeric, 0),
        ''can_settings'',');
  if n = d then raise exception 'collector_day flags sin cambios'; end if;
  execute n;
end $$;

create or replace function public.collector_delete_credit(p_order uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare l loans%rowtype; o orders%rowtype; r collection_routes%rowtype;
begin
  select * into l from loans where order_id = p_order for update;
  if not found or l.cancelled_at is not null then raise exception 'Préstamo inexistente'; end if;
  select * into r from collection_routes where id = l.route_id and deleted_at is null;
  if not found or not (r.collector_id = auth.uid() or is_org_owner(r.org_id) or is_branch_manager(r.branch_id)) then raise exception 'LOAN_NO_PERMISSION'; end if;
  if not coalesce((r.permissions->>'collector.delete_credits')::boolean, has_perm('collector.delete_credits', r.branch_id)) then raise exception 'LOAN_NO_PERMISSION'; end if;
  select * into o from orders where id = p_order;
  if exists (select 1 from installments i where i.order_id = p_order and installment_paid(i.id) <> 0) then
    raise exception 'El pedido tiene cobros: primero hay que reversarlos';
  end if;
  perform set_config('veltrix.loan_cancel', 'on', true);
  update orders set status = 'cancelled' where id = p_order;
  perform set_config('veltrix.loan_cancel', '', true);
  if l.movement_id is not null then
    insert into cash_movements (branch_id, type, amount, currency, route_id, description, created_by)
    values (l.branch_id, 'loan_return', l.principal, o.currency, l.route_id,
            'Crédito borrado · ' || coalesce((select name from customers where id = l.customer_id), ''), l.collector_id);
  end if;
  update loans set cancelled_at = now() where order_id = p_order;
end $$;

create or replace function public.collector_delete_customer(p_customer uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare c customers%rowtype; r collection_routes%rowtype;
begin
  select * into c from customers where id = p_customer and deleted_at is null;
  if not found then raise exception 'Sin permiso'; end if;
  select * into r from collection_routes where id = c.route_id and deleted_at is null;
  if not found or not (r.collector_id = auth.uid() or is_org_owner(r.org_id) or is_branch_manager(r.branch_id)) then raise exception 'LOAN_NO_PERMISSION'; end if;
  if not coalesce((r.permissions->>'collector.delete_customers')::boolean, has_perm('collector.delete_customers', r.branch_id)) then raise exception 'LOAN_NO_PERMISSION'; end if;
  if customer_open_balance(c.id) > 0.004 then raise exception 'CUSTOMER_HAS_DEBT'; end if;
  update customers set deleted_at = now() where id = c.id;
end $$;
