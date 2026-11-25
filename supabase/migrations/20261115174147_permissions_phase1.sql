-- Permisos fase 1: más acciones controlables por rol y por persona (validadas en el servidor).
-- Valor inicial = como funciona hoy (true), así nada cambia hasta que el administrador lo decida.
create or replace function public.perm_catalog()
returns text[] language sql immutable as $$
  select array['cash.see_expected', 'cash.movements', 'sales.credit', 'customers.edit', 'customers.view_docs', 'collector.expenses',
    'loans.create', 'loans.customers', 'loans.interest', 'loans.cancel', 'loans.reschedule',
    'routes.liquidate', 'routes.invest', 'routes.approve_loans',
    'payments.reverse', 'products.edit', 'products.price', 'products.delete',
    'inv.receive', 'inv.adjust', 'inv.out', 'inv.transfer', 'reports.export'];
$$;

-- Permiso a nivel empresa: vale si lo tiene en alguna sucursal de esa empresa (catálogo es por empresa)
create or replace function public.has_perm_company(p_key text, p_company uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from branches b where b.company_id = p_company and b.deleted_at is null and has_perm(p_key, b.id));
$$;
revoke all on function public.has_perm_company(text, uuid) from public, anon;
grant execute on function public.has_perm_company(text, uuid) to authenticated;

do $$
declare def text; nd text;
  procedure_patch text;
begin
  -- Reverso de cobros
  def := pg_get_functiondef('public.request_reversal(uuid,text)'::regprocedure);
  nd := regexp_replace(def, '(raise exception ''Cobro inexistente'';\s*end if;)',
    '\1 if not has_perm(''payments.reverse'', p.branch_id) then raise exception ''PERM_DENIED''; end if;');
  if nd = def then raise exception 'request_reversal'; end if; execute nd;

  -- Productos: editar y cambiar precio
  def := pg_get_functiondef('public.save_product(uuid,uuid,text,numeric,product_type,boolean,text,text,boolean)'::regprocedure);
  nd := regexp_replace(def, '(raise exception ''Sin permiso para editar productos'';\s*end if;)',
    '\1 if not has_perm_company(''products.edit'', c.id) then raise exception ''PERM_DENIED''; end if; '
    || 'if p_id is not null and exists (select 1 from products x where x.id = p_id and x.unit_price is distinct from p_price) '
    || 'and not has_perm_company(''products.price'', c.id) then raise exception ''PERM_DENIED''; end if;');
  if nd = def then raise exception 'save_product'; end if; execute nd;

  -- Productos: borrar
  def := pg_get_functiondef('public.delete_product(uuid)'::regprocedure);
  nd := regexp_replace(def, '(if v_company is null or not can_manage_catalog\(v_company\) then raise exception ''Sin permiso''; end if;)',
    '\1 if not has_perm_company(''products.delete'', v_company) then raise exception ''PERM_DENIED''; end if;');
  if nd = def then raise exception 'delete_product'; end if; execute nd;

  -- Inventario: recibir mercadería
  def := pg_get_functiondef('public.inv_receive(uuid,uuid,jsonb,text,integer)'::regprocedure);
  nd := regexp_replace(def, '(if not found or not can_stock\(b\.id\) then raise exception ''Sin permiso''; end if;)',
    '\1 if not has_perm(''inv.receive'', b.id) then raise exception ''PERM_DENIED''; end if;');
  if nd = def then raise exception 'inv_receive'; end if; execute nd;

  -- Inventario: ajustar conteo (dos entradas: por sucursal y por almacén)
  def := pg_get_functiondef('public.inv_adjust(uuid,uuid,numeric,text)'::regprocedure);
  nd := regexp_replace(def, '(if not found or not can_stock\(b\.id\) then raise exception ''Sin permiso''; end if;)',
    '\1 if not has_perm(''inv.adjust'', b.id) then raise exception ''PERM_DENIED''; end if;');
  if nd = def then raise exception 'inv_adjust'; end if; execute nd;

  def := pg_get_functiondef('public.adjust_stock(uuid,uuid,numeric,text)'::regprocedure);
  nd := regexp_replace(def, '(raise exception ''Sin permiso para ajustar inventario'';\s*end if;)',
    '\1 if not has_perm(''inv.adjust'', w.branch_id) then raise exception ''PERM_DENIED''; end if;');
  if nd = def then raise exception 'adjust_stock'; end if; execute nd;

  -- Inventario: salidas
  def := pg_get_functiondef('public.inv_out(uuid,uuid,numeric,text)'::regprocedure);
  nd := regexp_replace(def, '(if not found or not can_stock\(b\.id\) then raise exception ''Sin permiso''; end if;)',
    '\1 if not has_perm(''inv.out'', b.id) then raise exception ''PERM_DENIED''; end if;');
  if nd = def then raise exception 'inv_out'; end if; execute nd;

  -- Inventario: transferir entre sucursales (después de validar la transferencia)
  def := pg_get_functiondef('public.transfer_stock(uuid,uuid,uuid,numeric,text)'::regprocedure);
  nd := regexp_replace(def, '(raise exception ''Transferencia inválida'';\s*end if;)',
    '\1 if not has_perm(''inv.transfer'', a.branch_id) then raise exception ''PERM_DENIED''; end if;');
  if nd = def then raise exception 'transfer_stock'; end if; execute nd;
end $$;
