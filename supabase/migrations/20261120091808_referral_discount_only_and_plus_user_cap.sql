create or replace function public.plan_addon_cap(p_plan text, p_code text)
returns integer language sql immutable set search_path to 'public' as $$
  select case p_code
    when 'user'   then case p_plan when 'starter' then 1 when 'pro' then 3 when 'enterprise' then 5 when 'enterprise_plus' then 25 else 0 end
    when 'branch' then case p_plan when 'enterprise' then 1 when 'enterprise_plus' then 2 else 0 end
    else null end;
$$;

create or replace function public.reward_referrer()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_ref uuid; v_n int; v_pct int; v_ref_price numeric; v_new_price numeric;
begin
  if new.status <> 'paid' then return new; end if;
  perform set_config('veltrix.billing', 'on', true);

  if new.gateway in ('manual', 'qr', 'card') then
    update organizations set referral_credit_pct = 0 where id = new.org_id and referral_credit_pct > 0;
  end if;

  select referred_by into v_ref from organizations where id = new.org_id and referral_rewarded_at is null;
  if v_ref is not null then
    update organizations set referral_rewarded_at = now() where id = new.org_id;
    select p.price_usd into v_ref_price from organizations o join plans p on p.id = o.plan_id where o.id = v_ref;
    select p.price_usd into v_new_price from organizations o join plans p on p.id = o.plan_id where o.id = new.org_id;

    if coalesce(v_new_price, 0) < coalesce(v_ref_price, 0) then
      insert into referral_rewards (referrer_org, referred_org, kind, value) values (v_ref, new.org_id, 'none', 0)
      on conflict (referred_org) do nothing;
    else
      select count(*) + 1 into v_n from referral_rewards where referrer_org = v_ref and kind <> 'none';
      -- Solo descuentos: 15 %, 20 % y 30 % (del 4.º en adelante también 30 %). Sin usuarios ni roles de regalo.
      v_pct := case v_n when 1 then 15 when 2 then 20 else 30 end;
      update organizations set referral_credit_pct = greatest(referral_credit_pct, v_pct) where id = v_ref;
      insert into referral_rewards (referrer_org, referred_org, kind, value) values (v_ref, new.org_id, 'discount', v_pct)
      on conflict (referred_org) do nothing;
    end if;
  end if;

  perform set_config('veltrix.billing', 'off', true);
  return new;
end $$;
