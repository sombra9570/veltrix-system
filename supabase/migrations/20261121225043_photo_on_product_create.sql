
create or replace function public.can_set_product_photo(p_company uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select store_perm('store.photo', p_company) or has_perm_company('inv.photo', p_company);
$$;

create or replace function public.set_model_photo(p_company uuid, p_model text, p_path text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_org uuid;
begin
  if not can_set_product_photo(p_company) then raise exception 'PERM_DENIED'; end if;
  select org_id into v_org from products where company_id = p_company and model = p_model and deleted_at is null limit 1;
  if v_org is null then raise exception 'PERM_DENIED'; end if;
  if p_path is not null and (split_part(p_path, '/', 1) <> v_org::text or split_part(p_path, '/', 2) <> p_company::text) then raise exception 'Ruta inválida'; end if;
  update products set photo_path = p_path where company_id = p_company and model = p_model and deleted_at is null;
end $$;

revoke all on function public.can_set_product_photo(uuid), public.set_model_photo(uuid,text,text) from public, anon;
grant execute on function public.can_set_product_photo(uuid), public.set_model_photo(uuid,text,text) to authenticated;
