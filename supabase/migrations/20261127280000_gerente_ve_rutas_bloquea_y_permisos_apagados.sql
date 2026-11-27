-- Gerente en cobranza en calle: ve todas las rutas como supervisor, puede bloquear/desbloquear cobradores,
-- y sus permisos de cobranza parten apagados (el administrador los enciende uno por uno).
create or replace function public.is_org_manager(p_org uuid) returns boolean
language sql stable security definer set search_path to 'public' as
$$ select exists (select 1 from memberships m where m.org_id = p_org and m.user_id = auth.uid() and m.role = 'manager' and m.is_active and m.deleted_at is null); $$;

do $$
declare src text; src2 text;
begin
  select pg_get_functiondef(p.oid) into src from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='_sup_route';
  src2 := replace(src, 'r.supervisor_id = auth.uid() or is_org_owner(r.org_id)', 'r.supervisor_id = auth.uid() or is_org_owner(r.org_id) or is_org_manager(r.org_id)');
  if src2 = src then raise exception '_sup_route'; end if;
  execute src2;

  select pg_get_functiondef(p.oid) into src from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='sup_my_routes';
  src2 := replace(src, 'where r.supervisor_id = auth.uid() and', 'where (r.supervisor_id = auth.uid() or is_org_manager(r.org_id)) and');
  if src2 = src then raise exception 'sup_my_routes'; end if;
  execute src2;

  select pg_get_functiondef(p.oid) into src from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='has_perm';
  src2 := replace(src, '    when (p_key not like ''routes.%'' or p_key in',
    '    when p_key = any(array[''loans.customers'',''payments.record_installment'',''payments.record_partial'',''loans.create'',''loans.interest'',''routes.invest'',''routes.liquidate'',''routes.approve_loans'',''collector.expenses'',''collector.pay_out'',''collector.delete_installments'',''collector.delete_credits'',''collector.delete_customers'',''collector.delete_expenses'',''loans.no_photo'',''loans.no_id_photo''])
         and exists (select 1 from memberships m join organizations o on o.id = m.org_id
                      where m.user_id = auth.uid() and m.branch_id = p_branch and m.role = ''manager'' and m.is_active and m.deleted_at is null and o.street_collectors is not null)
      then false
    when (p_key not like ''routes.%'' or p_key in');
  if src2 = src then raise exception 'has_perm'; end if;
  execute src2;
end $$;
