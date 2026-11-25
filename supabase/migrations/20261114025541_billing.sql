alter table plans add column if not exists price_global_usd numeric(10,2);
update plans set price_global_usd = case code when 'starter' then 29 when 'pro' then 59 when 'enterprise' then 199 end
 where price_global_usd is null;

alter table organizations
  add column if not exists billing_provider        text,
  add column if not exists billing_customer_id     text,
  add column if not exists billing_subscription_id text,
  add column if not exists billing_portal_url      text,
  add column if not exists billing_cancel_at       timestamptz;
create unique index if not exists organizations_billing_sub on organizations(billing_subscription_id)
  where billing_subscription_id is not null;

alter table subscription_events drop constraint if exists subscription_events_gateway_check;
alter table subscription_events add constraint subscription_events_gateway_check
  check (gateway in ('qr','card','manual','lemonsqueezy','paddle'));

create or replace function guard_org_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not is_platform_admin() and
     (new.subscription_status, new.plan_id, new.next_billing_date, new.grace_ends_at,
      new.payment_method_token, new.trial_ends_at,
      new.extra_branches, new.extra_users, new.extra_storage_mb, new.ai_monthly_quota,
      new.is_pilot, new.founder_discount_pct, new.founder_until,
      new.billing_provider, new.billing_customer_id, new.billing_subscription_id, new.billing_portal_url,
      new.billing_cancel_at)
     is distinct from
     (old.subscription_status, old.plan_id, old.next_billing_date, old.grace_ends_at,
      old.payment_method_token, old.trial_ends_at,
      old.extra_branches, old.extra_users, old.extra_storage_mb, old.ai_monthly_quota,
      old.is_pilot, old.founder_discount_pct, old.founder_until,
      old.billing_provider, old.billing_customer_id, old.billing_subscription_id, old.billing_portal_url,
      old.billing_cancel_at) then
    raise exception 'Los datos de suscripción solo los cambia la pasarela de pago';
  end if;
  return new;
end $$;

create or replace function org_is_latam(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select c.country_code in ('BO','MX','CO','AR','CL','PE','BR','EC','PY','UY','VE','GT','HN','SV','NI',
                              'CR','PA','DO','PR','CU')
      from companies c where c.org_id = p_org and c.deleted_at is null order by c.created_at limit 1), true);
$$;

