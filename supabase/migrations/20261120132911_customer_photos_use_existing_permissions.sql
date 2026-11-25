do $$
declare d text; n text;
begin
  -- quitar la clave inventada de la política de préstamos
  d := pg_get_functiondef('set_loan_policy(uuid, jsonb)'::regprocedure);
  n := replace(d, '''route_float'',''require_customer_photos'']', '''route_float'']');
  if n <> d then execute n; end if;
  -- el cobrador recibe los permisos que ya existen (loans.no_photo / loans.no_id_photo), por ruta o por rol
  d := pg_get_functiondef('public.collector_day()'::regprocedure);
  if position('can_no_photo' in d) = 0 then
    n := replace(d, '''can_customers'', coalesce((r.permissions->>''loans.customers'')::boolean, has_perm(''loans.customers'', r.branch_id)),',
      '''can_customers'', coalesce((r.permissions->>''loans.customers'')::boolean, has_perm(''loans.customers'', r.branch_id)),
        ''can_no_photo'', coalesce((r.permissions->>''loans.no_photo'')::boolean, has_perm(''loans.no_photo'', r.branch_id)),
        ''can_no_id_photo'', coalesce((r.permissions->>''loans.no_id_photo'')::boolean, has_perm(''loans.no_id_photo'', r.branch_id)),');
    if n = d then raise exception 'collector_day sin cambios'; end if;
    execute n;
  end if;
end $$;
