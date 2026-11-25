create or replace function public.addon_cap(p_org uuid, p_code text, p_default int)
returns int language sql stable security definer set search_path to 'public' as $$
  select case
    when p_code = 'storage' then p_default
    when p_code = 'user' then case when pl.code = 'enterprise_plus' then least(p_default, 50) else 0 end
    when p_code = 'branch' then case pl.code when 'enterprise' then least(p_default, 15) when 'enterprise_plus' then least(p_default, 20) else 0 end
    else 0 end
  from organizations o left join plans pl on pl.id = o.plan_id where o.id = p_org;
$$;
revoke all on function public.addon_cap(uuid, text, int) from public, anon, authenticated;

do $$
declare def text; nd text;
begin
  def := pg_get_functiondef('public.my_addons(uuid)'::regprocedure);
  nd := regexp_replace(def, '''max'',\s*a\.max_units', '''max'', coalesce(addon_cap(p_org, a.code, a.max_units), 0)');
  if nd = def then raise exception 'my_addons: patrón no encontrado'; end if;
  execute nd;

  def := pg_get_functiondef('public.set_my_addons(uuid,integer,integer,integer)'::regprocedure);
  nd := regexp_replace(def, '(raise exception ''ADDON_LIMIT'';\s*end if;)',
    '\1 if p_users > coalesce(addon_cap(p_org, ''user'', v_max.u), 0) or p_branches > coalesce(addon_cap(p_org, ''branch'', v_max.b), 0) then raise exception ''ADDON_UPGRADE''; end if;');
  if nd = def then raise exception 'set_my_addons: patrón no encontrado'; end if;
  execute nd;
end $$;
