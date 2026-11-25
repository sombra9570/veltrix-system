create or replace function public.save_store(p_company uuid, p_slug text, p_name text, p_description text, p_whatsapp text, p_branch uuid, p_published boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_wa text := regexp_replace(coalesce(p_whatsapp, ''), '[^0-9]', '', 'g');
begin
  if not store_perm('store.edit_info', p_company) then raise exception 'PERM_DENIED'; end if;
  -- El enlace de la tienda no se cambia: ya quedó compartido en QR, redes y WhatsApp (p_slug se ignora)
  if coalesce(trim(p_name), '') = '' then raise exception 'Indique el nombre'; end if;
  if p_published and length(v_wa) < 8 then raise exception 'STORE_NEEDS_WHATSAPP'; end if;
  if not exists (select 1 from branches where id = p_branch and company_id = p_company and deleted_at is null) then raise exception 'Sucursal inválida'; end if;
  update stores set name = trim(p_name), description = nullif(trim(coalesce(p_description, '')), ''),
         whatsapp = nullif(v_wa, ''), branch_id = p_branch, is_published = coalesce(p_published, false), updated_at = now()
   where company_id = p_company;
  if not found then raise exception 'Tienda inexistente'; end if;
end $$;
