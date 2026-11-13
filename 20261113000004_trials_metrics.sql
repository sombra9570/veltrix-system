-- =====================================================================
-- Veltrix · Prueba gratis de 14 días + métricas de la consola superadmin
-- =====================================================================

-- 1. Fecha de fin de prueba en cada organización
alter table organizations add column if not exists trial_ends_at timestamptz;

-- Organizaciones ya creadas que nunca pagaron: también reciben su prueba
update organizations o
   set trial_ends_at = o.created_at + interval '14 days',
       next_billing_date = (o.created_at + interval '14 days')::date
 where o.trial_ends_at is null
   and not exists (select 1 from subscription_events e where e.org_id = o.id and e.status = 'paid');

-- 2. El dueño no puede alargarse la prueba a sí mismo
create or replace function guard_org_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not is_platform_admin() and
     (new.subscription_status, new.plan_id, new.next_billing_date, new.grace_ends_at,
      new.payment_method_token, new.trial_ends_at)
     is distinct from
     (old.subscription_status, old.plan_id, old.next_billing_date, old.grace_ends_at,
      old.payment_method_token, old.trial_ends_at) then
    raise exception 'Los datos de suscripción solo los cambia la pasarela de pago';
  end if;
  return new;
end $$;

-- 3. Toda organización nueva arranca con 14 días de prueba.
--    Al vencer sin pago, process_subscriptions la pasa a gracia (7 días) y luego a suspendida.
create or replace function create_organization(
  p_org_name text, p_billing_email text, p_plan_code text, p_full_name text,
  p_legal_name text, p_country char(2), p_currency char(3), p_tax_id text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_plan uuid;
begin
  if auth.uid() is null then raise exception 'Debe iniciar sesión'; end if;
  if exists (select 1 from profiles where id = auth.uid() and org_id is not null) then
    raise exception 'Este usuario ya pertenece a una organización';
  end if;
  select id into v_plan from plans where code = p_plan_code and is_active;
  if v_plan is null then raise exception 'Plan inexistente'; end if;

  insert into organizations (name, billing_email, plan_id, trial_ends_at, next_billing_date)
  values (p_org_name, p_billing_email, v_plan, now() + interval '14 days', (current_date + 14))
  returning id into v_org;

  insert into profiles (id, org_id, full_name) values (auth.uid(), v_org, p_full_name)
  on conflict (id) do update set org_id = excluded.org_id, full_name = excluded.full_name;

  insert into memberships (org_id, user_id, role, created_by) values (v_org, auth.uid(), 'owner', auth.uid());
  insert into companies (org_id, legal_name, tax_id, country_code, base_currency, created_by)
  values (v_org, p_legal_name, p_tax_id, p_country, p_currency, auth.uid());
  return v_org;
end $$;

-- 4. Métricas para la consola superadmin (solo platform_admins).
--    Nunca expone datos operativos de las empresas: solo suscripción.
create or replace function platform_metrics() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v jsonb;
begin
  if not is_platform_admin() then raise exception 'Solo el superadmin'; end if;

  with o as (
    select o.*, p.price_usd, p.name as plan_name,
           exists (select 1 from subscription_events e where e.org_id = o.id and e.status = 'paid') as ever_paid,
           case
             when o.subscription_status = 'suspended'      then 'suspended'
             when o.subscription_status = 'past_due_grace' then 'grace'
             when o.trial_ends_at > now()
                  and not exists (select 1 from subscription_events e where e.org_id = o.id and e.status = 'paid')
                                                           then 'trial'
             else 'paying'
           end as stage
      from organizations o join plans p on p.id = o.plan_id
     where o.deleted_at is null
  ),
  months as (
    select generate_series(date_trunc('month', now()) - interval '11 months',
                           date_trunc('month', now()), interval '1 month') as m
  )
  select jsonb_build_object(
    'generated_at', now(),
    'funnel', jsonb_build_object(
      'total',     (select count(*) from o),
      'trial',     (select count(*) from o where stage = 'trial'),
      'paying',    (select count(*) from o where stage = 'paying'),
      'grace',     (select count(*) from o where stage = 'grace'),
      'suspended', (select count(*) from o where stage = 'suspended')
    ),
    'mrr_usd', (select coalesce(sum(price_usd), 0) from o where stage = 'paying'),
    'conversion', jsonb_build_object(
      'trials_finished', (select count(*) from o where trial_ends_at <= now()),
      'converted',       (select count(*) from o where trial_ends_at <= now() and ever_paid)
    ),
    'churn_30d', (select count(*) from o where stage = 'suspended' and updated_at > now() - interval '30 days'),
    'trials_expiring', coalesce((
      select jsonb_agg(jsonb_build_object(
               'org_id', id, 'name', name, 'email', billing_email, 'plan', plan_name,
               'trial_ends_at', trial_ends_at,
               'days_left', greatest(0, ceil(extract(epoch from (trial_ends_at - now())) / 86400))::int)
             order by trial_ends_at)
        from o where stage = 'trial'), '[]'::jsonb),
    'organizations', coalesce((
      select jsonb_agg(jsonb_build_object(
               'org_id', id, 'name', name, 'email', billing_email, 'plan', plan_name,
               'price_usd', price_usd, 'stage', stage, 'created_at', created_at,
               'trial_ends_at', trial_ends_at, 'next_billing_date', next_billing_date)
             order by created_at desc)
        from o), '[]'::jsonb),
    'growth', (
      select jsonb_agg(jsonb_build_object(
               'month', to_char(m, 'YYYY-MM'),
               'new_orgs', (select count(*) from organizations x
                             where x.deleted_at is null and date_trunc('month', x.created_at) = m),
               'revenue_usd', (select coalesce(sum(e.amount_usd), 0) from subscription_events e
                                where e.status = 'paid' and date_trunc('month', e.created_at) = m))
             order by m)
        from months)
  ) into v;
  return v;
end $$;

revoke all on function platform_metrics() from public, anon;
grant execute on function platform_metrics() to authenticated;

-- 5. Revisión automática de suscripciones cada hora (prueba → gracia → suspendida)
create extension if not exists pg_cron;
select cron.schedule('veltrix-subs', '0 * * * *', 'select public.process_subscriptions()');
