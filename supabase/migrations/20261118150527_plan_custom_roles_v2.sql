alter table plans add column if not exists max_big_roles int not null default 0;
update plans set max_custom_roles=1, max_role_combo=2, max_big_roles=0 where code='basic';
update plans set max_custom_roles=2, max_role_combo=2, max_big_roles=0 where code='starter';
update plans set max_custom_roles=3, max_role_combo=2, max_big_roles=0 where code='pro';
update plans set max_custom_roles=4, max_role_combo=3, max_big_roles=0 where code='enterprise';
update plans set max_custom_roles=4, max_role_combo=3, max_big_roles=1 where code='enterprise_plus';

create or replace function custom_role_save(p_org uuid, p_id uuid, p_name text, p_base app_role, p_also app_role[], p_perms jsonb)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid; k text; clean jsonb := '{}'::jsonb; pl plans%rowtype; combo int; n int; big int;
begin
  if not is_org_owner(p_org) then raise exception 'Solo el administrador crea roles'; end if;
  if p_base = 'owner' or 'owner' = any(coalesce(p_also, '{}')) then raise exception 'Un rol propio no puede ser administrador'; end if;
  select p.* into pl from organizations o join plans p on p.id = o.plan_id where o.id = p_org;
  combo := 1 + cardinality(array(select distinct x from unnest(coalesce(p_also, '{}')) x where x <> p_base));
  if found and combo > pl.max_role_combo then
    -- Solo el plan más alto permite un rol polifuncional (todos los roles)
    select count(*) into big from custom_roles where org_id = p_org and deleted_at is null and id is distinct from p_id
       and 1 + cardinality(also_roles) > pl.max_role_combo;
    if pl.max_big_roles = 0 then raise exception 'PLAN_COMBO_LIMIT:%', pl.max_role_combo; end if;
    if big >= pl.max_big_roles then raise exception 'PLAN_BIG_LIMIT:%', pl.max_big_roles; end if;
  end if;
  if p_id is null then
    select count(*) into n from custom_roles where org_id = p_org and deleted_at is null;
    if found and n >= pl.max_custom_roles then raise exception 'PLAN_CUSTOM_LIMIT:%', pl.max_custom_roles; end if;
  end if;
  for k in select jsonb_object_keys(coalesce(p_perms, '{}'::jsonb)) loop
    if not (k = any(perm_catalog())) then raise exception 'Permiso inexistente: %', k; end if;
    clean := clean || jsonb_build_object(k, (p_perms->>k)::boolean);
  end loop;
  if p_id is null then
    insert into custom_roles(org_id, name, base_role, also_roles, permissions)
    values (p_org, btrim(p_name), p_base, coalesce(p_also, '{}'), clean) returning id into v_id;
  else
    update custom_roles set name = btrim(p_name), base_role = p_base, also_roles = coalesce(p_also, '{}'), permissions = clean, updated_at = now()
     where id = p_id and org_id = p_org and deleted_at is null returning id into v_id;
    if v_id is null then raise exception 'Rol no encontrado'; end if;
  end if;
  insert into audit_log(org_id, table_name, row_id, action, actor_id, new_data)
    values (p_org, 'custom_roles', v_id, case when p_id is null then 'create' else 'update' end, auth.uid(),
            jsonb_build_object('name', btrim(p_name), 'base_role', p_base, 'also_roles', p_also, 'permissions', clean));
  return v_id;
end $$;
