DO $mig$
declare d text;
begin
  -- 1) has_perm: el supervisor respeta lo que el dueño configure para su rol en el panel de permisos
  d := pg_get_functiondef('public.has_perm(text,uuid)'::regprocedure);
  d := replace(d,
    E'    when p_key = any(array[''loans.customers''',
    E'    when exists (select 1 from memberships m join organizations o on o.id = m.org_id\n                  where m.user_id = auth.uid() and m.branch_id = p_branch and m.role = ''supervisor'' and m.is_active and m.deleted_at is null\n                    and (o.role_permissions->''supervisor'') ? p_key)\n      then (select bool_or(coalesce((o.role_permissions->''supervisor''->>p_key)::boolean, true)) from memberships m join organizations o on o.id = m.org_id\n             where m.user_id = auth.uid() and m.branch_id = p_branch and m.role = ''supervisor'' and m.is_active and m.deleted_at is null)\n    when p_key = any(array[''loans.customers''');
  if position('role_permissions->''supervisor''' in d) = 0 then raise exception 'parche has_perm no aplicado'; end if;
  execute d;

  -- 2) perm_default: el supervisor ve el efectivo esperado al revisar cierres
  d := pg_get_functiondef('public.perm_default(text,text)'::regprocedure);
  d := replace(d, E'select case when p_key = ''cash.see_expected'' then false', E'select case when p_key = ''cash.see_expected'' then p_role = ''supervisor''');
  if position('then p_role = ''supervisor''' in d) = 0 then raise exception 'parche perm_default no aplicado'; end if;
  execute d;
end
$mig$;
