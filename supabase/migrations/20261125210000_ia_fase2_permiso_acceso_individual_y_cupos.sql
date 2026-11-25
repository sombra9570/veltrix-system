-- Veltrix IA, fase 2: permiso "Usar Veltrix IA", acceso individual de pago y cupos por usuario.

-- 1) Acceso individual (lo activa el superadmin mientras no esté el cobro automático)
create table if not exists public.ai_user_addon (
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  active_until timestamptz not null,
  activated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (user_id, org_id)
);
alter table public.ai_user_addon enable row level security;
create policy ai_user_addon_own_read on public.ai_user_addon for select using (user_id = auth.uid() or is_platform_admin());
revoke all on public.ai_user_addon from anon, authenticated;
grant select on public.ai_user_addon to authenticated;

alter table public.ai_usage add column if not exists tool_calls int not null default 0;
create index if not exists ai_usage_user_created_idx on public.ai_usage (user_id, created_at desc);

-- 2) Permiso de una sola acción
create or replace function public.perm_catalog() returns text[] language sql immutable set search_path to 'public' as $$
  select array['cash.see_expected', 'cash.expense', 'cash.withdraw', 'cash.deposit', 'cash.change_fund',
    'sales.credit', 'customers.create', 'customers.edit', 'customers.view_docs', 'customers.upload_docs', 'collector.expenses', 'collector.pay_out',
    'loans.create', 'loans.customers', 'loans.interest', 'loans.cancel', 'loans.reschedule',
    'routes.liquidate', 'routes.invest', 'routes.approve_loans',
    'payments.reverse', 'products.create', 'products.edit', 'products.price', 'products.delete', 'products.see_code',
    'inv.receive', 'inv.purchase', 'inv.adjust',
    'inv.out_waste', 'inv.out_damaged', 'inv.out_expired', 'inv.out_internal', 'inv.out_supplier_return', 'inv.out_other',
    'inv.transfer', 'reports.export', 'sales.cancel_request', 'inv.see_cost', 'inv.photo',
    'store.photo', 'store.publish', 'store.edit_info', 'store.orders', 'store.assign',
    'tables.remove_item', 'workshop.remove_line', 'workshop.invoice', 'ai.use'];
$$;

do $$ begin
  if not exists (select 1 from pg_proc where proname = 'role_offered_keys_base' and pronamespace = 'public'::regnamespace) then
    alter function public.role_offered_keys(text) rename to role_offered_keys_base;
  end if;
end $$;
create or replace function public.role_offered_keys(p_role text) returns text[] language sql immutable set search_path to 'public' as $$
  select role_offered_keys_base(p_role) || array['ai.use']::text[];
$$;

create or replace function public.perm_default(p_role text, p_key text) returns boolean language sql immutable set search_path to 'public' as $$
  select case
    when p_key = 'ai.use' then p_role in ('supervisor', 'manager')
    when p_role = 'manager' then perm_default_base('supervisor', p_key)
    when p_key in ('tables.remove_item', 'workshop.remove_line', 'workshop.invoice') then p_role = 'supervisor' or p_key = any(role_offered_keys(p_role))
    when p_role in ('cashier','storekeeper','accountant','director','secretary','waiter','kitchen','technician','delivery','reception')
         and p_key = any(perm_catalog()) then p_key = any(role_default_keys(p_role))
    else perm_default_base(p_role, p_key) end;
$$;

-- 3) Quién puede usarla: dueño; administradores con el permiso; otros roles con el permiso + acceso individual vigente
create or replace function public.ai_can_use(p_org uuid) returns boolean language sql stable security definer set search_path to 'public' as $$
  select is_org_owner(p_org) or exists (
    select 1 from memberships m
     where m.user_id = auth.uid() and m.org_id = p_org and m.is_active and m.deleted_at is null and m.branch_id is not null
       and has_perm('ai.use', m.branch_id)
       and (m.role in ('supervisor', 'manager')
            or exists (select 1 from ai_user_addon a where a.user_id = auth.uid() and a.org_id = p_org and a.active_until > now())));
$$;

-- 4) Cupos por usuario (conservadores): administradores 20/día y 400/mes; resto 12/día y 200/mes. También tope de tokens.
create or replace function public.ai_user_limits(p_org uuid) returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v_adm boolean; v_tz text;
begin
  v_adm := is_org_owner(p_org) or exists (select 1 from memberships m where m.user_id = auth.uid() and m.org_id = p_org
             and m.role in ('supervisor', 'manager') and m.is_active and m.deleted_at is null);
  select b.timezone into v_tz from memberships m join branches b on b.id = m.branch_id
   where m.user_id = auth.uid() and m.org_id = p_org and m.is_active and m.deleted_at is null order by m.created_at limit 1;
  v_tz := coalesce(v_tz, 'UTC');
  if not exists (select 1 from pg_timezone_names where name = v_tz) then v_tz := 'UTC'; end if;
  return jsonb_build_object('admin', v_adm, 'tz', v_tz,
    'day_msgs', case when v_adm then 20 else 12 end, 'day_tokens', case when v_adm then 130000 else 80000 end,
    'month_msgs', case when v_adm then 400 else 200 end, 'month_tokens', case when v_adm then 2400000 else 1200000 end,
    'day_start', date_trunc('day', now() at time zone v_tz) at time zone v_tz,
    'month_start', date_trunc('month', now() at time zone v_tz) at time zone v_tz);
