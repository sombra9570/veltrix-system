-- El administrador puede editar los datos de un cliente de la ruta (nombre, celular, dirección, CI).
create or replace function public.owner_update_customer(p_customer uuid, p_name text, p_phone text, p_address text, p_tax_id text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare c customers%rowtype;
begin
  select * into c from customers where id = p_customer and deleted_at is null;
  if not found then raise exception 'CUSTOMER_NOT_FOUND'; end if;
  if not is_org_owner(c.org_id) then raise exception 'PERM_DENIED'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Indique el nombre'; end if;
  update customers set name = trim(p_name), phone = nullif(trim(coalesce(p_phone, '')), ''),
         address = nullif(trim(coalesce(p_address, '')), ''), tax_id = nullif(trim(coalesce(p_tax_id, '')), '') where id = c.id;
end $$;
revoke all on function public.owner_update_customer(uuid, text, text, text, text) from public;
grant execute on function public.owner_update_customer(uuid, text, text, text, text) to authenticated;
