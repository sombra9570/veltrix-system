create or replace function public.store_add_all(p_company uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_max int; v_now int; v_added int;
begin
  if not can_manage_catalog(p_company) then raise exception 'Sin permiso'; end if;
  select c.org_id, pl.max_store_products into v_org, v_max
    from companies c join organizations o on o.id = c.org_id left join plans pl on pl.id = o.plan_id where c.id = p_company;
  select count(distinct coalesce(model, id::text)) into v_now from products where company_id = p_company and in_store and deleted_at is null;
  with k as (
    select coalesce(model, id::text) as g from products
     where company_id = p_company and deleted_at is null and is_active and is_sellable and not in_store
       and photo_path is not null and product_type in ('good', 'service', 'combo')
     group by 1 order by 1
     limit greatest(coalesce(v_max, 100000) - v_now, 0))
  update products p set in_store = true from k
   where p.company_id = p_company and p.deleted_at is null and p.is_active and p.is_sellable and not p.in_store
     and p.photo_path is not null and p.product_type in ('good', 'service', 'combo') and coalesce(p.model, p.id::text) = k.g;
  get diagnostics v_added = row_count;
  return v_added;
end $$;
