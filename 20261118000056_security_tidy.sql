-- 056 · Ajustes de seguridad de la revisión del 18 nov 2026 (ver SEGURIDAD.md)

-- 1) Stock desde Productos: primero se revisa el permiso, después se crea el almacén por defecto
create or replace function public.set_branch_stock(p_branch uuid, p_product uuid, p_qty numeric)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_wh uuid;
begin
  if not can_stock(p_branch) then raise exception 'PERM_DENIED'; end if;
  if p_qty is null or p_qty < 0 then raise exception 'Cantidad inválida'; end if;
  if not exists (select 1 from products p join branches b on b.company_id = p.company_id
                  where p.id = p_product and b.id = p_branch and p.track_stock) then
    raise exception 'Este producto no controla stock en esta sucursal';
  end if;
  v_wh := ensure_default_warehouse(p_branch);
  perform adjust_stock(v_wh, p_product, p_qty, 'Conteo desde el panel');
end $$;

-- 2) Control interno de perfiles: nadie lo llama directo (solo corre como disparador)
revoke execute on function public.guard_profile_org() from anon, public;

-- 3) Lista fija de permisos: search_path fijo
alter function public.perm_catalog() set search_path = public;
