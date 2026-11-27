-- Los cargos guardados al registrarse solo pueden ser los que permite el rubro del negocio (matriz rubro_roles)
create or replace function public.save_onboarding(p_data jsonb)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_org uuid; clean jsonb; ok_roles jsonb;
begin
  select m.org_id into v_org from memberships m where m.user_id = auth.uid() and m.role = 'owner' and m.deleted_at is null limit 1;
  if v_org is null then raise exception 'Solo el administrador guarda esto'; end if;
  if jsonb_typeof(p_data) <> 'object' or length(p_data::text) > 4000 then raise exception 'Datos inválidos'; end if;
  clean := jsonb_strip_nulls(p_data);
  if jsonb_typeof(clean->'roles') = 'array' then
    select coalesce(jsonb_agg(r), '[]'::jsonb) into ok_roles
      from jsonb_array_elements_text(clean->'roles') r
      where role_in_org_rubros(v_org, r);
    clean := jsonb_set(clean, '{roles}', ok_roles);
  end if;
  update organizations set onboarding = clean, updated_at = now() where id = v_org;
end $$;
