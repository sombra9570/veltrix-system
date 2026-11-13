-- Veltrix · Endurecimiento de seguridad (aplicado en Supabase el 13-nov-2026)
-- 1) Visitantes sin sesión (anon) no tocan ninguna tabla ni función.
-- 2) Las funciones de triggers no se pueden llamar desde la API.
-- 3) search_path fijo en las funciones que no lo tenían.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig, p.prorettype = 'trigger'::regtype as is_trigger
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
  loop
    if f.is_trigger then
      execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    else
      execute format('grant execute on function %s to authenticated', f.sig);
      execute format('revoke all on function %s from public, anon', f.sig);
    end if;
  end loop;
end $$;

revoke all on function org_limits(uuid) from authenticated;
revoke all on function process_subscriptions() from authenticated;

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from public, anon;
alter default privileges in schema public grant execute on functions to authenticated;

alter function set_updated_at() set search_path = public;
alter function guard_payment_update() set search_path = public;
alter function forbid_change() set search_path = public;
alter function order_type_module(order_type) set search_path = public;
