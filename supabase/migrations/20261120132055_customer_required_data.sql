do $$
declare d text;
begin
  -- 1) el administrador puede exigir fotos (política de préstamos, valor 0/1)
  d := pg_get_functiondef('set_loan_policy(uuid, jsonb)'::regprocedure);
  if position('require_customer_photos' in d) = 0 then
    d := replace(d, '''route_float'']', '''route_float'',''require_customer_photos'']');
    if position('require_customer_photos' in d) = 0 then raise exception 'set_loan_policy: no se pudo aplicar'; end if;
    execute d;
  end if;
  -- 2) el servidor también exige los datos obligatorios del cliente nuevo
  d := pg_get_functiondef((select p.oid from pg_proc p where proname = 'collector_save_customer'));
  if position('CUSTOMER_REQUIRED' in d) = 0 then
    d := replace(d, E'  pol := loan_policy(r.org_id);\n  if (pol->>''max_customers_collector'')',
      E'  if coalesce(trim(p_tax_id), '''') = '''' or coalesce(trim(p_phone), '''') = '''' or coalesce(trim(p_address), '''') = ''''\n     or p_lat is null or p_lng is null then raise exception ''CUSTOMER_REQUIRED''; end if;\n  pol := loan_policy(r.org_id);\n  if (pol->>''max_customers_collector'')');
    if position('CUSTOMER_REQUIRED' in d) = 0 then raise exception 'collector_save_customer: no se pudo aplicar'; end if;
    execute d;
  end if;
end $$;
