-- Solicitud de Veltrix IA: llega como aviso al equipo de la plataforma; el precio lo define el superadmin
alter table public.platform_events drop constraint if exists platform_events_kind_check;
alter table public.platform_events add constraint platform_events_kind_check check (kind in ('lead','company','support_msg','ai_request'));

create table if not exists public.platform_ai_offer (
  id boolean primary key default true check (id),
  price_usd numeric(10,2) check (price_usd is null or price_usd >= 0),
  monthly_quota int check (monthly_quota is null or monthly_quota > 0),
  updated_at timestamptz not null default now()
);
insert into public.platform_ai_offer (id) values (true) on conflict do nothing;
alter table public.platform_ai_offer enable row level security;
revoke all on public.platform_ai_offer from anon, authenticated;

create or replace function public.ai_offer() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_org uuid := (select org_id from profiles where id = auth.uid());
begin
  return (select jsonb_build_object('price_usd', o.price_usd, 'monthly_quota', o.monthly_quota,
            'requested', v_org is not null and exists (select 1 from platform_events e where e.kind = 'ai_request' and e.ref_id = v_org and e.read_at is null))
          from platform_ai_offer o);
end $$;

create or replace function public.set_ai_offer(p_price numeric, p_quota int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'PERM_DENIED'; end if;
  update platform_ai_offer set price_usd = p_price, monthly_quota = p_quota, updated_at = now() where id;
end $$;

create or replace function public.request_veltrix_ai() returns text
language plpgsql security definer set search_path = public as $$
declare v_org uuid := (select org_id from profiles where id = auth.uid()); v_name text; v_who text;
begin
  if v_org is null or not (is_org_owner(v_org) or is_org_manager(v_org)) then raise exception 'PERM_DENIED'; end if;
  if exists (select 1 from platform_events e where e.kind = 'ai_request' and e.ref_id = v_org and e.read_at is null) then return 'already'; end if;
  select name into v_name from organizations where id = v_org;
  select coalesce(full_name, '') into v_who from profiles where id = auth.uid();
  insert into platform_events(kind, ref_id, title, detail) values ('ai_request', v_org, coalesce(v_name, ''), nullif(btrim('Solicita activar Veltrix IA · ' || v_who), ''));
  perform realtime.send('{}'::jsonb, 'ping', 'plat:inbox', false);
  return 'sent';
end $$;

revoke all on function public.ai_offer(), public.set_ai_offer(numeric,int), public.request_veltrix_ai() from public, anon;
grant execute on function public.ai_offer(), public.set_ai_offer(numeric,int), public.request_veltrix_ai() to authenticated;
