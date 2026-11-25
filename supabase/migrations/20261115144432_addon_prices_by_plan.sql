-- Precio de cada extra según el plan (una sucursal completa no vale lo mismo que un lugar de trabajador)
create table if not exists addon_plan_prices (
  plan_code text not null,
  addon_code text not null,
  price_usd numeric(10,2) not null check (price_usd >= 0),
  price_global_usd numeric(10,2) not null check (price_global_usd >= 0),
  primary key (plan_code, addon_code)
);
alter table addon_plan_prices enable row level security;
revoke all on addon_plan_prices from anon, authenticated;

-- Base (lo más bajo, Enterprise Plus) y precio propio de Enterprise para la sucursal
update addons set price_usd = 3.50, price_global_usd = 5.50 where code = 'user';
update addons set price_usd = 15, price_global_usd = 24 where code = 'branch';
insert into addon_plan_prices values ('enterprise', 'branch', 19, 29)
on conflict (plan_code, addon_code) do update set price_usd = excluded.price_usd, price_global_usd = excluded.price_global_usd;

create or replace function public.addon_price(p_org uuid, p_code text, p_latam boolean)
returns numeric language sql stable security definer set search_path to 'public' as $$
  select coalesce(
    (select case when p_latam then x.price_usd else x.price_global_usd end
       from addon_plan_prices x join plans pl on pl.code = x.plan_code join organizations o on o.plan_id = pl.id
      where o.id = p_org and x.addon_code = p_code),
    (select case when p_latam then a.price_usd else a.price_global_usd end from addons a where a.code = p_code));
$$;
revoke all on function public.addon_price(uuid, text, boolean) from public, anon, authenticated;

do $$
declare def text; nd text;
begin
  def := pg_get_functiondef('public.my_addons(uuid)'::regprocedure);
  nd := regexp_replace(def, '''price'',\s*case when v_latam then a\.price_usd else a\.price_global_usd end', '''price'', addon_price(p_org, a.code, v_latam)');
  if nd = def then raise exception 'my_addons: patrón no encontrado'; end if;
  execute nd;

  def := pg_get_functiondef('public.org_addons_usd(uuid)'::regprocedure);
  nd := regexp_replace(def, 'case when org_is_latam\(o\.id\) then a\.price_usd else a\.price_global_usd end', 'addon_price(o.id, a.code, org_is_latam(o.id))');
  if nd = def then raise exception 'org_addons_usd: patrón no encontrado'; end if;
  execute nd;
end $$;
