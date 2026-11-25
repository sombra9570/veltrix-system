-- Guardas del borrado definitivo de empresas: clave secreta (hash), bloqueo por intentos, solicitud de un solo uso y registro.
create table if not exists purge_key (
  id boolean primary key default true check (id),
  hash text not null, fail_count int not null default 0, locked_until timestamptz, updated_at timestamptz not null default now());
create table if not exists purge_requests (
  id uuid primary key default gen_random_uuid(), org_id uuid not null, org_name text not null, actor uuid not null,
  created_at timestamptz not null default now(), expires_at timestamptz not null default now() + interval '10 minutes', used boolean not null default false);
create table if not exists purge_log (
  id bigserial primary key, at timestamptz not null default now(), actor uuid, org_id uuid, org_name text, action text not null, ok boolean not null, detail text);
alter table purge_key enable row level security;
alter table purge_requests enable row level security;
alter table purge_log enable row level security;
revoke all on purge_key, purge_requests, purge_log from anon, authenticated;

create or replace function purge_assert(p_actor uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.role() is distinct from 'service_role' or not exists (select 1 from platform_admins where user_id = p_actor) then
    raise exception 'Solo el superadmin';
  end if;
end $$;

create or replace function purge_key_status(p_actor uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare k purge_key%rowtype;
begin
  perform purge_assert(p_actor);
  select * into k from purge_key;
  return jsonb_build_object('configured', found, 'locked_until', case when found and k.locked_until > now() then k.locked_until end);
end $$;

-- Crear la clave por primera vez (10 a 12 caracteres). Cambiarla exige la actual.
create or replace function purge_key_set(p_actor uuid, p_new text, p_current text default null) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare k purge_key%rowtype;
begin
  perform purge_assert(p_actor);
  if p_new is null or char_length(p_new) not between 10 and 12 then raise exception 'PURGE_KEY_LENGTH'; end if;
  select * into k from purge_key;
  if found then
    if k.locked_until > now() then raise exception 'PURGE_LOCKED'; end if;
    if p_current is null or k.hash <> crypt(p_current, k.hash) then raise exception 'PURGE_KEY_WRONG'; end if;
    update purge_key set hash = crypt(p_new, gen_salt('bf')), fail_count = 0, locked_until = null, updated_at = now();
  else
    insert into purge_key (hash) values (crypt(p_new, gen_salt('bf')));
  end if;
  insert into purge_log (actor, action, ok, detail) values (p_actor, 'key_set', true, null);
end $$;

-- Revisa la clave: 5 fallos seguidos bloquean 30 minutos
create or replace function purge_key_check(p_actor uuid, p_key text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare k purge_key%rowtype;
begin
  perform purge_assert(p_actor);
  select * into k from purge_key for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'NO_KEY'); end if;
  if k.locked_until > now() then return jsonb_build_object('ok', false, 'reason', 'LOCKED', 'locked_until', k.locked_until); end if;
  if p_key is not null and k.hash = crypt(p_key, k.hash) then
    update purge_key set fail_count = 0, locked_until = null;
    return jsonb_build_object('ok', true);
  end if;
  update purge_key set fail_count = fail_count + 1,
    locked_until = case when fail_count + 1 >= 5 then now() + interval '30 minutes' end,
    fail_count = case when fail_count + 1 >= 5 then 0 else fail_count + 1 end;
  return jsonb_build_object('ok', false, 'reason', 'WRONG', 'left', greatest(5 - (k.fail_count + 1), 0));
end $$;

-- Paso 1: pide el borrado y devuelve el resumen de lo que se perdería
create or replace function purge_start(p_actor uuid, p_org uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_name text; v_id uuid;
begin
  perform purge_assert(p_actor);
  select name into v_name from organizations where id = p_org;
  if v_name is null then raise exception 'Organización inexistente'; end if;
  if exists (select 1 from profiles where id = p_actor and org_id = p_org) then raise exception 'No puedes borrar tu propia organización'; end if;
  insert into purge_requests (org_id, org_name, actor) values (p_org, v_name, p_actor) returning id into v_id;
  return jsonb_build_object('request', v_id, 'name', v_name,
    'users', (select count(*) from profiles where org_id = p_org),
    'branches', (select count(*) from branches where org_id = p_org and deleted_at is null),
    'customers', (select count(*) from customers where org_id = p_org),
    'orders', (select count(*) from orders where org_id = p_org));
end $$;

-- Paso 2: consume la solicitud (un solo uso, máximo 10 minutos, al menos 5 segundos después de pedirla)
create or replace function purge_consume(p_actor uuid, p_request uuid, p_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r purge_requests%rowtype;
begin
  perform purge_assert(p_actor);
  select * into r from purge_requests where id = p_request and actor = p_actor for update;
  if not found or r.used or r.expires_at < now() then raise exception 'PURGE_REQUEST_INVALID'; end if;
  if r.created_at > now() - interval '5 seconds' then raise exception 'PURGE_TOO_FAST'; end if;
  if trim(coalesce(p_name, '')) <> r.org_name then raise exception 'PURGE_NAME_MISMATCH'; end if;
  update purge_requests set used = true where id = r.id;
  return jsonb_build_object('org', r.org_id, 'name', r.org_name);
end $$;

create or replace function purge_log_add(p_actor uuid, p_org uuid, p_name text, p_action text, p_ok boolean, p_detail text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform purge_assert(p_actor);
  insert into purge_log (actor, org_id, org_name, action, ok, detail) values (p_actor, p_org, p_name, p_action, p_ok, left(p_detail, 500));
end $$;

-- admin_purge_org: ya no se puede llamar desde el navegador; solo el servidor (clave de servicio) con el actor verificado
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('admin_purge_org(uuid, text)'::regprocedure);
  n := replace(d, 'admin_purge_org(p_org uuid, p_confirm text)', 'admin_purge_org(p_org uuid, p_confirm text, p_actor uuid)');
  n := replace(n, 'if not is_platform_admin() then raise exception ''Solo el superadmin''; end if;', 'perform purge_assert(p_actor);');
  n := replace(n, 'profiles where id = auth.uid() and org_id = p_org', 'profiles where id = p_actor and org_id = p_org');
  if n = d or position('p_actor' in n) = 0 or position('purge_assert' in n) = 0 or position('auth.uid()' in n) > 0 then
    raise exception 'admin_purge_org: no se pudo reescribir';
  end if;
  execute n;
  drop function admin_purge_org(uuid, text);
end $$;

revoke all on function purge_assert(uuid), purge_key_status(uuid), purge_key_set(uuid, text, text), purge_key_check(uuid, text),
  purge_start(uuid, uuid), purge_consume(uuid, uuid, text), purge_log_add(uuid, uuid, text, text, boolean, text),
  admin_purge_org(uuid, text, uuid) from public, anon, authenticated;
grant execute on function purge_assert(uuid), purge_key_status(uuid), purge_key_set(uuid, text, text), purge_key_check(uuid, text),
  purge_start(uuid, uuid), purge_consume(uuid, uuid, text), purge_log_add(uuid, uuid, text, text, boolean, text),
  admin_purge_org(uuid, text, uuid) to service_role;
