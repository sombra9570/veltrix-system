-- Cobranza en calle y microfinanzas: sin escala de referidos. Un solo beneficio de 20 %,
-- una única vez, cuando el primer invitado paga usando el código. Después no hay más beneficios.
do $$
declare src text; src2 text;
begin
  select pg_get_functiondef(p.oid) into src from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='reward_referrer';
  src2 := replace(src, E'    if coalesce(v_new_price, 0) < coalesce(v_ref_price, 0) then',
E'    if exists (select 1 from organizations where id = v_ref and street_collectors is not null) then\n      if exists (select 1 from referral_rewards where referrer_org = v_ref and kind <> ''none'') then\n        insert into referral_rewards (referrer_org, referred_org, kind, value) values (v_ref, new.org_id, ''none'', 0)\n        on conflict (referred_org) do nothing;\n      else\n        update organizations set referral_credit_pct = greatest(referral_credit_pct, 20) where id = v_ref;\n        insert into referral_rewards (referrer_org, referred_org, kind, value) values (v_ref, new.org_id, ''discount'', 20)\n        on conflict (referred_org) do nothing;\n      end if;\n    elsif coalesce(v_new_price, 0) < coalesce(v_ref_price, 0) then');
  if src2 = src then raise exception 'reward_referrer no se pudo modificar'; end if;
  execute src2;

  select pg_get_functiondef(p.oid) into src from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='my_referrals';
  src2 := replace(src, '''next'', case when v_n = 0 then 15', '''next'', case when exists (select 1 from organizations where id = p_org and street_collectors is not null) then (case when v_n = 0 then 20 else 0 end) when v_n = 0 then 15');
  if src2 = src then raise exception 'my_referrals no se pudo modificar'; end if;
  execute src2;
end $$;
