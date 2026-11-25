alter table organizations
  add column if not exists is_pilot boolean not null default false,
  add column if not exists founder_discount_pct int not null default 0
      check (founder_discount_pct between 0 and 90),
  add column if not exists founder_until date;

create or replace function guard_org_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not is_platform_admin() and
     (new.subscription_status, new.plan_id, new.next_billing_date, new.grace_ends_at,
      new.payment_method_token, new.trial_ends_at,
      new.extra_branches, new.extra_users, new.extra_storage_mb, new.ai_monthly_quota,
      new.is_pilot, new.founder_discount_pct, new.founder_until)
     is distinct from
     (old.subscription_status, old.plan_id, old.next_billing_date, old.grace_ends_at,
      old.payment_method_token, old.trial_ends_at,
      old.extra_branches, old.extra_users, old.extra_storage_mb, old.ai_monthly_quota,
      old.is_pilot, old.founder_discount_pct, old.founder_until) then
    raise exception 'Los datos de suscripción solo los cambia la pasarela de pago';
  end if;
  return new;
end $$;

create or replace function org_price_usd(p_org uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select round(p.price_usd *
           case when o.founder_until is not null and current_date < o.founder_until
                then (100 - o.founder_discount_pct) / 100.0 else 1 end, 2)
    from organizations o join plans p on p.id = o.plan_id where o.id = p_org;
$$;

create or replace function admin_set_pilot(p_org uuid, p_days int, p_discount_pct int default 50,
                                           p_founder_months int default 12)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_end date;
begin
  if not is_platform_admin() then raise exception 'Solo el superadmin'; end if;
  if p_days is null or p_days < 1 or p_days > 180 then raise exception 'PILOT_DAYS_INVALID'; end if;
  if coalesce(p_discount_pct, 0) not between 0 and 90 then raise exception 'PILOT_DISCOUNT_INVALID'; end if;
  if coalesce(p_founder_months, 0) not between 0 and 24 then raise exception 'PILOT_MONTHS_INVALID'; end if;
  v_end := current_date + p_days;
  update organizations
     set is_pilot = true,
         trial_ends_at = v_end::timestamp at time zone 'UTC',
         next_billing_date = v_end,
         subscription_status = 'active',
         grace_ends_at = null,
         founder_discount_pct = coalesce(p_discount_pct, 0),
         founder_until = case when coalesce(p_discount_pct, 0) > 0 and coalesce(p_founder_months, 0) > 0
                              then (v_end + make_interval(months => p_founder_months))::date end
   where id = p_org and deleted_at is null;
  if not found then raise exception 'Organización inexistente'; end if;
  return jsonb_build_object('pilot_ends', v_end,
    'founder_until', (select founder_until from organizations where id = p_org),
    'price_after', org_price_usd(p_org));
end $$;

create or replace function admin_clear_pilot(p_org uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'Solo el superadmin'; end if;
  update organizations set is_pilot = false, founder_discount_pct = 0, founder_until = null
   where id = p_org and deleted_at is null;
end $$;

create or replace function admin_record_payment(p_org uuid, p_amount numeric, p_months int default 1,
                                                p_ref text default null)
returns date
language plpgsql security definer set search_path = public as $$
declare o organizations%rowtype; v_start date; v_end date;
begin
  if not is_platform_admin() then raise exception 'Solo el superadmin'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'PAYMENT_AMOUNT_INVALID'; end if;
  if p_months is null or p_months < 1 or p_months > 24 then raise exception 'PAYMENT_MONTHS_INVALID'; end if;
  select * into o from organizations where id = p_org and deleted_at is null for update;
  if not found then raise exception 'Organización inexistente'; end if;
  v_start := greatest(coalesce(o.next_billing_date, current_date), current_date);
  v_end := (v_start + make_interval(months => p_months))::date;
  insert into subscription_events (org_id, gateway, gateway_ref, amount_usd, status, period_start, period_end)
  values (p_org, 'manual', coalesce(nullif(trim(p_ref), ''), gen_random_uuid()::text),
          round(p_amount, 2), 'paid', v_start, v_end);
  update organizations set is_pilot = false where id = p_org;
  return v_end;
end $$;

create or replace function owner_overview(p_org uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v jsonb; l record;
begin
  if not (is_org_owner(p_org) or is_platform_admin()) then raise exception 'Sin permiso'; end if;
  select * into l from org_limits(p_org);

  select jsonb_build_object(
    'org', (select jsonb_build_object(
               'name', o.name, 'plan_code', p.code, 'plan_name', p.name, 'price_usd', p.price_usd,
               'status', o.subscription_status, 'trial_ends_at', o.trial_ends_at,
               'next_billing_date', o.next_billing_date, 'grace_ends_at', o.grace_ends_at,
               'is_pilot', o.is_pilot, 'founder_discount_pct', o.founder_discount_pct,
               'founder_until', o.founder_until, 'price_now', org_price_usd(o.id))
              from organizations o join plans p on p.id = o.plan_id where o.id = p_org),
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
end $$;

create or replace function admin_pilots() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'Solo el superadmin'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'org_id', o.id, 'name', o.name, 'plan', p.name, 'price_usd', p.price_usd,
             'price_now', org_price_usd(o.id), 'is_pilot', o.is_pilot,
             'pilot_ends', o.trial_ends_at, 'founder_discount_pct', o.founder_discount_pct,
             'founder_until', o.founder_until, 'next_billing_date', o.next_billing_date,
             'status', o.subscription_status,
             'last_payment', (select max(created_at) from subscription_events e
                               where e.org_id = o.id and e.status = 'paid'))
           order by o.is_pilot desc, o.created_at desc)
      from organizations o join plans p on p.id = o.plan_id where o.deleted_at is null), '[]'::jsonb);
end $$;

create or replace function platform_mrr_usd() returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(org_price_usd(o.id)), 0) from organizations o
   where o.deleted_at is null and o.subscription_status <> 'suspended'
     and exists (select 1 from subscription_events e where e.org_id = o.id and e.status = 'paid');
$$;

revoke execute on function org_price_usd(uuid), platform_mrr_usd() from public, anon, authenticated;
revoke execute on function admin_set_pilot(uuid, int, int, int), admin_clear_pilot(uuid),
  admin_record_payment(uuid, numeric, int, text), admin_pilots() from public, anon;
grant execute on function admin_set_pilot(uuid, int, int, int), admin_clear_pilot(uuid),
  admin_record_payment(uuid, numeric, int, text), admin_pilots() to authenticated;
grant execute on function org_price_usd(uuid), platform_mrr_usd(), admin_set_pilot(uuid, int, int, int),
  admin_clear_pilot(uuid), admin_record_payment(uuid, numeric, int, text), admin_pilots() to service_role;

do $$
declare d text;
begin
  d := pg_get_functiondef('platform_metrics'::regproc);
  d := replace(d, '''mrr_usd'', (select coalesce(sum(price_usd), 0) from o where stage = ''paying'')',
                  '''mrr_usd'', platform_mrr_usd()');
  if position('platform_mrr_usd()' in d) = 0 then raise exception 'platform_metrics: no se encontró mrr_usd'; end if;
  execute d;
end $$;
