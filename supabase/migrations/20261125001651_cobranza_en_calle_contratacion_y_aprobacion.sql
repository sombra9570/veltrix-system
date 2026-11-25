alter table public.organizations add column if not exists street_collectors int check (street_collectors is null or street_collectors >= 1);
alter table public.platform_staff add column if not exists can_approve_street boolean not null default false;

create or replace function public.staff_can(p text) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select is_platform_admin() or exists (select 1 from platform_staff s where s.user_id = auth.uid() and s.is_active
    and case p when 'reply' then s.can_reply when 'assign' then s.can_assign when 'orgs' then s.can_see_orgs
               when 'street' then s.can_approve_street else false end);
$$;

create or replace function public.staff_list() returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not is_platform_admin() then raise exception 'PERM_DENIED'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('user_id', s.user_id, 'name', p.full_name, 'email', p.email, 'func', s.func,
      'can_reply', s.can_reply, 'can_assign', s.can_assign, 'can_see_orgs', s.can_see_orgs,
      'can_approve_street', s.can_approve_street, 'is_active', s.is_active) order by p.full_name)
    from platform_staff s left join profiles p on p.id = s.user_id), '[]'::jsonb);
end $$;

drop function if exists public.staff_update(uuid, text, boolean, boolean, boolean, boolean);
create or replace function public.staff_update(p_user uuid, p_func text, p_reply boolean, p_assign boolean, p_orgs boolean, p_active boolean, p_street boolean default false)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not is_platform_admin() then raise exception 'PERM_DENIED'; end if;
  update platform_staff set func = p_func, can_reply = p_reply, can_assign = p_assign, can_see_orgs = p_orgs,
         can_approve_street = coalesce(p_street,false), is_active = p_active where user_id = p_user;
  update profiles set is_active = p_active where id = p_user;
end $$;
grant execute on function public.staff_update(uuid, text, boolean, boolean, boolean, boolean, boolean) to authenticated;

create table if not exists public.street_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  extra int not null check (extra between 1 and 500),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  note text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  decided_by uuid,
  decided_at timestamptz
);
alter table public.street_requests enable row level security;
revoke all on public.street_requests from anon, authenticated;
create unique index if not exists street_requests_one_pending on public.street_requests(org_id) where status = 'pending';

-- Estado del plan de cobranza en calle de una organización (null si no corresponde)
create or replace function public.my_street_state(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
declare o record; c record; used_c int; used_s int; pend record;
begin
  if not exists (select 1 from memberships m where m.org_id = p_org and m.user_id = auth.uid() and m.role = 'owner' and m.is_active and m.deleted_at is null) then
    raise exception 'PERM_DENIED'; end if;
  select street_collectors into o from organizations where id = p_org;
  if o.street_collectors is null then return null; end if;
  select * into c from street_plan where id;
  select count(*) filter (where role = 'collector'), count(*) filter (where role = 'supervisor') into used_c, used_s
    from memberships where org_id = p_org and is_active and deleted_at is null;
  select extra into pend from street_requests where org_id = p_org and status = 'pending';
  return jsonb_build_object('contracted', o.street_collectors, 'collectors_used', used_c,
    'supervisors_allowed', o.street_collectors / c.collectors_per_supervisor, 'supervisors_used', used_s,
    'price_bs', c.base_bs + c.collector_bs * (o.street_collectors - 1), 'collector_bs', c.collector_bs,
    'pending_extra', pend.extra);
end $$;
grant execute on function public.my_street_state(uuid) to authenticated;

create or replace function public.street_request_collectors(p_org uuid, p_extra int) returns void
language plpgsql security definer set search_path to 'public' as $$
begin
  if not exists (select 1 from memberships m where m.org_id = p_org and m.user_id = auth.uid() and m.role = 'owner' and m.is_active and m.deleted_at is null) then
    raise exception 'PERM_DENIED'; end if;
  if not exists (select 1 from organizations where id = p_org and street_collectors is not null) then raise exception 'STREET_NOT_APPLICABLE'; end if;
  if p_extra is null or p_extra not between 1 and 500 then raise exception 'STREET_INVALID'; end if;
  if exists (select 1 from street_requests where org_id = p_org and status = 'pending') then raise exception 'STREET_PENDING'; end if;
  insert into street_requests(org_id, extra) values (p_org, p_extra);
end $$;
grant execute on function public.street_request_collectors(uuid, int) to authenticated;

create or replace function public.admin_street_requests() returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not staff_can('street') then raise exception 'PERM_DENIED'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'org_id', r.org_id, 'org', o.name, 'extra', r.extra,
      'contracted', o.street_collectors, 'created_at', r.created_at) order by r.created_at)
    from street_requests r join organizations o on o.id = r.org_id where r.status = 'pending'), '[]'::jsonb);
end $$;
grant execute on function public.admin_street_requests() to authenticated;

create or replace function public.street_decide_request(p_id uuid, p_approve boolean, p_note text default null) returns void
language plpgsql security definer set search_path to 'public' as $$
declare r record;
begin
  if not staff_can('street') then raise exception 'PERM_DENIED'; end if;
  select * into r from street_requests where id = p_id and status = 'pending' for update;
  if not found then raise exception 'STREET_NOT_FOUND'; end if;
  update street_requests set status = case when p_approve then 'approved' else 'rejected' end, note = p_note,
         decided_by = auth.uid(), decided_at = now() where id = p_id;
  if p_approve then update organizations set street_collectors = street_collectors + r.extra where id = r.org_id; end if;
end $$;
grant execute on function public.street_decide_request(uuid, boolean, text) to authenticated;

-- Tope de cobradores y supervisores contratados (solo organizaciones con plan de cobranza en calle)
create or replace function public.enforce_street_limits() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare sc int; per int; used int;
begin
  if new.deleted_at is not null or not new.is_active or new.role not in ('collector','supervisor') then return new; end if;
  if tg_op = 'UPDATE' and old.is_active and old.deleted_at is null and old.role = new.role then return new; end if;
  select street_collectors into sc from organizations where id = new.org_id;
  if sc is null then return new; end if;
  select collectors_per_supervisor into per from street_plan where id;
  select count(*) into used from memberships where org_id = new.org_id and role = new.role and is_active and deleted_at is null and id <> new.id;
  if new.role = 'collector' and used + 1 > sc then raise exception 'STREET_COLLECTORS_LIMIT:%', sc; end if;
  if new.role = 'supervisor' and used + 1 > sc / per then raise exception 'STREET_SUPERVISORS_LIMIT:%', sc / per; end if;
  return new;
end $$;
drop trigger if exists trg_enforce_street_limits on public.memberships;
create trigger trg_enforce_street_limits before insert or update on public.memberships for each row execute function public.enforce_street_limits();

-- Una empresa nueva que es solo de cobranza en calle y microfinanzas parte con 1 cobrador contratado (las existentes no se tocan)
create or replace function public.mark_street_org() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  if new.business_categories is not null and cardinality(new.business_categories) > 0
     and not exists (select 1 from unnest(new.business_categories) c where c not in ('collections','microfinance')) then
    update organizations set street_collectors = 1 where id = new.org_id and street_collectors is null;
  end if;
  return new;
end $$;
drop trigger if exists trg_mark_street_org on public.companies;
create trigger trg_mark_street_org after insert on public.companies for each row execute function public.mark_street_org();
