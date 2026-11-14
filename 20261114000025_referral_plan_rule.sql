-- =====================================================================
-- Veltrix · Referidos: el premio solo cuenta si el invitado elige un plan
-- igual o superior (por precio) al de quien lo invitó.
-- =====================================================================
alter table referral_rewards drop constraint if exists referral_rewards_kind_check;
alter table referral_rewards add constraint referral_rewards_kind_check check (kind in ('discount', 'user', 'month', 'none'));

create or replace function reward_referrer() returns trigger
language plpgsql security definer set search_path = public as $$
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
      -- Plan menor que el de quien invitó: queda registrado, sin premio
      insert into referral_rewards (referrer_org, referred_org, kind, value) values (v_ref, new.org_id, 'none', 0)
      on conflict (referred_org) do nothing;
    else
      select count(*) + 1 into v_n from referral_rewards where referrer_org = v_ref and kind <> 'none';
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
  end if;

  perform set_config('veltrix.billing', 'off', true);
  return new;
end $$;

-- Los premios logrados (sin contar los de plan menor)
do $$
declare d text;
begin
  d := pg_get_functiondef('my_referrals(uuid)'::regprocedure);
  if position('kind <> ''none''' in d) = 0 then
    d := replace(d, 'select count(*) into v_n from referral_rewards where referrer_org = p_org;',
                    'select count(*) into v_n from referral_rewards where referrer_org = p_org and kind <> ''none'';');
    if position('kind <> ''none''' in d) = 0 then raise exception 'my_referrals: no se pudo aplicar'; end if;
    execute d;
  end if;
end $$;
