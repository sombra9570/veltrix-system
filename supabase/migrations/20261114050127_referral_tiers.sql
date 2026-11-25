alter table organizations
  add column if not exists referral_credit_pct  int not null default 0 check (referral_credit_pct between 0 and 90),
  add column if not exists referral_bonus_users int not null default 0 check (referral_bonus_users between 0 and 5);
alter table referral_rewards
  add column if not exists kind  text not null default 'discount' check (kind in ('discount', 'user', 'month')),
  add column if not exists value int not null default 0;
alter table referral_rewards alter column months set default 0;

create or replace function guard_org_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if current_setting('veltrix.billing', true) = 'on' then return new; end if;
  if auth.uid() is not null and not is_platform_admin() and
     (new.subscription_status, new.plan_id, new.next_billing_date, new.grace_ends_at,
      new.payment_method_token, new.trial_ends_at,
      new.extra_branches, new.extra_users, new.extra_storage_mb, new.ai_monthly_quota,
      new.is_pilot, new.founder_discount_pct, new.founder_until,
      new.billing_provider, new.billing_customer_id, new.billing_subscription_id, new.billing_portal_url,
      new.billing_cancel_at, new.referral_code, new.referred_by, new.referral_rewarded_at,
      new.referral_credit_pct, new.referral_bonus_users)
     is distinct from
     (old.subscription_status, old.plan_id, old.next_billing_date, old.grace_ends_at,
      old.payment_method_token, old.trial_ends_at,
      old.extra_branches, old.extra_users, old.extra_storage_mb, old.ai_monthly_quota,
      old.is_pilot, old.founder_discount_pct, old.founder_until,
      old.billing_provider, old.billing_customer_id, old.billing_subscription_id, old.billing_portal_url,
      old.billing_cancel_at, old.referral_code, old.referred_by, old.referral_rewarded_at,
      old.referral_credit_pct, old.referral_bonus_users) then
    raise exception 'Los datos de suscripción solo los cambia la pasarela de pago';
  end if;
  return new;
end $$;

create or replace function org_price_usd(p_org uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select round(plan_price_for(o.plan_id, o.id)
           * case when o.founder_until is not null and current_date < o.founder_until
                  then (100 - o.founder_discount_pct) / 100.0 else 1 end
           * (100 - o.referral_credit_pct) / 100.0, 2)
    from organizations o where o.id = p_org;
$$;

create or replace function reward_referrer() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_ref uuid; v_n int; v_pct int;
begin
  if new.status <> 'paid' then return new; end if;
  perform set_config('veltrix.billing', 'on', true);

  if new.gateway in ('manual', 'qr', 'card') then
    update organizations set referral_credit_pct = 0 where id = new.org_id and referral_credit_pct > 0;
  end if;

  select referred_by into v_ref from organizations where id = new.org_id and referral_rewarded_at is null;
  if v_ref is not null then
    update organizations set referral_rewarded_at = now() where id = new.org_id;
    select count(*) + 1 into v_n from referral_rewards where referrer_org = v_ref;
    if v_n <= 3 then
      v_pct := case v_n when 1 then 15 when 2 then 20 else 30 end;
      update organizations set referral_credit_pct = greatest(referral_credit_pct, v_pct) where id = v_ref;
      insert into referral_rewards (referrer_org, referred_org, kind, value) values (v_ref, new.org_id, 'discount', v_pct)
      on conflict (referred_org) do nothing;
    else
      update organizations
         set referral_bonus_users = least(referral_bonus_users + 1, 5),
             extra_users = extra_users + case when referral_bonus_users < 5 then 1 else 0 end
       where id = v_ref;
      insert into referral_rewards (referrer_org, referred_org, kind, value) values (v_ref, new.org_id, 'user', 1)
      on conflict (referred_org) do nothing;
    end if;
  end if;

  perform set_config('veltrix.billing', 'off', true);
  return new;
end $$;

create or replace function my_referrals(p_org uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  if not is_org_owner(p_org) then raise exception 'Sin permiso'; end if;
  select count(*) into v_n from referral_rewards where referrer_org = p_org;
  return jsonb_build_object(
    'code', ensure_referral_code(p_org),
    'invited', (select count(*) from organizations where referred_by = p_org),
    'paying', v_n,
    'pending_pct', (select referral_credit_pct from organizations where id = p_org),
    'bonus_users', (select referral_bonus_users from organizations where id = p_org),
    'next', case when v_n = 0 then 15 when v_n = 1 then 20 when v_n = 2 then 30 else 0 end,
    'list', (select coalesce(jsonb_agg(jsonb_build_object(
               'joined', o.created_at, 'paying', o.referral_rewarded_at is not null,
               'kind', r.kind, 'value', r.value)
               order by o.created_at desc), '[]'::jsonb)
               from organizations o left join referral_rewards r on r.referred_org = o.id
              where o.referred_by = p_org)
  );
end $$;

do $$
declare d text;
begin
  d := pg_get_functiondef('my_billing(uuid)'::regprocedure);
  if position('referral_credit_pct' in d) = 0 then
    d := replace(d, '''founder_until'', o.founder_until,', '''founder_until'', o.founder_until, ''referral_credit_pct'', o.referral_credit_pct,');
    if position('referral_credit_pct' in d) = 0 then raise exception 'my_billing: no se pudo aplicar'; end if;
    execute d;
  end if;
end $$;

do $$
declare d text;
begin
  d := pg_get_functiondef('admin_pilots()'::regprocedure);
  if position('referral_credit_pct' in d) = 0 then
    d := replace(d, '''founder_until'', o.founder_until,', '''founder_until'', o.founder_until, ''referral_credit_pct'', o.referral_credit_pct,');
    if position('referral_credit_pct' in d) = 0 then raise exception 'admin_pilots: no se pudo aplicar'; end if;
    execute d;
  end if;
end $$;
