
do $$
declare d text;
begin
  d := pg_get_functiondef('public.perm_default'::regproc);
  d := replace(d, 'then p_role in (''supervisor'', ''storekeeper'')' || chr(10) || '              when p_key = ''inv.photo''', 'then p_role in (''supervisor'', ''storekeeper'', ''director'')' || chr(10) || '              when p_key = ''inv.photo''');
  execute d;
end $$;
