do $mig$
declare
  r record; d text; d2 text;
  edits text[][] := array[
    -- permiso nuevo (queda en el catálogo; por defecto encendido para todos los roles)
    ['perm_catalog', '''products.delete'',', '''products.delete'', ''products.see_code'','],
    -- pedidos a domicilio (repartidor / encargado)
    ['delivery_orders_list', 'declare v_mgr boolean; v_mode text;', 'declare v_mgr boolean; v_mode text; v_sku boolean;'],
    ['delivery_orders_list', 'v_mgr := can_serve_tables(p_branch);', 'v_mgr := can_serve_tables(p_branch); v_sku := has_perm(''products.see_code'', p_branch);'],
    ['delivery_orders_list', 'jsonb_build_object(''description'', oi.description, ''qty'', oi.qty)', 'jsonb_build_object(''description'', oi.description, ''qty'', oi.qty, ''sku'', case when v_sku then (select pr.sku from products pr where pr.id = oi.product_id) end)'],
    -- despacho
    ['dispatch_queue', 'declare v_since timestamptz;', 'declare v_since timestamptz; v_sku boolean;'],
    ['dispatch_queue', 'select dispatch_since into v_since from branches where id = p_branch;', 'select dispatch_since into v_since from branches where id = p_branch; v_sku := has_perm(''products.see_code'', p_branch);'],
    ['dispatch_queue', 'jsonb_build_object(''description'', i.description, ''qty'', i.qty)', 'jsonb_build_object(''description'', i.description, ''qty'', i.qty, ''sku'', case when v_sku then pr.sku end)'],
    -- detalle de venta (Mis ventas, ventas del administrador)
    ['sale_detail', 'declare o orders%rowtype;', 'declare o orders%rowtype; v_sku boolean;'],
    ['sale_detail', 'then raise exception ''Sin permiso''; end if;', 'then raise exception ''Sin permiso''; end if; v_sku := has_perm(''products.see_code'', o.branch_id);'],
    ['sale_detail', '''description'', i.description, ''qty'', i.qty, ''price'', i.unit_price, ''total'', i.line_total)', '''description'', i.description, ''qty'', i.qty, ''price'', i.unit_price, ''total'', i.line_total, ''sku'', case when v_sku then (select pr.sku from products pr where pr.id = i.product_id) end)'],
    -- bandeja de pedidos de la tienda
    ['store_orders', 'declare v_all boolean; v_assign boolean; c companies%rowtype;', 'declare v_all boolean; v_assign boolean; v_sku boolean; c companies%rowtype;'],
    ['store_orders', 'v_assign := store_perm(''store.assign'', p_company);', 'v_assign := store_perm(''store.assign'', p_company); v_sku := has_perm_company(''products.see_code'', p_company);'],
    ['store_orders', 'jsonb_build_object(''name'', pr.name, ''qty'', (i->>''qty'')::numeric)', 'jsonb_build_object(''name'', pr.name, ''qty'', (i->>''qty'')::numeric, ''sku'', case when v_sku then pr.sku end)'],
    -- solicitudes de domicilio pendientes
    ['delivery_requests_list', 'jsonb_build_object(''name'', pr.name, ''qty'', (i->>''qty'')::numeric, ''notes'', i->>''notes'')', 'jsonb_build_object(''name'', pr.name, ''qty'', (i->>''qty'')::numeric, ''notes'', i->>''notes'', ''sku'', case when has_perm(''products.see_code'', p_branch) then pr.sku end)']
  ];
  i int; fn text; a text; b text; cnt int := 0;
begin
  for fn in select distinct e[1] from (select array[edits[n][1], edits[n][2], edits[n][3]] e from generate_subscripts(edits, 1) n) s loop
    select pg_get_functiondef(p.oid) into d from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = fn;
    d2 := d;
    for i in 1 .. array_length(edits, 1) loop
      if edits[i][1] = fn then
        a := edits[i][2]; b := edits[i][3];
        if position(a in d2) = 0 then raise exception 'No se encontró el fragmento en %: %', fn, a; end if;
        d2 := replace(d2, a, b); cnt := cnt + 1;
      end if;
    end loop;
    execute d2;
  end loop;
  raise notice 'ediciones aplicadas: %', cnt;
end
$mig$;

-- Cola de caja con código (la anterior no se toca)
create or replace function public.cashier_order_items_v2(p_order uuid)
returns table(description text, qty numeric, unit_price numeric, line_total numeric, sku text)
language sql stable security definer set search_path to 'public'
as $function$
  select i.description, i.qty, i.unit_price, i.line_total,
         case when has_perm('products.see_code', o.branch_id) then pr.sku end
    from order_items i
    join orders o on o.id = i.order_id
    left join products pr on pr.id = i.product_id
   where o.id = p_order
     and o.status = 'confirmed'
     and o.branch_id in (select branch_id from register_shifts where cashier_id = auth.uid() and status = 'open')
     and i.kitchen_status is distinct from 'cancelled'
   order by i.created_at;
$function$;
revoke all on function public.cashier_order_items_v2(uuid) from public, anon;
grant execute on function public.cashier_order_items_v2(uuid) to authenticated;

-- Códigos de los ítems de la cocina (se unen por id de ítem en la pantalla)
create or replace function public.kitchen_item_codes(p_branch uuid, p_items uuid[])
returns table(item_id uuid, sku text)
language sql stable security definer set search_path to 'public'
as $function$
  select oi.id, pr.sku
    from order_items oi
    join orders o on o.id = oi.order_id
    join products pr on pr.id = oi.product_id
   where o.branch_id = p_branch and oi.id = any(p_items)
     and has_perm('products.see_code', p_branch)
     and (is_branch_manager(p_branch) or has_branch_role(p_branch, '{kitchen,waiter}'));
$function$;
revoke all on function public.kitchen_item_codes(uuid, uuid[]) from public, anon;
grant execute on function public.kitchen_item_codes(uuid, uuid[]) to authenticated;
