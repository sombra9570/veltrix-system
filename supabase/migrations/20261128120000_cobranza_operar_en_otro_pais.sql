-- Cobranza en calle y microfinanzas: operar en otro país (otra empresa con su moneda y zona horaria) sin límite de empresas del plan; solo se paga por cobrador
do $$
declare src text; src2 text;
begin
  select pg_get_functiondef(p.oid) into src from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='enforce_plan_limits';
  src2 := replace(src, 'if tg_table_name = ''companies'' and l.max_companies is not null and l.used_companies >= l.max_companies then',
                       'if tg_table_name = ''companies'' and l.max_companies is not null and l.used_companies >= l.max_companies and not street_org(new.org_id) then');
  if src2 = src then raise exception 'enforce_plan_limits companies'; end if; execute src2;
end $$;
