-- Permiso del cobrador: subir fotos del cliente desde la galería (encendido por defecto).
-- Apagado: solo puede tomar la foto con la cámara del celular.
do $$
declare src text; src2 text;
begin
  select pg_get_functiondef(p.oid) into src from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='perm_catalog';
  src2 := replace(src, '''collectors.rate'']', '''collectors.rate'', ''customers.photo_gallery'']');
  if src2 = src then raise exception 'perm_catalog'; end if;
  execute src2;

  select pg_get_functiondef(p.oid) into src from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='role_offered_keys_base';
  src2 := replace(src, '''routes.liquidate'',''routes.invest'']
    when ''storekeeper''', '''routes.liquidate'',''routes.invest'',''customers.photo_gallery'']
    when ''storekeeper''');
  if src2 = src then raise exception 'role_offered_keys_base'; end if;
  execute src2;

  select pg_get_functiondef(p.oid) into src from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='collector_day';
  src2 := replace(src, '''can_no_id_photo'', coalesce((r.permissions->>''loans.no_id_photo'')::boolean, has_perm(''loans.no_id_photo'', r.branch_id)),',
    '''can_no_id_photo'', coalesce((r.permissions->>''loans.no_id_photo'')::boolean, has_perm(''loans.no_id_photo'', r.branch_id)),
        ''can_gallery'', coalesce((r.permissions->>''customers.photo_gallery'')::boolean, has_perm(''customers.photo_gallery'', r.branch_id)),');
  if src2 = src then raise exception 'collector_day'; end if;
  execute src2;
end $$;
