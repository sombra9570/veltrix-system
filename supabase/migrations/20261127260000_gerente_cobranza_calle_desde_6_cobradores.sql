-- Gerente en cobranza en calle: solo desde el 6.º cobrador contratado, uno por empresa y sin costo.
do $$
declare src text; src2 text;
begin
  select pg_get_functiondef(p.oid) into src from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='enforce_street_limits';
  src2 := replace(src, 'declare sc int; per int; used int;', 'declare sc int; per int; used int; mgr int;');
  src2 := replace(src2, 'new.role not in (''collector'',''supervisor'')', 'new.role not in (''collector'',''supervisor'',''manager'')');
  src2 := replace(src2, 'select collectors_per_supervisor into per from street_plan where id;', 'select collectors_per_supervisor, manager_after_collectors into per, mgr from street_plan where id;');
  src2 := replace(src2, '  if new.role = ''collector'' and used + 1 > sc', '  if new.role = ''manager'' then
    if sc <= mgr then raise exception ''STREET_MANAGER_LOCKED:%'', mgr + 1; end if;
    if used + 1 > 1 then raise exception ''STREET_MANAGER_LIMIT''; end if;
    return new;
  end if;
  if new.role = ''collector'' and used + 1 > sc');
  if src2 = src or position('STREET_MANAGER_LOCKED' in src2) = 0 or position('mgr int' in src2) = 0 or position('''manager'')' in src2) = 0 then raise exception 'enforce_street_limits'; end if;
  execute src2;
end $$;
