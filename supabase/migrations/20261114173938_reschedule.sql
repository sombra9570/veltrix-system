create or replace function perm_catalog() returns text[]
language sql immutable set search_path = public as $$
  select array['cash.see_expected', 'cash.movements', 'sales.credit', 'customers.edit',
               'customers.view_docs', 'collector.expenses',
               'loans.create', 'loans.customers', 'loans.interest', 'loans.cancel', 'loans.reschedule',
               'routes.liquidate', 'routes.invest', 'routes.approve_loans'];
$$;

create or replace function perm_default(p_role text, p_key text) returns boolean
language sql immutable set search_path = public as $$
  select case when p_key = 'cash.see_expected' then false
              when p_key in ('loans.interest', 'loans.cancel', 'loans.reschedule', 'routes.liquidate', 'routes.invest', 'routes.approve_loans')
                then p_role = 'supervisor'
              else true end;
$$;

do $$
declare d text;
begin
  d := pg_get_functiondef('guard_draft_children()'::regprocedure);
  if position('veltrix.reschedule' in d) = 0 then
    d := replace(d, 'if current_setting(''veltrix.purge'', true) = ''on'' then return coalesce(new, old); end if;',
      'if current_setting(''veltrix.purge'', true) = ''on'' then return coalesce(new, old); end if;
  if tg_op = ''UPDATE'' and tg_table_name = ''installments'' and current_setting(''veltrix.reschedule'', true) = ''on''
     and (to_jsonb(new) - ''due_date'') = (to_jsonb(old) - ''due_date'') then
    return new;
  end if;');
    if position('veltrix.reschedule' in d) = 0 then raise exception 'guard_draft_children: no se pudo aplicar'; end if;
    execute d;
  end if;
end $$;

create or replace function reschedule_loan(p_order uuid, p_days int, p_from_number int default null) returns int
language plpgsql security definer set search_path = public as $$
declare o orders%rowtype; n int;
begin
  select * into o from orders where id = p_order and status = 'confirmed' and payment_condition = 'credit';
  if not found then raise exception 'Crédito inexistente'; end if;
  if not has_perm('loans.reschedule', o.branch_id) then raise exception 'LOAN_NO_PERMISSION'; end if;
  if p_days is null or p_days < 1 or p_days > 365 then raise exception 'RESCHEDULE_INVALID'; end if;
  perform set_config('veltrix.reschedule', 'on', true);
  update installments i set due_date = i.due_date + p_days
   where i.order_id = p_order and (p_from_number is null or i.number >= p_from_number)
     and i.amount - installment_paid(i.id) > 0;
  get diagnostics n = row_count;
  perform set_config('veltrix.reschedule', '', true);
  return n;
end $$;
revoke execute on function reschedule_loan(uuid, int, int) from public, anon;
grant execute on function reschedule_loan(uuid, int, int) to authenticated;
