-- 044: el contador puede ver reportes y ventas de sus sucursales (solo lectura)
-- branch_reader = administrador/supervisor de la sucursal o contador.

create or replace function public.reader_branches()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', b.id, 'name', b.name, 'company_id', c.id, 'company', c.legal_name, 'currency', c.base_currency,
           'company_wide', has_company_role(c.id, '{supervisor}')) order by c.legal_name, b.code), '[]'::jsonb)
    from branches b join companies c on c.id = b.company_id
   where b.deleted_at is null and b.is_active and c.deleted_at is null and branch_reader(b.id);
$$;
revoke all on function public.reader_branches() from public, anon;
grant execute on function public.reader_branches() to authenticated;

-- Lecturas: de "solo administrador de la sucursal" a "lector de la sucursal" (incluye al contador)
do $$
declare f text; def text;
begin
  foreach f in array array['public.report_summary(uuid,uuid,date,date)', 'public.sales_list(uuid,date,date,text)', 'public.sale_detail(uuid)'] loop
    def := pg_get_functiondef(f::regprocedure);
    if position('is_branch_manager(' in def) = 0 then raise exception 'patrón no encontrado en %', f; end if;
    execute replace(def, 'is_branch_manager(', 'branch_reader(');
  end loop;
end $$;
