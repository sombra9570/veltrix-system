do $mig$
declare d text; a text := 'case when p.model is null then min(p.sku) end, ''codes'', string_agg(p.sku, '' '')'; b text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'store_admin';
  if position(a in d) = 0 then raise exception 'fragmento no encontrado en store_admin'; end if;
  b := 'case when p.model is null and has_perm_company(''products.see_code'', c.id) then min(p.sku) end, ''codes'', case when has_perm_company(''products.see_code'', c.id) then string_agg(p.sku, '' '') end';
  execute replace(d, a, b);
end
$mig$;
