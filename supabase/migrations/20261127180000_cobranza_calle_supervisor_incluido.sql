-- Cobranza en calle y microfinanzas: la empresa nace con administrador + 1 cobrador + 1 supervisor.
-- Un supervisor por cada 4 cobradores (1-4 => 1, 5-8 => 2, 9-12 => 3...). El gerente sigue igual.
update street_plan set collectors_per_supervisor = 4, updated_at = now() where id;

do $$
declare src text; src2 text;
begin
  select pg_get_functiondef(p.oid) into src from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='enforce_street_limits';
  src2 := replace(src, 'used + 1 > sc / per then raise exception ''STREET_SUPERVISORS_LIMIT:%'', sc / per;', 'used + 1 > greatest(1, ceil(sc::numeric / per)::int) then raise exception ''STREET_SUPERVISORS_LIMIT:%'', greatest(1, ceil(sc::numeric / per)::int);');
  if src2 = src then raise exception 'enforce_street_limits no se pudo modificar'; end if;
  execute src2;

  select pg_get_functiondef(p.oid) into src from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='my_street_state';
  src2 := replace(src, '''supervisors_allowed'', o.street_collectors / c.collectors_per_supervisor', '''supervisors_allowed'', greatest(1, ceil(o.street_collectors::numeric / c.collectors_per_supervisor)::int)');
  if src2 = src then raise exception 'my_street_state no se pudo modificar'; end if;
  execute src2;
end $$;
