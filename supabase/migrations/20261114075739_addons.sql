create table if not exists addons (
  code             text primary key check (code in ('user', 'branch', 'storage')),
  price_usd        numeric(10,2) not null check (price_usd >= 0),
  price_global_usd numeric(10,2) not null check (price_global_usd >= 0),
  unit_mb          int not null default 0,
  max_units        int not null check (max_units between 0 and 500),
  is_active        boolean not null default true,
  updated_at       timestamptz not null default now()
);
alter table addons enable row level security;
insert into addons (code, price_usd, price_global_usd, unit_mb, max_units) values
  ('user', 3, 4, 0, 50), ('branch', 10, 15, 0, 20), ('storage', 3, 4, 5120, 20)
on conflict (code) do nothing;

alter table organizations
  add column if not exists addon_users         int not null default 0 check (addon_users >= 0),
  add column if not exists addon_branches      int not null default 0 check (addon_branches >= 0),
  add column if not exists addon_storage_units int not null default 0 check (addon_storage_units >= 0);

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
      new.referral_credit_pct, new.referral_bonus_users,
      new.addon_users, new.addon_branches, new.addon_storage_units)
     is distinct from
     (old.subscription_status, old.plan_id, old.next_billing_date, old.grace_ends_at,
      old.payment_method_token, old.trial_ends_at,
      old.extra_branches, old.extra_users, old.extra_storage_mb, old.ai_monthly_quota,
      old.is_pilot, old.founder_discount_pct, old.founder_until,
      old.billing_provider, old.billing_customer_id, old.billing_subscription_id, old.billing_portal_url,
      old.billing_cancel_at, old.referral_code, old.referred_by, old.referral_rewarded_at,
      old.referral_credit_pct, old.referral_bonus_users,
      old.addon_users, old.addon_branches, old.addon_storage_units) then
    raise exception 'Los datos de suscripción solo los cambia la pasarela de pago';
  end if;
  return new;
end $$;

create or replace function org_addons_usd(p_org uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(case a.code when 'user' then o.addon_users when 'branch' then o.addon_branches
                                  else o.addon_storage_units end
                      * case when org_is_latam(o.id) then a.price_usd else a.price_global_usd end), 0)
    from organizations o cross join addons a where o.id = p_org;
$$;

