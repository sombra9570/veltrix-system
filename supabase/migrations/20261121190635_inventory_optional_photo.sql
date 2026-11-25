
do $$
declare d text;
begin
  -- catálogo de permisos: nuevo permiso inv.photo
  d := pg_get_functiondef('public.perm_catalog'::regproc);
  if d not like '%inv.photo%' then
    d := replace(d, '''inv.see_cost'',', '''inv.see_cost'', ''inv.photo'',');
    execute d;
  end if;
  -- por defecto: supervisor y bodeguero
  d := pg_get_functiondef('public.perm_default'::regproc);
  if d not like '%inv.photo%' then
    d := replace(d, 'when p_key = ''store.orders''', 'when p_key = ''inv.photo'' then p_role in (''supervisor'', ''storekeeper'')' || chr(10) || '              when p_key = ''store.orders''');
    execute d;
  end if;
  -- la foto puede ponerla quien tiene permiso de fotos de tienda o de foto en inventario
  d := pg_get_functiondef('public.set_product_photo'::regproc);
  d := replace(d, 'not store_perm(''store.photo'', pr.company_id)', 'not (store_perm(''store.photo'', pr.company_id) or has_perm_company(''inv.photo'', pr.company_id))');
  execute d;
  -- el inventario devuelve la foto y si el usuario puede cambiarla
  d := pg_get_functiondef('public.inv_overview'::regproc);
  d := replace(d, 'jsonb_build_object(''model'', p.model, ''size'', p.size, ''color'', p.color)', 'jsonb_build_object(''model'', p.model, ''size'', p.size, ''color'', p.color, ''photo_path'', p.photo_path, ''org_id'', p.org_id, ''company_id'', p.company_id)');
  d := replace(d, '  return r;', '  r := r || jsonb_build_object(''can_photo'', has_perm(''inv.photo'', p_branch));' || chr(10) || '  return r;');
  execute d;
end $$;
