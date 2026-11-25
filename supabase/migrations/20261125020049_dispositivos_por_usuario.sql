create table if not exists public.user_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null,
  label text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  released_at timestamptz,
  unique (user_id, device_id)
);
create index if not exists user_devices_active_idx on public.user_devices (user_id) where released_at is null;
alter table public.user_devices enable row level security;
-- Sin políticas: solo se accede por las funciones de abajo.

create or replace function public.device_limit_for(p_user uuid) returns int
language sql stable security definer set search_path to 'public' as $$
  select case when exists (select 1 from platform_admins a where a.user_id = p_user)
                or exists (select 1 from memberships m where m.user_id = p_user and m.role = 'owner' and m.is_active and m.deleted_at is null)
              then 2 else 1 end
$$;

-- Registra este dispositivo al ingresar. Roles de 1 dispositivo: se bloquea si ya hay otro activo.
-- Dueño/administrador (2): si ya hay 2, se cierra el más antiguo.
create or replace function public.register_device(p_device text, p_label text default null) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare uid uuid := auth.uid(); lim int; n int; cur record;
begin
  if uid is null then raise exception 'Sin sesión'; end if;
  if coalesce(length(trim(p_device)),0) < 8 then raise exception 'Dispositivo inválido'; end if;
  perform pg_advisory_xact_lock(hashtext(uid::text));
  select * into cur from user_devices where user_id = uid and device_id = p_device;
  if found and cur.released_at is null then
    update user_devices set last_seen_at = now() where id = cur.id;
    return jsonb_build_object('ok', true);
  end if;
  lim := device_limit_for(uid);
  select count(*) into n from user_devices where user_id = uid and released_at is null;
  if n >= lim then
    if lim = 1 then raise exception 'DEVICE_LIMIT'; end if;
    update user_devices set released_at = now()
     where id in (select id from user_devices where user_id = uid and released_at is null order by last_seen_at asc limit (n - lim + 1));
  end if;
  if found then
    update user_devices set released_at = null, last_seen_at = now(), label = coalesce(p_label, label) where id = cur.id;
  else
    insert into user_devices (user_id, device_id, label) values (uid, p_device, left(p_label, 80));
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- 'ok' = activo, 'revoked' = fue liberado/cerrado, 'new' = este dispositivo aún no está registrado (sesión anterior a la regla)
create or replace function public.check_device(p_device text) returns text
language plpgsql security definer set search_path to 'public' as $$
declare uid uuid := auth.uid(); cur record;
begin
  if uid is null then return 'revoked'; end if;
  select * into cur from user_devices where user_id = uid and device_id = p_device;
  if not found then return 'new'; end if;
  if cur.released_at is not null then return 'revoked'; end if;
  if cur.last_seen_at < now() - interval '1 minute' then update user_devices set last_seen_at = now() where id = cur.id; end if;
  return 'ok';
end $$;

-- Cierre de sesión: libera este dispositivo
create or replace function public.release_device(p_device text) returns void
language sql security definer set search_path to 'public' as $$
  update user_devices set released_at = now() where user_id = auth.uid() and device_id = p_device and released_at is null;
$$;

-- El dueño libera todos los dispositivos de un trabajador de su organización
create or replace function public.owner_release_devices(p_org uuid, p_user uuid) returns int
language plpgsql security definer set search_path to 'public' as $$
declare n int;
begin
  if not is_org_owner(p_org) then raise exception 'Sin permiso'; end if;
  if not exists (select 1 from memberships m where m.org_id = p_org and m.user_id = p_user and m.deleted_at is null and m.role <> 'owner') then
    raise exception 'Usuario inválido';
  end if;
  update user_devices set released_at = now() where user_id = p_user and released_at is null;
  get diagnostics n = row_count;
  return n;
end $$;

-- Cantidad de dispositivos activos por trabajador (solo dueño)
create or replace function public.owner_team_devices(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not is_org_owner(p_org) then raise exception 'Sin permiso'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('user_id', d.user_id, 'n', d.n, 'last', d.last))
    from (select u.user_id, count(*) n, max(u.last_seen_at) last
            from user_devices u
           where u.released_at is null
             and u.user_id in (select m.user_id from memberships m where m.org_id = p_org and m.deleted_at is null and m.role <> 'owner')
           group by u.user_id) d), '[]'::jsonb);
end $$;

revoke all on function public.register_device(text,text), public.check_device(text), public.release_device(text), public.owner_release_devices(uuid,uuid), public.owner_team_devices(uuid), public.device_limit_for(uuid) from public, anon;
grant execute on function public.register_device(text,text), public.check_device(text), public.release_device(text), public.owner_release_devices(uuid,uuid), public.owner_team_devices(uuid) to authenticated;
