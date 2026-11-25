
-- Lo que el cliente nos contó al registrarse (diagnóstico): se guarda para armar y recomendar a su medida
alter table public.organizations add column if not exists onboarding jsonb not null default '{}'::jsonb;

create or replace function public.save_onboarding(p_data jsonb)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_org uuid; clean jsonb;
begin
  select m.org_id into v_org from memberships m where m.user_id = auth.uid() and m.role = 'owner' and m.deleted_at is null limit 1;
  if v_org is null then raise exception 'Solo el administrador guarda esto'; end if;
  if jsonb_typeof(p_data) <> 'object' or length(p_data::text) > 4000 then raise exception 'Datos inválidos'; end if;
  clean := jsonb_strip_nulls(p_data);
  update organizations set onboarding = clean, updated_at = now() where id = v_org;
end $$;
revoke all on function public.save_onboarding(jsonb) from public, anon;
grant execute on function public.save_onboarding(jsonb) to authenticated;
