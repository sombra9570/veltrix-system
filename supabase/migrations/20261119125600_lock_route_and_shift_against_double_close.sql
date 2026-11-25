do $$
declare d text; o text;
begin
  -- 1) close_route: bloquear la ruta mientras se cierra
  select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='close_route';
  o := d;
  d := replace(d, 'select * into r from collection_routes where id = p_route;', 'select * into r from collection_routes where id = p_route for no key update;');
  if d = o then raise exception 'close_route: no se pudo aplicar'; end if;
  execute d;

  -- 2) liquidate_route: bloquear la ruta mientras se hace el corte
  select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='liquidate_route';
  o := d;
  d := replace(d, 'select * into r from collection_routes where id = p_route and deleted_at is null;', 'select * into r from collection_routes where id = p_route and deleted_at is null for no key update;');
  if d = o then raise exception 'liquidate_route: no se pudo aplicar'; end if;
  execute d;

  -- 3) register_payment: el turno de caja se bloquea en modo compartido; close_shift lo bloquea exclusivo
  select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='register_payment';
  o := d;
  d := replace(d,
    E'if not exists (select 1 from register_shifts s where s.id = p_shift and s.cashier_id = auth.uid()\n                     and s.status = ''open'' and s.branch_id = c.branch_id) then\n      raise exception ''Necesita un turno de caja abierto propio en esta sucursal'';\n    end if;',
    E'perform 1 from register_shifts s where s.id = p_shift and s.cashier_id = auth.uid()\n                     and s.status = ''open'' and s.branch_id = c.branch_id for share;\n    if not found then\n      raise exception ''Necesita un turno de caja abierto propio en esta sucursal'';\n    end if;');
  if d = o then raise exception 'register_payment: no se pudo aplicar'; end if;
  execute d;
end $$;
