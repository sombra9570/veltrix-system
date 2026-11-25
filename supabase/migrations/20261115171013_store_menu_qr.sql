-- Carta/catálogo con QR: el negocio puede usar el QR que genera la app o subir el suyo
alter table stores add column if not exists own_qr_path text;

create or replace function public.set_store_qr(p_company uuid, p_path text)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not can_manage_catalog(p_company) then raise exception 'Sin permiso'; end if;
  if p_path is not null and split_part(p_path, '/', 2) <> p_company::text then raise exception 'Ruta inválida'; end if;
  update stores set own_qr_path = p_path, updated_at = now() where company_id = p_company;
end $$;
revoke all on function public.set_store_qr(uuid, text) from public, anon;
grant execute on function public.set_store_qr(uuid, text) to authenticated;

-- Agregar de una vez a la carta los productos y servicios activos (respetando el límite del plan)
create or replace function public.store_add_all(p_company uuid)
returns int language plpgsql security definer set search_path to 'public' as $$
declare v_org uuid; v_max int; v_now int; v_added int;
begin
  if not can_manage_catalog(p_company) then raise exception 'Sin permiso'; end if;
  select org_id into v_org from companies where id = p_company;
  select max_store_products into v_max from org_limits(v_org);
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
revoke all on function public.store_add_all(uuid) from public, anon;
grant execute on function public.store_add_all(uuid) to authenticated;
