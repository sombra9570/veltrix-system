-- Área profesional de cada entrada de la biblioteca, para ordenarla y encontrarla con facilidad
alter table public.ai_knowledge add column if not exists area text;

update public.ai_knowledge set area = case
  when kind = 'tax_rule' then 'impuestos'
  when kind = 'veltrix_help' then 'veltrix'
  when topic in ('margen', 'caja', 'flujo', 'equilibrio', 'precios') then 'finanzas'
  when topic = 'cobranza' then 'credito_cobranza'
  else 'operacion' end
where area is null;

alter table public.ai_knowledge alter column area set not null;
alter table public.ai_knowledge drop constraint if exists ai_knowledge_area_check;
alter table public.ai_knowledge add constraint ai_knowledge_area_check
  check (area in ('impuestos', 'contabilidad', 'finanzas', 'credito_cobranza', 'operacion', 'legal', 'veltrix'));
create index if not exists ai_knowledge_area_idx on public.ai_knowledge (area, status);

-- Guardar con área (reemplaza la versión sin área)
drop function if exists public.admin_save_ai_knowledge(uuid, text, text, text, text, text, text, text, text, text, text, text);
create or replace function public.admin_save_ai_knowledge(p_id uuid, p_kind text, p_country text, p_topic text, p_title text, p_summary text,
  p_source_name text, p_source_url text, p_license text, p_lang text, p_status text, p_verified_by text, p_area text default null)
 returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid; v_area text := coalesce(nullif(trim(p_area), ''), case p_kind when 'tax_rule' then 'impuestos' when 'veltrix_help' then 'veltrix' else 'operacion' end);
begin
  if not is_platform_admin() then raise exception 'Sin permiso'; end if;
  if p_id is null then
    insert into ai_knowledge (kind, area, country_code, topic, title, summary, source_name, source_url, license, lang, status, verified_by, verified_at, created_by)
    values (p_kind, v_area, upper(nullif(trim(p_country), '')), trim(p_topic), trim(p_title), trim(p_summary), nullif(trim(p_source_name), ''), nullif(trim(p_source_url), ''),
            nullif(trim(p_license), ''), coalesce(nullif(trim(p_lang), ''), 'es'), coalesce(p_status, 'draft'), nullif(trim(p_verified_by), ''),
            case when p_status = 'verified' then current_date end, auth.uid())
    returning id into v_id;
  else
    update ai_knowledge set kind = p_kind, area = v_area, country_code = upper(nullif(trim(p_country), '')), topic = trim(p_topic), title = trim(p_title), summary = trim(p_summary),
           source_name = nullif(trim(p_source_name), ''), source_url = nullif(trim(p_source_url), ''), license = nullif(trim(p_license), ''),
           lang = coalesce(nullif(trim(p_lang), ''), 'es'), status = coalesce(p_status, status), verified_by = nullif(trim(p_verified_by), ''),
           verified_at = case when p_status = 'verified' then coalesce(verified_at, current_date) else null end, updated_at = now()
     where id = p_id returning id into v_id;
    if v_id is null then raise exception 'Entrada inexistente'; end if;
  end if;
  return v_id;
end $$;
revoke all on function public.admin_save_ai_knowledge(uuid, text, text, text, text, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.admin_save_ai_knowledge(uuid, text, text, text, text, text, text, text, text, text, text, text, text) to authenticated;

-- Listado para el administrador: sin el índice de búsqueda
create or replace function public.admin_list_ai_knowledge()
 returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not is_platform_admin() then raise exception 'Sin permiso'; end if;
  return coalesce((select jsonb_agg(to_jsonb(k) - 'created_by' - 'search' order by k.updated_at desc) from ai_knowledge k), '[]'::jsonb);
end $$;
revoke all on function public.admin_list_ai_knowledge() from public, anon;
grant execute on function public.admin_list_ai_knowledge() to authenticated;
