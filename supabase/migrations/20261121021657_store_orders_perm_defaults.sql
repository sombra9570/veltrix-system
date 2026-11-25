do $m$
declare d text;
begin
  d := pg_get_functiondef('public.perm_default(text,text)'::regprocedure);
  d := replace(d, 'when p_key like ''store.%'' then p_role in (''supervisor'', ''storekeeper'')',
    'when p_key = ''store.orders'' then p_role in (''supervisor'', ''cashier'', ''storekeeper'')
              when p_key = ''store.assign'' then p_role = ''supervisor''
              when p_key like ''store.%'' then p_role in (''supervisor'', ''storekeeper'')');
  execute d;
end $m$;
