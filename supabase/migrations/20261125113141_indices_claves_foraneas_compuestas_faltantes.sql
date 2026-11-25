-- Crea un índice para cada clave foránea sin índice que la cubra (38 según el asesor de rendimiento).
-- No se elimina ningún índice existente.
do $$
declare r record; v_cols text; v_name text;
begin
  for r in
    select c.oid, c.conname, c.conrelid, c.conkey, cl.relname
      from pg_constraint c join pg_class cl on cl.oid = c.conrelid
     where c.contype = 'f' and c.connamespace = 'public'::regnamespace
       and not exists (
         select 1 from pg_index i
          where i.indrelid = c.conrelid and i.indisvalid
            and (i.indkey::int2[])[0:array_length(c.conkey,1)-1] = c.conkey)
  loop
    select string_agg(quote_ident(a.attname), ', ' order by k.ord) into v_cols
      from unnest(r.conkey) with ordinality k(attnum, ord)
      join pg_attribute a on a.attrelid = r.conrelid and a.attnum = k.attnum;
    v_name := left('fk_' || r.relname || '_' || regexp_replace(replace(v_cols, ', ', '_'), '[^a-z0-9_]', '', 'g'), 63);
    execute format('create index if not exists %I on public.%I (%s)', v_name, r.relname, v_cols);
  end loop;
end $$;
