do $$
declare d text; n text;
begin
  -- Cobro sin ruta indicada: se revisa la ruta del cliente
  select pg_get_functiondef('public.register_payment(uuid,payment_origin,payment_method,numeric,uuid,uuid,uuid[],uuid,timestamp with time zone,uuid)'::regprocedure) into d;
  n := replace(d, '  perform assert_route_open(p_route);', '  perform assert_route_open(p_route);
  perform assert_route_open((select route_id from customers where id = p_customer));');
  if n = d then raise exception 'register_payment sin cambios'; end if;
  execute n;

  select pg_get_functiondef('public.collector_set_qr(uuid,text,text)'::regprocedure) into d;
  n := regexp_replace(d, E'\nbegin\n', E'\nbegin\n  perform assert_route_open(p_route);\n');
  if n = d then raise exception 'set_qr sin cambios'; end if;
  execute n;

  select pg_get_functiondef('public.collector_set_customer_files(uuid,text,text,text,text,boolean)'::regprocedure) into d;
  n := replace(d, E'  if not found then raise exception ''Sin permiso''; end if;', E'  if not found then raise exception ''Sin permiso''; end if;\n  perform assert_route_open(c.route_id);');
  if n = d then raise exception 'files sin cambios'; end if;
  execute n;

  select pg_get_functiondef('public.collector_delete_credit(uuid)'::regprocedure) into d;
  n := replace(d, E'  select * into o from orders where id = p_order;', E'  perform assert_route_open(r.id);\n  select * into o from orders where id = p_order;');
  if n = d then raise exception 'del credit sin cambios'; end if;
  execute n;

  select pg_get_functiondef('public.collector_delete_customer(uuid)'::regprocedure) into d;
  n := replace(d, E'  if customer_open_balance(c.id)', E'  perform assert_route_open(r.id);\n  if customer_open_balance(c.id)');
  if n = d then raise exception 'del customer sin cambios'; end if;
  execute n;
end $$;
