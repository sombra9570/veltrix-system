CREATE OR REPLACE FUNCTION public.ai_t_knowledge(p_topic text DEFAULT NULL::text, p_kind text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  -- Primero las verificadas por un contador; los borradores (sin verificar) completan el cupo y salen marcados
  select coalesce(jsonb_agg(t order by (t.estado = 'verificado') desc, t.relevancia desc), '[]') into v_rows from (
    select k.kind as tipo, k.country_code as pais, k.title as titulo, left(k.summary, 1200) as resumen, k.source_name as fuente,
           k.source_url as enlace, k.license as licencia, k.verified_by as verificado_por, k.verified_at as verificado_el,
           case when v_tsq is null or numnode(v_tsq) = 0 then 0 else ts_rank(k.search, v_tsq) end as relevancia,
           case when k.status = 'verified' then 'verificado' else 'borrador' end as estado
      from ai_knowledge k
     where k.status in ('verified', 'draft') and (k.country_code is null or upper(k.country_code) = any(v_countries))
       and (p_kind is null or k.kind = p_kind)
       and (v_q is null or v_tsq is null or numnode(v_tsq) = 0
            or k.search @@ v_tsq
            or position(v_q in lower(k.topic || ' ' || k.title || ' ' || k.summary)) > 0)
     order by (k.status = 'verified') desc, 10 desc, (k.country_code is not null) desc, k.verified_at desc nulls last limit 5) t;
  return jsonb_build_object('paises_de_sus_empresas', v_countries, 'entradas', v_rows,
    'nota', case
      when jsonb_array_length(v_rows) = 0 then 'No hay información cargada sobre este tema.'
      when not exists (select 1 from jsonb_array_elements(v_rows) e where e->>'estado' = 'verificado') then 'Solo hay entradas en borrador, aún no verificadas por un contador.'
    end);
end $function$;