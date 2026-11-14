-- =====================================================================
-- Veltrix · Paddle: el aviso de pago también vincula la suscripción a la empresa
-- (por si el aviso del pago llega antes que el de la suscripción).
-- =====================================================================
do $$
declare d text;
begin
  d := pg_get_functiondef('billing_apply(text,text,uuid,text,jsonb)'::regprocedure);
  if position('-- vincula suscripción' in d) = 0 then
    d := replace(d,
      'elsif p_event in (''subscription_payment_success'', ''subscription_payment_recovered'') then',
      'elsif p_event in (''subscription_payment_success'', ''subscription_payment_recovered'') then
    -- vincula suscripción
    update organizations set billing_provider = p_provider,
           billing_subscription_id = coalesce(billing_subscription_id, v_sub), is_pilot = false
     where id = v_org;');
    if position('-- vincula suscripción' in d) = 0 then raise exception 'billing_apply: no se pudo aplicar'; end if;
    execute d;
  end if;
end $$;