end $$;

create or replace function public.ai_begin() returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_org uuid := (select org_id from profiles where id = auth.uid()); v_q int; v_id uuid; l jsonb;
        dm int; dt bigint; mm int; mt bigint;
begin
  if v_org is null or not ai_can_use(v_org) then raise exception 'AI_NOT_ALLOWED'; end if;
  if not org_writable(v_org) then raise exception 'Cuenta suspendida: solo lectura'; end if;
  select ai_monthly_quota into v_q from organizations where id = v_org for update;
  if coalesce(v_q, 0) = 0 then raise exception 'AI_NOT_ENABLED'; end if;
  if ai_used_this_month(v_org) >= v_q then raise exception 'AI_ORG_QUOTA_EXCEEDED'; end if;
  l := ai_user_limits(v_org);
  select count(*) filter (where created_at >= (l->>'day_start')::timestamptz),
         coalesce(sum(tokens_in + tokens_out) filter (where created_at >= (l->>'day_start')::timestamptz), 0),
         count(*), coalesce(sum(tokens_in + tokens_out), 0)
    into dm, dt, mm, mt
    from ai_usage where user_id = auth.uid() and org_id = v_org and status <> 'failed' and created_at >= (l->>'month_start')::timestamptz;
  if dm >= (l->>'day_msgs')::int or dt >= (l->>'day_tokens')::bigint then raise exception 'AI_QUOTA_DAY'; end if;
  if mm >= (l->>'month_msgs')::int or mt >= (l->>'month_tokens')::bigint then raise exception 'AI_QUOTA_EXCEEDED'; end if;
  insert into ai_usage (org_id, user_id) values (v_org, auth.uid()) returning id into v_id;
  return jsonb_build_object('usage_id', v_id);
end $$;

drop function if exists public.ai_finish(uuid, integer, integer, boolean);
create or replace function public.ai_finish(p_usage uuid, p_tokens_in integer, p_tokens_out integer, p_ok boolean, p_tools integer default 0)
returns void language sql security definer set search_path to 'public' as $$
  update ai_usage set tokens_in = greatest(coalesce(p_tokens_in, 0), 0), tokens_out = greatest(coalesce(p_tokens_out, 0), 0),
         tool_calls = greatest(coalesce(p_tools, 0), 0), status = case when p_ok then 'done' else 'failed' end
   where id = p_usage and user_id = auth.uid() and status = 'started' and created_at > now() - interval '10 minutes';
$$;

create or replace function public.ai_quota_status() returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v_org uuid := (select org_id from profiles where id = auth.uid()); v_q int; l jsonb; dm int; mm int; v_reason text;
begin
  if v_org is null then return jsonb_build_object('allowed', false); end if;
  if not ai_can_use(v_org) then
    v_reason := case when exists (select 1 from memberships m where m.user_id = auth.uid() and m.org_id = v_org and m.is_active
                   and m.deleted_at is null and m.branch_id is not null and has_perm('ai.use', m.branch_id)) then 'AI_ADDON_REQUIRED' else 'AI_NOT_ALLOWED' end;
    return jsonb_build_object('allowed', false, 'reason', v_reason);
  end if;
  select ai_monthly_quota into v_q from organizations where id = v_org;
  l := ai_user_limits(v_org);
  select count(*) filter (where created_at >= (l->>'day_start')::timestamptz), count(*) into dm, mm
    from ai_usage where user_id = auth.uid() and org_id = v_org and status <> 'failed' and created_at >= (l->>'month_start')::timestamptz;
  return jsonb_build_object('allowed', true, 'quota', case when coalesce(v_q, 0) = 0 then 0 else (l->>'month_msgs')::int end,
    'used', mm, 'day_quota', (l->>'day_msgs')::int, 'day_used', dm,
    'resets', ((l->>'month_start')::timestamptz at time zone (l->>'tz') + interval '1 month')::date);
end $$;

-- 5) Activación del acceso individual (solo superadmin, mientras no esté el cobro automático)
create or replace function public.admin_set_ai_user_addon(p_user uuid, p_org uuid, p_until timestamptz) returns void
language plpgsql security definer set search_path to 'public' as $$
begin
  if not is_platform_admin() then raise exception 'Sin permiso'; end if;
  if not exists (select 1 from memberships where user_id = p_user and org_id = p_org and deleted_at is null) then raise exception 'El usuario no pertenece a la empresa'; end if;
  insert into ai_user_addon (user_id, org_id, active_until, activated_by) values (p_user, p_org, p_until, auth.uid())
  on conflict (user_id, org_id) do update set active_until = excluded.active_until, activated_by = auth.uid();
end $$;

revoke all on function public.ai_user_limits(uuid), public.ai_begin(), public.ai_finish(uuid,int,int,boolean,int), public.ai_quota_status(), public.admin_set_ai_user_addon(uuid,uuid,timestamptz), public.ai_can_use(uuid) from public, anon;
grant execute on function public.ai_begin(), public.ai_finish(uuid,int,int,boolean,int), public.ai_quota_status(), public.admin_set_ai_user_addon(uuid,uuid,timestamptz), public.ai_can_use(uuid) to authenticated;
