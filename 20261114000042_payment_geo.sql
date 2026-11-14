-- 042: ubicación de cada cobro en calle + recorrido del día por ruta
-- Los cobros son inmutables (guard_payment_update), por eso la ubicación va en su propia tabla.

create table if not exists payment_geo (
  payment_id uuid primary key references payments(id) on delete cascade,
  org_id     uuid not null,
  lat        numeric(9,6) not null check (lat between -90 and 90),
  lng        numeric(9,6) not null check (lng between -180 and 180),
  created_at timestamptz not null default now()
);
alter table payment_geo enable row level security;  -- solo se lee/escribe por las funciones de abajo
revoke all on payment_geo from anon, authenticated;

-- El cobrador adjunta la ubicación a SU cobro (por el uuid offline), una sola vez
create or replace function public.set_payment_geo(p_offline_uuid uuid, p_lat numeric, p_lng numeric)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_pay payments%rowtype;
begin
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then return; end if;
  select * into v_pay from payments where offline_uuid = p_offline_uuid and collected_by = auth.uid();
  if not found then return; end if;
  insert into payment_geo (payment_id, org_id, lat, lng)
  values (v_pay.id, v_pay.org_id, round(p_lat, 6), round(p_lng, 6))
  on conflict (payment_id) do nothing;
end $$;

-- Recorrido de un día (zona horaria de la sucursal): cobros y visitas en orden, con ubicación si la hay
create or replace function public.route_trail(p_route uuid, p_day date default null)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare r collection_routes%rowtype; v_tz text; v_day date; v_from timestamptz; v_to timestamptz;
begin
  select * into r from collection_routes where id = p_route and deleted_at is null;
  if not found or not (r.collector_id = auth.uid() or branch_reader(r.branch_id) or has_branch_role(r.branch_id, '{supervisor}')) then
    raise exception 'ROUTE_NO_PERMISSION';
  end if;
  select coalesce(timezone, 'UTC') into v_tz from branches where id = r.branch_id;
  v_day := coalesce(p_day, (now() at time zone v_tz)::date);
  v_from := v_day::timestamp at time zone v_tz;
  v_to := (v_day + 1)::timestamp at time zone v_tz;
  return jsonb_build_object(
    'day', v_day, 'tz', v_tz,
    'points', coalesce((
      select jsonb_agg(x order by x->>'at') from (
        select jsonb_build_object('kind', 'payment', 'at', p.collected_at, 'customer', c.name, 'amount', p.amount,
                                  'method', p.method, 'lat', g.lat, 'lng', g.lng) x
          from payments p join customers c on c.id = p.customer_id
          left join payment_geo g on g.payment_id = p.id
         where p.route_id = r.id and p.collected_at >= v_from and p.collected_at < v_to
        union all
        select jsonb_build_object('kind', 'visit', 'at', v.visited_at, 'customer', c.name, 'result', v.result,
                                  'lat', v.gps_lat, 'lng', v.gps_lng)
          from visits v join customers c on c.id = v.customer_id
         where v.route_id = r.id and v.visited_at >= v_from and v.visited_at < v_to
      ) s), '[]'::jsonb)
  );
end $$;

revoke all on function public.set_payment_geo(uuid, numeric, numeric) from public, anon;
revoke all on function public.route_trail(uuid, date) from public, anon;
grant execute on function public.set_payment_geo(uuid, numeric, numeric) to authenticated;
grant execute on function public.route_trail(uuid, date) to authenticated;
