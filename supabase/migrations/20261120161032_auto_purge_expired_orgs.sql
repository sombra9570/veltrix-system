-- Borrado automático de empresas suspendidas por falta de renovación. Sin clave (la clave es solo para el panel). Nace APAGADO.
create table if not exists purge_auto_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  days int not null default 120 check (days >= 90),
  updated_at timestamptz not null default now());
insert into purge_auto_settings (id) values (true) on conflict do nothing;
alter table purge_auto_settings enable row level security;
revoke all on purge_auto_settings from anon, authenticated;

-- Empresas que ya cumplieron el plazo desde que quedaron suspendidas (no se toca a las piloto ni a las de un superadmin)
create or replace function auto_purge_candidates(p_all boolean default false)
returns table (org_id uuid, name text, suspended_since timestamptz, delete_on timestamptz)
language plpgsql security definer set search_path = public as $$
declare d int;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Solo el servidor'; end if;
  select days into d from purge_auto_settings;
  return query
    select o.id, o.name, coalesce(o.grace_ends_at, o.updated_at) as s, coalesce(o.grace_ends_at, o.updated_at) + make_interval(days => d)
      from organizations o
     where o.subscription_status = 'suspended' and o.deleted_at is null and not o.is_pilot
       and not exists (select 1 from profiles p join platform_admins a on a.user_id = p.id where p.org_id = o.id)
       and (p_all or coalesce(o.grace_ends_at, o.updated_at) + make_interval(days => d) <= now())
     order by 3;
end $$;

create or replace function auto_purge_settings_get() returns jsonb
language plpgsql security definer set search_path = public as $$
declare s purge_auto_settings%rowtype;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Solo el servidor'; end if;
  select * into s from purge_auto_settings;
  return jsonb_build_object('enabled', s.enabled, 'days', s.days);
end $$;

create or replace function auto_purge_settings_set(p_actor uuid, p_enabled boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform purge_assert(p_actor);
  update purge_auto_settings set enabled = p_enabled, updated_at = now();
  insert into purge_log (actor, action, ok, detail) values (p_actor, 'auto_' || case when p_enabled then 'on' else 'off' end, true, null);
end $$;

-- Borra una empresa vencida (solo si sigue cumpliendo el plazo y el borrado automático está encendido)
create or replace function auto_purge_org(p_org uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_name text; v_actor uuid; r jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Solo el servidor'; end if;
  if not (select enabled from purge_auto_settings) then raise exception 'AUTO_OFF'; end if;
  select c.name into v_name from auto_purge_candidates(false) c where c.org_id = p_org;
  if v_name is null then raise exception 'AUTO_NOT_DUE'; end if;
  select user_id into v_actor from platform_admins order by user_id limit 1;
  r := admin_purge_org(p_org, v_name, v_actor);
  insert into purge_log (actor, org_id, org_name, action, ok, detail) values (null, p_org, v_name, 'auto', true, 'registros ' || (r->>'rows'));
  return r;
end $$;

revoke all on function auto_purge_candidates(boolean), auto_purge_settings_get(), auto_purge_settings_set(uuid, boolean), auto_purge_org(uuid) from public, anon, authenticated;
grant execute on function auto_purge_candidates(boolean), auto_purge_settings_get(), auto_purge_settings_set(uuid, boolean), auto_purge_org(uuid) to service_role;