create or replace function org_price_usd(p_org uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select round(plan_price_for(o.plan_id, o.id)
           * case when o.founder_until is not null and current_date < o.founder_until
                  then (100 - o.founder_discount_pct) / 100.0 else 1 end
           * (100 - o.referral_credit_pct) / 100.0
           + org_addons_usd(o.id), 2)
    from organizations o where o.id = p_org;
$$;

create or replace function my_addons(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare o organizations%rowtype; v_latam boolean; l record;
begin
  if not (is_org_owner(p_org) or is_platform_admin()) then raise exception 'Sin permiso'; end if;
  select * into o from organizations where id = p_org;
  select * into l from org_limits(p_org);
  v_latam := org_is_latam(p_org);
  return jsonb_build_object(
    'items', (select coalesce(jsonb_agg(jsonb_build_object(
                'code', a.code, 'price', case when v_latam then a.price_usd else a.price_global_usd end,
                'unit_mb', a.unit_mb, 'max', a.max_units,
                'qty', case a.code when 'user' then o.addon_users when 'branch' then o.addon_branches else o.addon_storage_units end)
                order by array_position(array['user','branch','storage'], a.code)), '[]'::jsonb)
                from addons a where a.is_active),
    'monthly', org_addons_usd(p_org),
    'used', jsonb_build_object('users', l.used_users, 'branches', l.used_branches, 'storage_mb', org_storage_mb(p_org)),
    'limits', jsonb_build_object('users', l.max_users, 'branches', l.max_branches, 'storage_mb', l.max_storage_mb)
  );
end $$;

create or replace function set_my_addons(p_org uuid, p_users int, p_branches int, p_storage_units int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o organizations%rowtype; l record; v_max record;
begin
  if not is_org_owner(p_org) then raise exception 'Solo el dueño compra extras'; end if;
  if not org_writable(p_org) then raise exception 'Cuenta suspendida: solo lectura'; end if;
  select * into o from organizations where id = p_org for update;
  select max(max_units) filter (where code = 'user') as u, max(max_units) filter (where code = 'branch') as b,
         max(max_units) filter (where code = 'storage') as s,
         max(unit_mb) filter (where code = 'storage') as mb
    into v_max from addons where is_active;
  if p_users not between 0 and coalesce(v_max.u, 0) or p_branches not between 0 and coalesce(v_max.b, 0)
     or p_storage_units not between 0 and coalesce(v_max.s, 0) then
    raise exception 'ADDON_LIMIT';
  end if;

  perform set_config('veltrix.billing', 'on', true);
  update organizations
     set extra_users = greatest(extra_users - addon_users + p_users, 0),
         extra_branches = greatest(extra_branches - addon_branches + p_branches, 0),
         extra_storage_mb = greatest(extra_storage_mb + (p_storage_units - addon_storage_units) * coalesce(v_max.mb, 5120), 0),
         addon_users = p_users, addon_branches = p_branches, addon_storage_units = p_storage_units
   where id = p_org;
  perform set_config('veltrix.billing', 'off', true);

  select * into l from org_limits(p_org);
  if l.used_users > l.max_users then raise exception 'ADDON_IN_USE_USERS'; end if;
  if l.used_branches > l.max_branches then raise exception 'ADDON_IN_USE_BRANCHES'; end if;
  if org_storage_mb(p_org) > l.max_storage_mb then raise exception 'ADDON_IN_USE_STORAGE'; end if;

  insert into audit_log (org_id, table_name, row_id, action, actor_id, new_data)
  values (p_org, 'organizations', p_org, 'addons_changed', auth.uid(),
          jsonb_build_object('users', p_users, 'branches', p_branches, 'storage_units', p_storage_units));
  return my_addons(p_org);
end $$;

create or replace function admin_addons() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'Solo el superadmin'; end if;
  return (select coalesce(jsonb_agg(to_jsonb(a) order by array_position(array['user','branch','storage'], a.code)), '[]'::jsonb) from addons a);
end $$;

create or replace function admin_save_addon(p_code text, p_price_usd numeric, p_price_global_usd numeric, p_max_units int)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'Solo el superadmin'; end if;
  if p_price_usd < 0 or p_price_global_usd < 0 or p_max_units not between 0 and 500 then raise exception 'ADDON_INVALID'; end if;
  update addons set price_usd = round(p_price_usd, 2), price_global_usd = round(p_price_global_usd, 2),
         max_units = p_max_units, updated_at = now()
   where code = p_code;
  if not found then raise exception 'Extra inexistente'; end if;
end $$;

create or replace function public_addons() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('code', code, 'price_usd', price_usd, 'price_global_usd', price_global_usd,
                                               'unit_mb', unit_mb)), '[]'::jsonb)
    from addons where is_active;
$$;

do $$
declare d text;
begin
  d := pg_get_functiondef('my_billing(uuid)'::regprocedure);
  if position('addons_usd' in d) = 0 then
    d := replace(d, '''price_now'', org_price_usd(p_org),', '''price_now'', org_price_usd(p_org), ''addons_usd'', org_addons_usd(p_org),');
    if position('addons_usd' in d) = 0 then raise exception 'my_billing: no se pudo aplicar'; end if;
    execute d;
  end if;
end $$;

revoke execute on function org_addons_usd(uuid) from public, anon, authenticated;
revoke execute on function my_addons(uuid), set_my_addons(uuid, int, int, int), admin_addons(),
  admin_save_addon(text, numeric, numeric, int) from public, anon;
grant execute on function my_addons(uuid), set_my_addons(uuid, int, int, int), admin_addons(),
  admin_save_addon(text, numeric, numeric, int) to authenticated;
grant execute on function public_addons() to anon, authenticated;
grant execute on function org_addons_usd(uuid), my_addons(uuid), set_my_addons(uuid, int, int, int), admin_addons(),
  admin_save_addon(text, numeric, numeric, int), public_addons() to service_role;
