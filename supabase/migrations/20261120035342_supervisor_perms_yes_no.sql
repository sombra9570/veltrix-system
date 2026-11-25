do $$
declare d text; n text;
begin
  select pg_get_functiondef('public.has_perm(text,uuid)'::regprocedure) into d;
  n := replace(d, '    when is_branch_manager(p_branch) and p_key not like ''routes.%'' then true',
'    when p_key = any(array[''loans.customers'',''payments.record_installment'',''collector.delete_installments'',''loans.create'',''collector.delete_credits'',
                           ''payments.record_partial'',''collector.delete_customers'',''loans.interest'',''routes.liquidate'',''collector.expenses'',
                           ''collector.delete_expenses'',''routes.invest''])
         and exists (select 1 from memberships m where m.user_id = auth.uid() and m.branch_id = p_branch and m.role = ''supervisor'' and m.is_active and m.deleted_at is null)
      then false
    when is_branch_manager(p_branch) and p_key not like ''routes.%'' then true');
  if n = d then raise exception 'has_perm sin cambios'; end if;
  execute n;
end $$;
