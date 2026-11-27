-- Solo la liquidación (cierre de caja manual) bloquea borrar cuotas, créditos y clientes.
-- El cierre diario automático es informativo y no bloquea.
create or replace function public.liquidated(p_route uuid, p_at timestamptz)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select p_route is not null and p_at is not null
     and exists (select 1 from route_liquidations rl where rl.route_id = p_route and rl.created_at >= p_at);
$$;

do $$
declare f text; src text;
begin
  foreach f in array array['collector_delete_installment','collector_delete_credit','cancel_street_loan','collector_delete_customer'] loop
    select pg_get_functiondef(p.oid) into src from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = f;
    src := replace(src, 'period_closed(p.shift_id, p.settlement_id)', 'liquidated(p.route_id, p.collected_at)');
    src := replace(src, 'period_closed(m.shift_id, m.settlement_id)', 'liquidated(m.route_id, m.created_at)');
    src := replace(src, 'period_closed(pp.shift_id, pp.settlement_id)', 'liquidated(pp.route_id, pp.collected_at)');
    if src like '%period_closed%' then raise exception 'quedó period_closed en %', f; end if;
    execute src;
  end loop;
end $$;

drop function public.period_closed(uuid, uuid);
