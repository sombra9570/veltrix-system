-- Las funciones internas (gestión, rutas, supervisión, plataforma, ayudantes de permisos y disparadores)
-- no deben poder ejecutarse sin sesión. Se conservan para anónimos solo public_* y referral_valid.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as fn, p.proname
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
       and has_function_privilege('anon', p.oid, 'execute')
       and p.proname not like 'public\_%' and p.proname <> 'referral_valid'
  loop
    execute format('revoke execute on function %s from public, anon', r.fn);
    execute format('grant execute on function %s to authenticated, service_role', r.fn);
  end loop;
end $$;
