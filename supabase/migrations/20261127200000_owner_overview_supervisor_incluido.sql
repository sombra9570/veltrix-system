-- owner_overview: supervisores permitidos en cobranza en calle = 1 por cada 4 cobradores, mínimo 1
do $$
declare src text; src2 text;
begin
  select pg_get_functiondef(p.oid) into src from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='owner_overview';
  src2 := replace(src, 'sc / per', 'greatest(1, ceil(sc::numeric / per)::int)');
  if src2 = src then raise exception 'owner_overview no se pudo modificar'; end if;
  execute src2;
end $$;
