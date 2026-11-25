-- La clave de borrado ya no se guarda en la base ni se crea desde ninguna pantalla: vive solo como variable secreta del servidor.
-- La base solo lleva la cuenta de intentos fallidos (5 = bloqueo de 30 minutos).
drop function if exists purge_key_check(uuid, text);
drop function if exists purge_key_set(uuid, text, text);
drop function if exists purge_key_status(uuid);
alter table purge_key alter column hash drop not null;
update purge_key set hash = null;
insert into purge_key (id, hash) values (true, null) on conflict (id) do nothing;

create or replace function purge_lock_state(p_actor uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare k purge_key%rowtype;
begin
  perform purge_assert(p_actor);
  select * into k from purge_key;
  return jsonb_build_object('locked', coalesce(k.locked_until > now(), false), 'locked_until', k.locked_until, 'left', greatest(5 - coalesce(k.fail_count, 0), 0));
end $$;

create or replace function purge_attempt(p_actor uuid, p_ok boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare k purge_key%rowtype;
begin
  perform purge_assert(p_actor);
  select * into k from purge_key for update;
  if p_ok then
    update purge_key set fail_count = 0, locked_until = null;
    return jsonb_build_object('left', 5);
  end if;
  update purge_key set
    locked_until = case when fail_count + 1 >= 5 then now() + interval '30 minutes' else locked_until end,
    fail_count = case when fail_count + 1 >= 5 then 0 else fail_count + 1 end;
  return jsonb_build_object('left', greatest(5 - (k.fail_count + 1), 0));
end $$;

revoke all on function purge_lock_state(uuid), purge_attempt(uuid, boolean) from public, anon, authenticated;
grant execute on function purge_lock_state(uuid), purge_attempt(uuid, boolean) to service_role;
