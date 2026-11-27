-- Corte diario automático (informativo) a las 00:00 de cada sucursal; el único cierre real es la liquidación.
create or replace function public.auto_route_day_cuts()
returns integer language plpgsql security definer set search_path to 'public' as $$
declare r record; d jsonb; v_day date; n integer := 0;
begin
  for r in select cr.id, cr.org_id, cr.branch_id from collection_routes cr
            where cr.deleted_at is null and cr.is_active loop
    v_day := branch_today(r.branch_id) - 1;
    if exists (select 1 from route_day_cuts c where c.route_id = r.id and c.day = v_day) then continue; end if;
    select x into d from jsonb_array_elements(route_days(r.id, 62)) x where (x->>'day')::date = v_day;
    if d is null then continue; end if;
    insert into route_day_cuts (org_id, branch_id, route_id, day, collected_cash, collected_digital, lent, expenses, payments_n, cut_by)
    values (r.org_id, r.branch_id, r.id, v_day, coalesce((d->>'cash')::numeric, 0), coalesce((d->>'digital')::numeric, 0),
            coalesce((d->>'lent')::numeric, 0), coalesce((d->>'expenses')::numeric, 0), coalesce((d->>'payments')::int, 0), null)
    on conflict (route_id, day) do nothing;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.auto_route_day_cuts() from public, anon, authenticated;
select cron.schedule('auto_route_day_cuts', '5 * * * *', 'select public.auto_route_day_cuts()');

-- Cobranza en calle y microfinanzas: el cobrador no hace un cierre propio (solo existe la liquidación)
do $$
declare src text; src2 text;
begin
  select pg_get_functiondef(p.oid) into src from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='close_route';
  src2 := replace(src, E'  perform assert_route_open(p_route);\n', E'  perform assert_route_open(p_route);\n  if exists (select 1 from collection_routes cr join organizations o on o.id = cr.org_id where cr.id = p_route and o.street_collectors is not null) then\n    raise exception ''ROUTE_CLOSE_NOT_APPLICABLE'';\n  end if;\n');
  if src2 = src then raise exception 'close_route no se pudo modificar'; end if;
  execute src2;
end $$;
