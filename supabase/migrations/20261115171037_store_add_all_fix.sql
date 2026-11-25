create or replace function public.store_add_all(p_company uuid)
returns int language plpgsql security definer set search_path to 'public' as $$
declare v_org uuid; v_max int; v_now int; v_added int;
begin
  if not can_manage_catalog(p_company) then raise exception 'Sin permiso'; end if;
  select c.org_id, pl.max_store_products into v_org, v_max
    from companies c join organizations o on o.id = c.org_id left join plans pl on pl.id = o.plan_id where c.id = p_company;
  select count(*) into v_now from products where company_id = p_company and in_store and deleted_at is null;
  with c as (
    select id from products
     where company_id = p_company and deleted_at is null and is_active and is_sellable and not in_store
       and product_type in ('good', 'service', 'combo')
     order by name
     limit greatest(coalesce(v_max, 100000) - v_now, 0))
  update products p set in_store = true from c where p.id = c.id;
  get diagnostics v_added = row_count;
  return v_added;
end $$;
