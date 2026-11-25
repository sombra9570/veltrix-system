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

revoke execute on function public.guard_profile_org() from anon, public;

alter function public.perm_catalog() set search_path = public;
