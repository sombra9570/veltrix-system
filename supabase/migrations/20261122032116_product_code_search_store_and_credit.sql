do $mig$
declare d text; a text := '''variants'', case when p.model is null then 1 else count(*) end) as x'; b text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'store_admin';
  if position(a in d) = 0 then raise exception 'fragmento no encontrado en store_admin'; end if;
  b := '''variants'', case when p.model is null then 1 else count(*) end, ''sku'', case when p.model is null then min(p.sku) end, ''codes'', string_agg(p.sku, '' '')) as x';
  execute replace(d, a, b);
end
$mig$;

create or replace function public.collector_products_v2(p_route uuid)
returns table(id uuid, name text, unit_price numeric, sku text)
language plpgsql stable security definer set search_path to 'public'
as $function$
declare r collection_routes%rowtype;
begin
  select * into r from collection_routes where collection_routes.id = p_route and deleted_at is null and is_active;
  if not found or not (r.collector_id = auth.uid() or is_branch_manager(r.branch_id) or is_org_owner(r.org_id)) then
    raise exception 'Esta ruta no está asignada a usted';
  end if;
  if not has_perm('sales.credit', r.branch_id) then raise exception 'SALE_NO_PERMISSION'; end if;
  return query select p.id, p.name::text, p.unit_price,
                      case when has_perm('products.see_code', r.branch_id) then p.sku end
    from products p
    where p.company_id = r.company_id and p.is_active and p.is_sellable and p.deleted_at is null order by p.name limit 500;
end $function$;
revoke all on function public.collector_products_v2(uuid) from public, anon;
grant execute on function public.collector_products_v2(uuid) to authenticated;
