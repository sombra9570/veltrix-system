do $$
declare r record; nm text; n int := 0;
begin
  for r in
    select c.conrelid::regclass::text t,
           (select string_agg(quote_ident(a.attname), ', ' order by x.n) from unnest(c.conkey) with ordinality x(attnum,n) join pg_attribute a on a.attrelid=c.conrelid and a.attnum=x.attnum) cols,
           c.conname
      from pg_constraint c
     where c.contype='f' and c.connamespace='public'::regnamespace
       and array_length(c.conkey,1) < 3
       and not exists (select 1 from pg_index i where i.indrelid=c.conrelid and (i.indkey::int2[])[0:array_length(c.conkey,1)-1] = c.conkey)
  loop
    nm := left('fk_' || replace(r.conname, '_fkey', ''), 63);
    execute format('create index if not exists %I on %s (%s)', nm, r.t, r.cols);
    n := n + 1;
  end loop;
  raise notice 'indices creados: %', n;
end $$;
