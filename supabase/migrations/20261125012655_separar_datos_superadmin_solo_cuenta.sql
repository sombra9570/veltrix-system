do $$
declare r record; def text; newdef text;
begin
  for r in
    select p.oid, p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('loans_admin','route_customers_admin','route_funds_admin','liquidations_admin','supervisor_reports_admin','business_growth','route_growth','owner_overview','owner_routes','owner_supervisors')
  loop
    def := pg_get_functiondef(r.oid);
    newdef := replace(replace(def, ' or is_platform_admin()', ''), ' OR is_platform_admin()', '');
    if newdef = def then raise exception 'Sin cambio en %', r.proname; end if;
    if newdef ilike '%is_platform_admin%' then raise exception 'Queda referencia en %', r.proname; end if;
    execute newdef;
  end loop;
end $$;

create or replace function public.has_support_grant(p_org uuid)
returns boolean language sql stable security definer set search_path to 'public'
as $$ select false $$;
