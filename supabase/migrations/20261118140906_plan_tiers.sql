update plans set max_users = 2,  max_branches = 1 where code = 'basic';
update plans set max_users = 6,  max_branches = 1 where code = 'starter';
update plans set max_users = 15, max_branches = 2 where code = 'pro';
update plans set max_users = 30, max_branches = 3 where code = 'enterprise';
update plans set max_users = 50, max_branches = 5 where code = 'enterprise_plus';

create or replace function public.plan_addon_cap(p_plan text, p_code text)
returns integer language sql immutable set search_path to 'public' as $$
  select case p_code
    when 'user'   then case p_plan when 'starter' then 1 when 'pro' then 3 when 'enterprise' then 5 when 'enterprise_plus' then 15 else 0 end
    when 'branch' then case p_plan when 'enterprise' then 1 when 'enterprise_plus' then 2 else 0 end
    else null end;
$$;

create or replace function public.plan_addon_price(p_plan text, p_code text, p_latam boolean)
returns numeric language sql stable security definer set search_path to 'public' as $$
  select case
    when p_code = 'user' and pl.max_users > 0
      then ceil(((case when p_latam then pl.price_usd else coalesce(pl.price_global_usd, pl.price_usd) end) / pl.max_users + 2) * 100) / 100
    when p_code = 'branch' and pl.max_branches > 0
      then ceil(((case when p_latam then pl.price_usd else coalesce(pl.price_global_usd, pl.price_usd) end) / pl.max_branches + 2) * 100) / 100
    else null end
  from plans pl where pl.code = p_plan;
$$;

create or replace function public.addon_cap(p_org uuid, p_code text, p_default integer)
returns integer language sql stable security definer set search_path to 'public' as $$
  select case when p_code = 'storage' then p_default
              else least(p_default, coalesce(plan_addon_cap(pl.code, p_code), 0)) end
  from organizations o left join plans pl on pl.id = o.plan_id where o.id = p_org;
$$;

create or replace function public.addon_price(p_org uuid, p_code text, p_latam boolean)
returns numeric language sql stable security definer set search_path to 'public' as $$
  select coalesce(
    (select plan_addon_price(pl.code, p_code, p_latam) from organizations o join plans pl on pl.id = o.plan_id where o.id = p_org),
    (select case when p_latam then a.price_usd else a.price_global_usd end from addons a where a.code = p_code));
$$;

create or replace function public.public_plans()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'code', code, 'name', name, 'price_usd', price_usd, 'price_global_usd', coalesce(price_global_usd, price_usd),
           'max_companies', max_companies, 'max_branches', max_branches, 'max_users', max_users,
           'max_storage_mb', max_storage_mb,
           'extra_user', jsonb_build_object('max', plan_addon_cap(code, 'user'),
                           'price_usd', plan_addon_price(code, 'user', true), 'price_global_usd', plan_addon_price(code, 'user', false)),
           'extra_branch', jsonb_build_object('max', plan_addon_cap(code, 'branch'),
                           'price_usd', plan_addon_price(code, 'branch', true), 'price_global_usd', plan_addon_price(code, 'branch', false)))
         order by price_usd), '[]'::jsonb)
    from plans where is_active;
$$;

delete from addon_plan_prices where addon_code in ('user', 'branch');

revoke all on function public.plan_addon_price(text, text, boolean) from public, anon;
revoke all on function public.plan_addon_cap(text, text) from public, anon;
grant execute on function public.plan_addon_price(text, text, boolean) to authenticated;
grant execute on function public.plan_addon_cap(text, text) to authenticated;
