-- Biblioteca de conocimiento de Veltrix IA: solo se usa lo marcado como verificado, con su fuente y licencia.
create table if not exists public.ai_knowledge (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('management', 'tax_rule', 'veltrix_help')),
  country_code text,
  topic text not null,
  title text not null,
  summary text not null check (char_length(summary) <= 2000),
  source_name text,
  source_url text,
  license text,
  lang text not null default 'es',
  status text not null default 'draft' check (status in ('draft', 'verified', 'retired')),
  verified_by text,
  verified_at date,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_knowledge_tax_needs_country check (kind <> 'tax_rule' or country_code is not null),
  constraint ai_knowledge_verified_needs_proof check (status <> 'verified' or (
    verified_by is not null and verified_at is not null and (kind = 'veltrix_help' or (source_url is not null and license is not null))))
);
alter table public.ai_knowledge enable row level security;
revoke all on public.ai_knowledge from anon, authenticated;
create index if not exists ai_knowledge_lookup_idx on public.ai_knowledge (status, kind, country_code);

create or replace function public.admin_save_ai_knowledge(p_id uuid, p_kind text, p_country text, p_topic text, p_title text, p_summary text,
  p_source_name text, p_source_url text, p_license text, p_lang text, p_status text, p_verified_by text)
 returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid;
begin
  if not is_platform_admin() then raise exception 'Sin permiso'; end if;
  if p_id is null then
    insert into ai_knowledge (kind, country_code, topic, title, summary, source_name, source_url, license, lang, status, verified_by, verified_at, created_by)
    values (p_kind, upper(nullif(trim(p_country), '')), trim(p_topic), trim(p_title), trim(p_summary), nullif(trim(p_source_name), ''), nullif(trim(p_source_url), ''),
            nullif(trim(p_license), ''), coalesce(nullif(trim(p_lang), ''), 'es'), coalesce(p_status, 'draft'), nullif(trim(p_verified_by), ''),
            case when p_status = 'verified' then current_date end, auth.uid())
    returning id into v_id;
  else
    update ai_knowledge set kind = p_kind, country_code = upper(nullif(trim(p_country), '')), topic = trim(p_topic), title = trim(p_title), summary = trim(p_summary),
           source_name = nullif(trim(p_source_name), ''), source_url = nullif(trim(p_source_url), ''), license = nullif(trim(p_license), ''),
           lang = coalesce(nullif(trim(p_lang), ''), 'es'), status = coalesce(p_status, status), verified_by = nullif(trim(p_verified_by), ''),
           verified_at = case when p_status = 'verified' then coalesce(verified_at, current_date) else null end, updated_at = now()
     where id = p_id returning id into v_id;
    if v_id is null then raise exception 'Entrada inexistente'; end if;
  end if;
  return v_id;
end $$;

-- Herramienta de la IA: solo entradas verificadas, del país de las empresas del usuario (o generales)
create or replace function public.ai_t_knowledge(p_topic text default null, p_kind text default null)
 returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare c record; v_countries text[]; v_q text := nullif(lower(trim(coalesce(p_topic, ''))), ''); v_rows jsonb;
begin
  select * into c from ai_ctx();
  select coalesce(array_agg(distinct upper(co.country_code)), '{}') into v_countries
    from companies co where co.id in (select b.company_id from branches b where b.id = any(c.wide || c.own));
  select coalesce(jsonb_agg(t), '[]') into v_rows from (
    select k.kind as tipo, k.country_code as pais, k.title as titulo, left(k.summary, 1200) as resumen, k.source_name as fuente,
           k.source_url as enlace, k.license as licencia, k.verified_by as verificado_por, k.verified_at as verificado_el
      from ai_knowledge k
     where k.status = 'verified' and (k.country_code is null or upper(k.country_code) = any(v_countries))
       and (p_kind is null or k.kind = p_kind)
       and (v_q is null or position(v_q in lower(k.topic || ' ' || k.title || ' ' || k.summary)) > 0)
     order by (k.country_code is not null) desc, k.verified_at desc limit 5) t;
  return jsonb_build_object('paises_de_sus_empresas', v_countries, 'entradas', v_rows,
    'nota', case when jsonb_array_length(v_rows) = 0 then 'No hay información verificada cargada sobre este tema.' end);
end $$;

revoke all on function public.admin_save_ai_knowledge(uuid, text, text, text, text, text, text, text, text, text, text, text) from public, anon;
revoke execute on function public.ai_t_knowledge(text, text) from public, anon;
grant execute on function public.admin_save_ai_knowledge(uuid, text, text, text, text, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.ai_t_knowledge(text, text) to authenticated;
