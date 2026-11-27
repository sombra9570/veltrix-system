-- owner_overview: informa desde qué cobrador se puede activar el gerente en cobranza en calle.
do $$
declare src text; src2 text;
begin
  select pg_get_functiondef(p.oid) into src from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='owner_overview';
  src2 := replace(src, '''supervisors'', jsonb_build_object(''used'', us, ''max'', greatest(1, ceil(sc::numeric / per)::int))) end,',
    '''supervisors'', jsonb_build_object(''used'', us, ''max'', greatest(1, ceil(sc::numeric / per)::int)),
               ''manager_min'', (select manager_after_collectors + 1 from street_plan where id),
               ''manager_ok'', sc > (select manager_after_collectors from street_plan where id)) end,');
  if src2 = src then raise exception 'owner_overview'; end if;
  execute src2;
end $$;