create or replace function plan_price_for(p_plan uuid, p_org uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select case when org_is_latam(p_org) then p.price_usd else coalesce(p.price_global_usd, p.price_usd) end
    from plans p where p.id = p_plan;
$$;

create or replace function org_price_usd(p_org uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select round(plan_price_for(o.plan_id, o.id) *
           case when o.founder_until is not null and current_date < o.founder_until
                then (100 - o.founder_discount_pct) / 100.0 else 1 end, 2)
    from organizations o where o.id = p_org;
$$;

create or replace function my_billing(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare o organizations%rowtype; v_latam boolean;
begin
  if not (is_org_owner(p_org) or is_platform_admin()) then raise exception 'Sin permiso'; end if;
  select * into o from organizations where id = p_org;
  v_latam := org_is_latam(p_org);
  return jsonb_build_object(
    'plan_code', (select code from plans where id = o.plan_id),
    'status', o.subscription_status,
    'region', case when v_latam then 'latam' else 'global' end,
    'price_now', org_price_usd(p_org),
    'trial_ends_at', o.trial_ends_at,
    'next_billing_date', o.next_billing_date,
    'grace_ends_at', o.grace_ends_at,
    'is_pilot', o.is_pilot,
    'founder_discount_pct', o.founder_discount_pct,
    'founder_until', o.founder_until,
    'founder_active', o.founder_until is not null and current_date < o.founder_until,
    'subscribed', o.billing_subscription_id is not null,
    'portal_url', o.billing_portal_url,
    'cancel_at', o.billing_cancel_at,
    'billing_email', o.billing_email,
    'plans', (select coalesce(jsonb_agg(jsonb_build_object(
                'code', p.code, 'name', p.name,
                'price', case when v_latam then p.price_usd else coalesce(p.price_global_usd, p.price_usd) end,
                'max_branches', p.max_branches, 'max_users', p.max_users, 'max_companies', p.max_companies,
                'max_storage_mb', p.max_storage_mb, 'max_store_products', p.max_store_products)
                order by p.price_usd), '[]'::jsonb) from plans p where p.is_active),
    'history', (select coalesce(jsonb_agg(jsonb_build_object(
                  'at', e.created_at, 'amount', e.amount_usd, 'status', e.status, 'gateway', e.gateway,
                  'period_end', e.period_end) order by e.created_at desc), '[]'::jsonb)
                  from (select * from subscription_events where org_id = p_org order by created_at desc limit 24) e)
  );
end $$;

create or replace function billing_apply(p_provider text, p_event text, p_org uuid, p_plan_code text, p_data jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_org uuid := p_org; v_status text := p_data->>'status'; v_plan uuid;
        v_renews date := nullif(p_data->>'renews_at', '')::timestamptz::date;
        v_ends timestamptz := nullif(p_data->>'ends_at', '')::timestamptz;
        v_sub text := nullif(p_data->>'subscription_id', '');
begin
  if v_org is null and v_sub is not null then
    select id into v_org from organizations where billing_subscription_id = v_sub;
  end if;
  if v_org is null or not exists (select 1 from organizations where id = v_org) then
    raise exception 'BILLING_ORG_NOT_FOUND';
  end if;
  if p_plan_code is not null then select id into v_plan from plans where code = p_plan_code; end if;

  if p_event like 'subscription\_%' and p_event not like 'subscription\_payment\_%' then
    update organizations
       set billing_provider = p_provider,
           billing_subscription_id = coalesce(v_sub, billing_subscription_id),
           billing_customer_id = coalesce(nullif(p_data->>'customer_id', ''), billing_customer_id),
           billing_portal_url = coalesce(nullif(p_data->>'portal_url', ''), billing_portal_url),
           plan_id = coalesce(v_plan, plan_id),
           is_pilot = false,
           billing_cancel_at = case when v_status = 'cancelled' then v_ends else null end
     where id = v_org;

    if v_status in ('active', 'on_trial') then
      update organizations set subscription_status = 'active', grace_ends_at = null,
             next_billing_date = coalesce(v_renews, next_billing_date)
       where id = v_org;
    elsif v_status = 'past_due' then
      update organizations set subscription_status = 'past_due_grace',
             grace_ends_at = coalesce(grace_ends_at, now() + interval '7 days')
       where id = v_org and subscription_status <> 'suspended';
    elsif v_status = 'cancelled' then
      update organizations set next_billing_date = coalesce(v_ends::date, next_billing_date) where id = v_org;
    elsif v_status in ('expired', 'unpaid', 'paused') then
      update organizations set subscription_status = 'suspended' where id = v_org;
    end if;

  elsif p_event in ('subscription_payment_success', 'subscription_payment_recovered') then
    insert into subscription_events (org_id, gateway, gateway_ref, amount_usd, status, period_start, period_end)
    values (v_org, p_provider, p_data->>'invoice_id', coalesce((p_data->>'amount_usd')::numeric, 0), 'paid',
            current_date,
            coalesce(v_renews, (select case when next_billing_date > current_date then next_billing_date
                                            else (current_date + interval '1 month')::date end
                                  from organizations where id = v_org)))
    on conflict (gateway, gateway_ref) do nothing;

  elsif p_event = 'subscription_payment_failed' then
    insert into subscription_events (org_id, gateway, gateway_ref, amount_usd, status)
    values (v_org, p_provider, p_data->>'invoice_id', coalesce((p_data->>'amount_usd')::numeric, 0), 'failed')
    on conflict (gateway, gateway_ref) do nothing;
    update organizations set subscription_status = 'past_due_grace',
           grace_ends_at = coalesce(grace_ends_at, now() + interval '7 days')
     where id = v_org and subscription_status = 'active';

  elsif p_event = 'subscription_payment_refunded' then
    insert into subscription_events (org_id, gateway, gateway_ref, amount_usd, status)
    values (v_org, p_provider, coalesce(p_data->>'invoice_id', '') || ':refund',
            coalesce((p_data->>'amount_usd')::numeric, 0), 'refunded')
    on conflict (gateway, gateway_ref) do nothing;
  end if;
  return v_org;
end $$;

revoke execute on function org_is_latam(uuid), plan_price_for(uuid, uuid), billing_apply(text, text, uuid, text, jsonb)
  from public, anon, authenticated;
revoke execute on function my_billing(uuid) from public, anon;
grant execute on function my_billing(uuid) to authenticated;
grant execute on function org_is_latam(uuid), plan_price_for(uuid, uuid), org_price_usd(uuid), my_billing(uuid),
  billing_apply(text, text, uuid, text, jsonb) to service_role;
