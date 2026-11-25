do $$
declare d text; o text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='public_delivery_order';
  o := d;
  d := replace(d, 'insert into delivery_requests (org_id',
    E'select id into v_id from delivery_requests\n   where branch_id = s.branch_id and phone = v_phone and status = ''pending'' and items = v_clean\n     and address = left(trim(p_address), 200) and created_at > now() - interval ''3 minutes''\n   order by created_at desc limit 1;\n  if v_id is not null then return v_id; end if;\n  insert into delivery_requests (org_id');
  if d = o then raise exception 'public_delivery_order: no se pudo aplicar'; end if;
  execute d;

  select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='public_table_order';
  o := d;
  d := replace(d, 'insert into table_requests (org_id',
    E'select id into v_id from table_requests\n   where table_id = t.id and status = ''pending'' and items = v_clean\n     and coalesce(customer_name, '''') = coalesce(nullif(left(trim(coalesce(p_name, '''')), 40), ''''), '''')\n     and created_at > now() - interval ''2 minutes''\n   order by created_at desc limit 1;\n  if v_id is not null then return v_id; end if;\n  insert into table_requests (org_id');
  if d = o then raise exception 'public_table_order: no se pudo aplicar'; end if;
  execute d;
end $$;
