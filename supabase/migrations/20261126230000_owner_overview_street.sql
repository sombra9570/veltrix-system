-- Resumen del administrador: si la empresa es de cobranza en calle, trae su contratación (cobradores y supervisores) para mostrarla en lugar de un plan general
create or replace function public.owner_overview(p_org uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare v jsonb; l record; sc int; per int; uc int; us int;
begin
  if not (is_org_owner(p_org)) then raise exception 'Sin permiso'; end if;
  select * into l from org_limits(p_org);
  select street_collectors into sc from organizations where id = p_org;
  if sc is not null then
    select collectors_per_supervisor into per from street_plan where id;
    select count(*) filter (where role = 'collector'), count(*) filter (where role = 'supervisor') into uc, us
      from memberships where org_id = p_org and is_active and deleted_at is null;
  end if;

  select jsonb_build_object(
    'org', (select jsonb_build_object(
               'name', o.name, 'plan_code', p.code, 'plan_name', p.name, 'price_usd', p.price_usd,
               'status', o.subscription_status, 'trial_ends_at', o.trial_ends_at,
               'next_billing_date', o.next_billing_date, 'grace_ends_at', o.grace_ends_at,
               'is_pilot', o.is_pilot, 'founder_discount_pct', o.founder_discount_pct,
               'founder_until', o.founder_until, 'price_now', org_price_usd(o.id))
              from organizations o join plans p on p.id = o.plan_id where o.id = p_org),
    'street', case when sc is null then null else jsonb_build_object(
               'collectors', jsonb_build_object('used', uc, 'max', sc),
               'supervisors', jsonb_build_object('used', us, 'max', sc / per)) end,
    'usage', jsonb_build_object(
       'companies', jsonb_build_object('used', l.used_companies, 'max', l.max_companies),
       'branches',  jsonb_build_object('used', l.used_branches,  'max', l.max_branches),
       'users',     jsonb_build_object('used', l.used_users,     'max', l.max_users),
       'storage_mb', jsonb_build_object('used', org_storage_mb(p_org), 'max', l.max_storage_mb)),
    'today', coalesce((
       select jsonb_agg(jsonb_build_object('currency', x.currency, 'amount', x.amount, 'count', x.cnt))
         from (select pm.currency, sum(pm.amount) as amount, count(*) filter (where pm.amount > 0) as cnt
                 from payments pm join branches b on b.id = pm.branch_id
                where pm.org_id = p_org
                  and (pm.collected_at at time zone b.timezone)::date = (now() at time zone b.timezone)::date
                group by pm.currency) x), '[]'::jsonb),
    'open_shifts', (select count(*) from register_shifts s where s.org_id = p_org and s.status = 'open'),
    'pending_reversals', (select count(*) from payment_reversals r where r.org_id = p_org and r.status = 'pending'),
    'pending_settlements', (select count(*) from route_settlements st
                             where st.org_id = p_org and st.status = 'pending_delivery')
  ) into v;
  return v;
end $function$;
