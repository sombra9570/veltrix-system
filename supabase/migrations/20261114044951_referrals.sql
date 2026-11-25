alter table organizations
  add column if not exists referral_code       text,
  add column if not exists referred_by         uuid references organizations(id),
  add column if not exists referral_rewarded_at timestamptz;
create unique index if not exists organizations_referral_code on organizations(referral_code) where referral_code is not null;

create table if not exists referral_rewards (
  id            uuid primary key default gen_random_uuid(),
  referrer_org  uuid not null references organizations(id) on delete cascade,
  referred_org  uuid not null references organizations(id) on delete cascade unique,
  months        int not null default 1,
  created_at    timestamptz not null default now()
);
alter table referral_rewards enable row level security;

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
      new.billing_cancel_at, new.referral_code, new.referred_by, new.referral_rewarded_at)
     is distinct from
     (old.subscription_status, old.plan_id, old.next_billing_date, old.grace_ends_at,
      old.payment_method_token, old.trial_ends_at,
      old.extra_branches, old.extra_users, old.extra_storage_mb, old.ai_monthly_quota,
      old.is_pilot, old.founder_discount_pct, old.founder_until,
      old.billing_provider, old.billing_customer_id, old.billing_subscription_id, old.billing_portal_url,
      old.billing_cancel_at, old.referral_code, old.referred_by, old.referral_rewarded_at) then
    raise exception 'Los datos de suscripción solo los cambia la pasarela de pago';
  end if;
  return new;
end $$;

create or replace function ensure_referral_code(p_org uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v text; v_try int := 0; chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  select referral_code into v from organizations where id = p_org;
  if v is not null then return v; end if;
  loop
    v_try := v_try + 1;
    v := '';
    for i in 1..6 loop v := v || substr(chars, 1 + floor(random() * length(chars))::int, 1); end loop;
    begin
      perform set_config('veltrix.billing', 'on', true);
      update organizations set referral_code = v where id = p_org and referral_code is null;
      perform set_config('veltrix.billing', 'off', true);
      return (select referral_code from organizations where id = p_org);
    exception when unique_violation then
      if v_try > 10 then raise; end if;
    end;
  end loop;
end $$;

create or replace function apply_referral(p_code text) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_ref uuid; o organizations%rowtype;
begin
  select org_id into v_org from profiles where id = auth.uid();
  if v_org is null or not is_org_owner(v_org) then return false; end if;
  select * into o from organizations where id = v_org;
  if o.referred_by is not null or o.created_at < now() - interval '2 days'
     or exists (select 1 from subscription_events where org_id = v_org and status = 'paid') then
    return false;
  end if;
  select id into v_ref from organizations
   where referral_code = upper(trim(coalesce(p_code, ''))) and deleted_at is null;
  if v_ref is null or v_ref = v_org then return false; end if;

  perform set_config('veltrix.billing', 'on', true);
  update organizations
     set referred_by = v_ref,
         trial_ends_at = greatest(coalesce(trial_ends_at, now()), created_at + interval '30 days'),
         next_billing_date = greatest(coalesce(next_billing_date, current_date), (created_at + interval '30 days')::date)
   where id = v_org;
  perform set_config('veltrix.billing', 'off', true);
  return true;
end $$;

create or replace function reward_referrer() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_ref uuid;
begin
  if new.status <> 'paid' then return new; end if;
  select referred_by into v_ref from organizations where id = new.org_id and referral_rewarded_at is null;
  if v_ref is null then return new; end if;
  perform set_config('veltrix.billing', 'on', true);
  update organizations set referral_rewarded_at = now() where id = new.org_id;
  update organizations
     set next_billing_date = (greatest(coalesce(next_billing_date, current_date), current_date) + interval '1 month')::date
   where id = v_ref and deleted_at is null;
  insert into referral_rewards (referrer_org, referred_org, months) values (v_ref, new.org_id, 1)
  on conflict (referred_org) do nothing;
  perform set_config('veltrix.billing', 'off', true);
  return new;
end $$;

drop trigger if exists subscription_events_referral on subscription_events;
create trigger subscription_events_referral after insert on subscription_events
  for each row execute function reward_referrer();

create or replace function my_referrals(p_org uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not is_org_owner(p_org) then raise exception 'Sin permiso'; end if;
  return jsonb_build_object(
    'code', ensure_referral_code(p_org),
    'invited', (select count(*) from organizations where referred_by = p_org),
    'paying', (select count(*) from organizations where referred_by = p_org and referral_rewarded_at is not null),
    'months', (select coalesce(sum(months), 0) from referral_rewards where referrer_org = p_org),
    'list', (select coalesce(jsonb_agg(jsonb_build_object(
               'joined', o.created_at, 'paying', o.referral_rewarded_at is not null, 'rewarded_at', o.referral_rewarded_at)
               order by o.created_at desc), '[]'::jsonb)
               from organizations o where o.referred_by = p_org)
  );
end $$;

create or replace function referral_valid(p_code text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from organizations where referral_code = upper(trim(coalesce(p_code, ''))) and deleted_at is null);
$$;

create or replace function clear_referred_by() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('veltrix.billing', 'on', true);
  update organizations set referred_by = null where referred_by = old.id;
  perform set_config('veltrix.billing', 'off', true);
  return old;
end $$;
drop trigger if exists organizations_clear_referred on organizations;
create trigger organizations_clear_referred before delete on organizations
  for each row execute function clear_referred_by();

revoke execute on function ensure_referral_code(uuid), reward_referrer(), clear_referred_by() from public, anon, authenticated;
revoke execute on function apply_referral(text), my_referrals(uuid) from public, anon;
grant execute on function apply_referral(text), my_referrals(uuid) to authenticated;
grant execute on function referral_valid(text) to anon, authenticated;
grant execute on function ensure_referral_code(uuid), apply_referral(text), my_referrals(uuid), referral_valid(text)
  to service_role;
