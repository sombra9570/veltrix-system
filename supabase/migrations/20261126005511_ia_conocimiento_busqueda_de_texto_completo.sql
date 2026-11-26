-- Búsqueda de texto completo (español) con ranking en la biblioteca de conocimiento de Veltrix IA.
-- Solo entradas verificadas, del país de las empresas del usuario (o generales); el alcance no cambia.
alter table public.ai_knowledge
  add column if not exists search tsvector generated always as (to_tsvector('spanish', coalesce(topic, '') || ' ' || coalesce(title, '') || ' ' || coalesce(summary, ''))) stored;
create index if not exists ai_knowledge_search_idx on public.ai_knowledge using gin (search);

create or replace function public.ai_t_knowledge(p_topic text default null, p_kind text default null)
 returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare c record; v_countries text[]; v_q text := nullif(lower(trim(coalesce(p_topic, ''))), ''); v_rows jsonb; v_words text[]; v_tsq tsquery;
begin
  select * into c from ai_ctx();
  select coalesce(array_agg(distinct upper(co.country_code)), '{}') into v_countries
    from companies co where co.id in (select b.company_id from branches b where b.id = any(c.wide || c.own));
  if v_q is not null then
    select coalesce(array_agg(distinct w), '{}') into v_words
      from regexp_split_to_table(regexp_replace(v_q, '[^a-z0-9áéíóúüñ]+', ' ', 'g'), ' ') as w where char_length(w) >= 3;
    if cardinality(v_words) > 0 then v_tsq := to_tsquery('spanish', array_to_string(v_words, ' | ')); end if;
  end if;
  select coalesce(jsonb_agg(t order by t.relevancia desc), '[]') into v_rows from (
    select k.kind as tipo, k.country_code as pais, k.title as titulo, left(k.summary, 1200) as resumen, k.source_name as fuente,
           k.source_url as enlace, k.license as licencia, k.verified_by as verificado_por, k.verified_at as verificado_el,
           case when v_tsq is null or numnode(v_tsq) = 0 then 0 else ts_rank(k.search, v_tsq) end as relevancia
      from ai_knowledge k
     where k.status = 'verified' and (k.country_code is null or upper(k.country_code) = any(v_countries))
       and (p_kind is null or k.kind = p_kind)
       and (v_q is null or v_tsq is null or numnode(v_tsq) = 0
            or k.search @@ v_tsq
            or position(v_q in lower(k.topic || ' ' || k.title || ' ' || k.summary)) > 0)
     order by 10 desc, (k.country_code is not null) desc, k.verified_at desc limit 5) t;
  return jsonb_build_object('paises_de_sus_empresas', v_countries, 'entradas', v_rows,
    'nota', case when jsonb_array_length(v_rows) = 0 then 'No hay información verificada cargada sobre este tema.' end);
end $$;
revoke execute on function public.ai_t_knowledge(text, text) from public, anon;
grant execute on function public.ai_t_knowledge(text, text) to authenticated;
