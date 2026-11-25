-- Veltrix IA, fase 1: consultas de solo lectura filtradas por el usuario que pregunta.
-- Reglas: el alcance sale siempre de auth.uid(); ningún parámetro puede indicar otra empresa, sucursal o usuario.
-- Las consultas heredan la puerta de ai_can_use() (la IA solo responde a quien tenga acceso).

create or replace function public.ai_ctx(p_from date default null, p_to date default null)
 returns table(uid uuid, org uuid, level text, wide uuid[], own uuid[], d1 date, d2 date)
 language plpgsql stable security definer set search_path to 'public' as $$
declare v_uid uuid := auth.uid(); v_org uuid; v_wide uuid[]; v_own uuid[]; v_lv text; v_to date; v_from date;
begin
  if v_uid is null then raise exception 'AI_NOT_ALLOWED'; end if;
  select org_id into v_org from profiles where id = v_uid and is_active;
  if v_org is null or not ai_can_use(v_org) then raise exception 'AI_NOT_ALLOWED'; end if;
  select coalesce(array_agg(b.id), '{}') into v_wide from branches b
   where b.org_id = v_org and b.deleted_at is null and b.is_active and (is_branch_manager(b.id) or branch_reader(b.id));
  select coalesce(array_agg(distinct m.branch_id), '{}') into v_own from memberships m
    join branches b on b.id = m.branch_id and b.deleted_at is null and b.is_active
   where m.user_id = v_uid and m.org_id = v_org and m.is_active and m.deleted_at is null and not (m.branch_id = any(v_wide));
  if cardinality(v_wide) = 0 and cardinality(v_own) = 0 then raise exception 'AI_NOT_ALLOWED'; end if;
  v_lv := case when is_org_owner(v_org) then 'org' when cardinality(v_wide) > 0 then 'branch' else 'self' end;
  v_to := coalesce(p_to, current_date); v_from := coalesce(p_from, v_to - 29);
  if v_to < v_from or v_to - v_from > 366 then raise exception 'AI_RANGE_INVALID'; end if;
  return query select v_uid, v_org, v_lv, v_wide, v_own, v_from, v_to;
end $$;

create or replace function public.ai_t_scope_info()
 returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare c record;
begin
  select * into c from ai_ctx();
  return jsonb_build_object(
    'nivel', c.level,
    've_todo_de_sus_sucursales', cardinality(c.wide) > 0,
    'roles', (select coalesce(jsonb_agg(distinct m.role::text), '[]') from memberships m
               where m.user_id = c.uid and m.org_id = c.org and m.is_active and m.deleted_at is null),
    'fecha_hoy', current_date,
    'empresas', (select coalesce(jsonb_agg(jsonb_build_object('nombre', co.legal_name, 'moneda', co.base_currency,
                   'rubros', co.business_categories, 'pais', co.country_code)), '[]')
                  from companies co where co.id in (select b.company_id from branches b where b.id = any(c.wide || c.own))),
    'sucursales', (select coalesce(jsonb_agg(b.name order by b.name), '[]') from branches b where b.id = any(c.wide || c.own)));
end $$;

create or replace function public.ai_t_sales(p_from date default null, p_to date default null, p_by text default 'day')
 returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare c record; v_rows jsonb; v_tot jsonb; v_by text := case when p_by in ('day','product','branch','seller') then p_by else 'day' end;
begin
  select * into c from ai_ctx(p_from, p_to);
  if v_by = 'seller' and cardinality(c.wide) = 0 then v_by := 'day'; end if;
  select coalesce(jsonb_agg(t), '[]') into v_tot from (
    select o.currency as moneda, round(sum(o.total_amount), 2) as total, count(*) as pedidos
      from orders o join branches b on b.id = o.branch_id
     where o.status = 'confirmed' and o.deleted_at is null and o.org_id = c.org
       and (o.confirmed_at at time zone b.timezone)::date between c.d1 and c.d2
       and (o.branch_id = any(c.wide) or (o.branch_id = any(c.own) and o.vendor_id = c.uid))
     group by o.currency) t;
  if v_by = 'day' then
    select coalesce(jsonb_agg(t order by t.dia), '[]') into v_rows from (
      select (o.confirmed_at at time zone b.timezone)::date as dia, o.currency as moneda, round(sum(o.total_amount), 2) as total, count(*) as pedidos
        from orders o join branches b on b.id = o.branch_id
       where o.status = 'confirmed' and o.deleted_at is null and o.org_id = c.org
         and (o.confirmed_at at time zone b.timezone)::date between c.d1 and c.d2
         and (o.branch_id = any(c.wide) or (o.branch_id = any(c.own) and o.vendor_id = c.uid))
       group by 1, 2 limit 400) t;
  elsif v_by = 'product' then
    select coalesce(jsonb_agg(t order by t.importe desc), '[]') into v_rows from (
      select oi.description as producto, o.currency as moneda, round(sum(oi.qty), 2) as cantidad, round(sum(oi.line_total), 2) as importe
        from order_items oi join orders o on o.id = oi.order_id join branches b on b.id = o.branch_id
       where o.status = 'confirmed' and o.deleted_at is null and o.org_id = c.org
         and (o.confirmed_at at time zone b.timezone)::date between c.d1 and c.d2
         and (o.branch_id = any(c.wide) or (o.branch_id = any(c.own) and o.vendor_id = c.uid))
       group by 1, 2 order by 4 desc limit 40) t;
  elsif v_by = 'branch' then
    select coalesce(jsonb_agg(t order by t.total desc), '[]') into v_rows from (
      select b.name as sucursal, o.currency as moneda, round(sum(o.total_amount), 2) as total, count(*) as pedidos
        from orders o join branches b on b.id = o.branch_id
       where o.status = 'confirmed' and o.deleted_at is null and o.org_id = c.org
         and (o.confirmed_at at time zone b.timezone)::date between c.d1 and c.d2
         and (o.branch_id = any(c.wide) or (o.branch_id = any(c.own) and o.vendor_id = c.uid))
       group by 1, 2 order by 3 desc limit 40) t;
  else
    select coalesce(jsonb_agg(t order by t.total desc), '[]') into v_rows from (
      select coalesce(p.full_name, 'sin nombre') as vendedor, o.currency as moneda, round(sum(o.total_amount), 2) as total, count(*) as pedidos
        from orders o join branches b on b.id = o.branch_id left join profiles p on p.id = o.vendor_id
       where o.status = 'confirmed' and o.deleted_at is null and o.org_id = c.org
         and (o.confirmed_at at time zone b.timezone)::date between c.d1 and c.d2
         and o.branch_id = any(c.wide)
       group by 1, 2 order by 3 desc limit 40) t;
  end if;
  return jsonb_build_object('desde', c.d1, 'hasta', c.d2, 'agrupado_por', v_by, 'totales', v_tot, 'filas', v_rows);
end $$;

-- Margen por producto: solo en sucursales donde el usuario tiene permiso de ver costos (inv.see_cost).
create or replace function public.ai_t_product_margin(p_from date default null, p_to date default null)
 returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare c record; v_cost uuid[]; v_best jsonb; v_worst jsonb; v_loss int; v_nocost int;
begin
  select * into c from ai_ctx(p_from, p_to);
  select coalesce(array_agg(x), '{}') into v_cost from unnest(c.wide || c.own) x where has_perm('inv.see_cost', x);
  if cardinality(v_cost) = 0 then
    return jsonb_build_object('sin_permiso', true, 'nota', 'Su usuario no tiene permiso para ver costos y márgenes.');
  end if;
  with base as (
    select oi.product_id, max(oi.description) as producto, o.currency as moneda, sum(oi.qty) as cantidad, sum(oi.line_total) as ingresos,
           sum(oi.qty * coalesce(p.cost, 0)) as costo, bool_or(coalesce(p.cost, 0) = 0) as sin_costo
      from order_items oi join orders o on o.id = oi.order_id join branches b on b.id = o.branch_id
      left join products p on p.id = oi.product_id
     where o.status = 'confirmed' and o.deleted_at is null and o.org_id = c.org and oi.item_kind <> 'labor'
       and (o.confirmed_at at time zone b.timezone)::date between c.d1 and c.d2
       and o.branch_id = any(v_cost) and (o.branch_id = any(c.wide) or o.vendor_id = c.uid)
     group by oi.product_id, o.currency)
  select (select count(*) from base where not sin_costo and ingresos - costo < 0),
         (select count(*) from base where sin_costo),
         (select coalesce(jsonb_agg(t), '[]') from (
            select producto, moneda, round(cantidad, 2) cantidad, round(ingresos, 2) ingresos, round(costo, 2) costo, round(ingresos - costo, 2) ganancia,
                   case when ingresos > 0 then round((ingresos - costo) / ingresos * 100, 1) end as margen_pct
              from base where not sin_costo order by ingresos - costo desc limit 10) t),
         (select coalesce(jsonb_agg(t), '[]') from (
            select producto, moneda, round(cantidad, 2) cantidad, round(ingresos, 2) ingresos, round(costo, 2) costo, round(ingresos - costo, 2) ganancia,
                   case when ingresos > 0 then round((ingresos - costo) / ingresos * 100, 1) end as margen_pct
              from base where not sin_costo order by ingresos - costo asc limit 10) t)
    into v_loss, v_nocost, v_best, v_worst;
  return jsonb_build_object('desde', c.d1, 'hasta', c.d2, 'productos_con_perdida', v_loss, 'productos_sin_costo_registrado', v_nocost,
    'mayor_ganancia', v_best, 'menor_ganancia_o_perdida', v_worst);
end $$;

-- Stock estancado: productos con existencias y sin ventas en los últimos N días.
create or replace function public.ai_t_stagnant_stock(p_days int default 60, p_limit int default 30)
 returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare c record; v_days int := least(greatest(coalesce(p_days, 60), 7), 365); v_lim int := least(greatest(coalesce(p_limit, 30), 1), 50);
        v_cost uuid[]; v_stock uuid[]; v_rows jsonb; v_tot jsonb;
begin
  select * into c from ai_ctx();
  select coalesce(array_agg(b.id), '{}') into v_stock from branches b
   where b.id = any(c.wide || c.own) and (b.id = any(c.wide) or has_branch_role(b.id, '{storekeeper}'));
  if cardinality(v_stock) = 0 then return jsonb_build_object('sin_alcance', true, 'nota', 'Su rol no gestiona inventario.'); end if;
  select coalesce(array_agg(x), '{}') into v_cost from unnest(v_stock) x where has_perm('inv.see_cost', x);
  with st as (
    select p.id, p.name, p.currency, p.cost, br.name as sucursal, s.branch_id, sum(s.qty) as existencias,
           (select max(o.confirmed_at) from order_items oi join orders o on o.id = oi.order_id
             where oi.product_id = p.id and o.branch_id = s.branch_id and o.status = 'confirmed') as ultima_venta
      from stock_levels s join products p on p.id = s.product_id and p.track_stock and p.is_active and p.deleted_at is null
      join branches br on br.id = s.branch_id
     where s.org_id = c.org and s.branch_id = any(v_stock) and s.qty > 0
     group by p.id, p.name, p.currency, p.cost, br.name, s.branch_id),
  stale as (select * from st where ultima_venta is null or ultima_venta < now() - make_interval(days => v_days))
  select (select coalesce(jsonb_agg(t), '[]') from (
            select name as producto, sucursal, round(existencias, 2) as existencias,
                   case when ultima_venta is null then null else (current_date - ultima_venta::date) end as dias_sin_vender,
                   case when branch_id = any(v_cost) and coalesce(cost, 0) > 0 then round(existencias * cost, 2) end as capital_inmovilizado,
                   currency as moneda
              from stale order by (case when branch_id = any(v_cost) then existencias * coalesce(cost, 0) else 0 end) desc, existencias desc limit v_lim) t),
         (select coalesce(jsonb_agg(t), '[]') from (
            select currency as moneda, count(*) as productos, round(sum(case when branch_id = any(v_cost) then existencias * coalesce(cost, 0) else 0 end), 2) as capital_inmovilizado
              from stale group by currency) t)
    into v_rows, v_tot;
  return jsonb_build_object('dias_sin_vender_minimo', v_days, 'resumen', v_tot, 'productos', v_rows,
    'nota_costos', case when cardinality(v_cost) = 0 then 'Sin permiso para ver costos: no se muestra el capital inmovilizado.' end);
end $$;

-- Cartera y mora: clientes con cuotas vencidas dentro del alcance del usuario (cobrador: solo sus rutas).
create or replace function public.ai_t_receivables(p_limit int default 15)
 returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare c record; v_lim int := least(greatest(coalesce(p_limit, 15), 1), 30); v_rows jsonb; v_tot jsonb;
begin
  select * into c from ai_ctx();
  with cu as (
    select cu.id, cu.name, co.base_currency as moneda, customer_overdue(cu.id) as vencido, customer_open_balance(cu.id) as saldo,
           (select min(i.due_date) from installments i where i.customer_id = cu.id and installment_paid(i.id) < i.amount) as cuota_mas_antigua
      from customers cu join companies co on co.id = cu.company_id
     where cu.org_id = c.org and not cu.is_walk_in and cu.deleted_at is null
       and (cu.branch_id = any(c.wide)
            or (cu.branch_id = any(c.own) and cu.route_id in (select r.id from collection_routes r where r.collector_id = c.uid and r.deleted_at is null)))),
  mora as (select * from cu where vencido > 0)
  select (select coalesce(jsonb_agg(t), '[]') from (
            select moneda, count(*) as clientes_en_mora, round(sum(vencido), 2) as total_vencido,
                   (select round(sum(saldo), 2) from cu cu2 where cu2.moneda = m.moneda) as saldo_total_pendiente
              from mora m group by moneda) t),
         (select coalesce(jsonb_agg(t), '[]') from (
            select name as cliente, moneda, round(vencido, 2) as vencido, round(saldo, 2) as saldo,
                   case when cuota_mas_antigua is null then null else greatest(current_date - cuota_mas_antigua, 0) end as dias_de_atraso
              from mora order by vencido desc limit v_lim) t)
    into v_tot, v_rows;
  return jsonb_build_object('resumen', v_tot, 'clientes_con_mayor_mora', v_rows);
end $$;

-- Caja y gastos del período, dentro del alcance.
create or replace function public.ai_t_cash(p_from date default null, p_to date default null)
 returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare c record; v_sh jsonb; v_mov jsonb; v_exp jsonb; v_big jsonb;
begin
  select * into c from ai_ctx(p_from, p_to);
  select coalesce(jsonb_agg(t), '[]') into v_sh from (
    select count(*) as turnos, count(*) filter (where rs.status = 'discrepancy') as con_diferencia,
           round(coalesce(sum(rs.difference), 0), 2) as diferencia_neta, round(coalesce(sum(abs(rs.difference)), 0), 2) as diferencia_absoluta
      from register_shifts rs
     where rs.org_id = c.org and rs.closed_at::date between c.d1 and c.d2
       and (rs.branch_id = any(c.wide) or (rs.branch_id = any(c.own) and rs.cashier_id = c.uid))) t;
  select coalesce(jsonb_agg(t), '[]') into v_mov from (
    select cm.type::text as tipo, cm.currency as moneda, count(*) as movimientos, round(sum(cm.amount), 2) as total
      from cash_movements cm
     where cm.org_id = c.org and cm.created_at::date between c.d1 and c.d2
       and (cm.branch_id = any(c.wide) or (cm.branch_id = any(c.own) and cm.created_by = c.uid))
     group by 1, 2) t;
  select coalesce(jsonb_agg(t), '[]') into v_exp from (
    select e.currency as moneda, count(*) as gastos, round(sum(e.amount), 2) as total
      from expenses e
     where e.org_id = c.org and e.expense_date between c.d1 and c.d2
       and (e.branch_id = any(c.wide) or (e.branch_id = any(c.own) and e.created_by = c.uid))
     group by 1) t;
  select coalesce(jsonb_agg(t), '[]') into v_big from (
    select e.expense_date as fecha, e.description as detalle, e.currency as moneda, round(e.amount, 2) as importe
      from expenses e
     where e.org_id = c.org and e.expense_date between c.d1 and c.d2
       and (e.branch_id = any(c.wide) or (e.branch_id = any(c.own) and e.created_by = c.uid))
     order by e.amount desc limit 8) t;
  return jsonb_build_object('desde', c.d1, 'hasta', c.d2, 'turnos_de_caja', v_sh, 'movimientos_de_caja', v_mov, 'gastos', v_exp, 'gastos_mayores', v_big);
end $$;

-- Cobros y colocación de préstamos del período (cobrador: solo lo propio).
create or replace function public.ai_t_collections(p_from date default null, p_to date default null)
 returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare c record; v_pay jsonb; v_by jsonb; v_loans jsonb;
begin
  select * into c from ai_ctx(p_from, p_to);
  select coalesce(jsonb_agg(t), '[]') into v_pay from (
    select p.currency as moneda, p.method::text as metodo, count(*) as cobros, round(sum(p.amount), 2) as total
      from payments p
     where p.org_id = c.org and p.collected_at::date between c.d1 and c.d2
       and (p.branch_id = any(c.wide) or (p.branch_id = any(c.own) and p.collected_by = c.uid))
     group by 1, 2) t;
  select coalesce(jsonb_agg(t), '[]') into v_by from (
    select coalesce(pr.full_name, 'sin nombre') as cobrador, p.currency as moneda, count(*) as cobros, round(sum(p.amount), 2) as total
      from payments p left join profiles pr on pr.id = p.collected_by
     where p.org_id = c.org and p.collected_at::date between c.d1 and c.d2 and p.branch_id = any(c.wide)
     group by 1, 2 order by 4 desc limit 20) t;
  select coalesce(jsonb_agg(t), '[]') into v_loans from (
    select co.base_currency as moneda, count(*) as prestamos, round(sum(l.principal), 2) as capital_prestado
      from loans l join branches b on b.id = l.branch_id join companies co on co.id = b.company_id
     where l.org_id = c.org and l.cancelled_at is null and l.disbursed_at::date between c.d1 and c.d2
       and (l.branch_id = any(c.wide) or (l.branch_id = any(c.own) and l.collector_id = c.uid))
     group by 1) t;
  return jsonb_build_object('desde', c.d1, 'hasta', c.d2, 'cobros_por_metodo', v_pay, 'cobros_por_cobrador', v_by, 'prestamos_entregados', v_loans);
end $$;

-- Tendencia: período actual contra el período anterior de igual duración.
create or replace function public.ai_t_trend(p_from date default null, p_to date default null)
 returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare c record; v_len int; v_pf date; v_pt date; v_rows jsonb;
begin
  select * into c from ai_ctx(p_from, p_to);
  v_len := c.d2 - c.d1 + 1; v_pt := c.d1 - 1; v_pf := c.d1 - v_len;
  with s as (
    select 'ventas'::text as medida, o.currency as moneda,
           sum(o.total_amount) filter (where (o.confirmed_at at time zone b.timezone)::date between c.d1 and c.d2) as actual,
           sum(o.total_amount) filter (where (o.confirmed_at at time zone b.timezone)::date between v_pf and v_pt) as anterior
      from orders o join branches b on b.id = o.branch_id
     where o.status = 'confirmed' and o.deleted_at is null and o.org_id = c.org
       and (o.confirmed_at at time zone b.timezone)::date between v_pf and c.d2
       and (o.branch_id = any(c.wide) or (o.branch_id = any(c.own) and o.vendor_id = c.uid))
     group by o.currency
    union all
    select 'cobros', p.currency,
           sum(p.amount) filter (where p.collected_at::date between c.d1 and c.d2),
           sum(p.amount) filter (where p.collected_at::date between v_pf and v_pt)
      from payments p
     where p.org_id = c.org and p.collected_at::date between v_pf and c.d2
       and (p.branch_id = any(c.wide) or (p.branch_id = any(c.own) and p.collected_by = c.uid))
     group by p.currency
    union all
    select 'gastos', e.currency,
           sum(e.amount) filter (where e.expense_date between c.d1 and c.d2),
           sum(e.amount) filter (where e.expense_date between v_pf and v_pt)
      from expenses e
     where e.org_id = c.org and e.expense_date between v_pf and c.d2
       and (e.branch_id = any(c.wide) or (e.branch_id = any(c.own) and e.created_by = c.uid))
     group by e.currency)
  select coalesce(jsonb_agg(jsonb_build_object('medida', medida, 'moneda', moneda, 'periodo_actual', round(coalesce(actual, 0), 2),
           'periodo_anterior', round(coalesce(anterior, 0), 2),
           'variacion_pct', case when coalesce(anterior, 0) > 0 then round((coalesce(actual, 0) - anterior) / anterior * 100, 1) end)), '[]')
    into v_rows from s;
  return jsonb_build_object('periodo_actual', jsonb_build_array(c.d1, c.d2), 'periodo_anterior', jsonb_build_array(v_pf, v_pt), 'medidas', v_rows);
end $$;

-- Rendimiento del equipo: solo para quien administra la sucursal u organización; cifras objetivas de ventas y cobros.
create or replace function public.ai_t_team(p_from date default null, p_to date default null)
 returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare c record; v_rows jsonb;
begin
  select * into c from ai_ctx(p_from, p_to);
  if cardinality(c.wide) = 0 then return jsonb_build_object('sin_alcance', true, 'nota', 'El rendimiento del equipo es solo para quien administra.'); end if;
  with v as (
    select o.vendor_id as uid, o.currency as moneda, sum(o.total_amount) as ventas, count(*) as pedidos, 0::numeric as cobros
      from orders o join branches b on b.id = o.branch_id
     where o.status = 'confirmed' and o.deleted_at is null and o.org_id = c.org and o.branch_id = any(c.wide)
       and (o.confirmed_at at time zone b.timezone)::date between c.d1 and c.d2
     group by 1, 2
    union all
    select p.collected_by, p.currency, 0, 0, sum(p.amount)
      from payments p where p.org_id = c.org and p.branch_id = any(c.wide) and p.collected_at::date between c.d1 and c.d2
     group by 1, 2)
  select coalesce(jsonb_agg(t), '[]') into v_rows from (
    select coalesce(pr.full_name, 'sin nombre') as persona, v.moneda, round(sum(v.ventas), 2) as ventas, sum(v.pedidos) as pedidos, round(sum(v.cobros), 2) as cobros
      from v left join profiles pr on pr.id = v.uid
     group by 1, 2 order by sum(v.ventas) + sum(v.cobros) desc limit 25) t;
  return jsonb_build_object('desde', c.d1, 'hasta', c.d2, 'personas', v_rows);
end $$;

-- Solo usuarios autenticados; las funciones internas no se exponen.
revoke execute on function public.ai_ctx(date, date) from public, anon, authenticated;
revoke execute on function public.ai_t_scope_info() from public, anon;
revoke execute on function public.ai_t_sales(date, date, text) from public, anon;
revoke execute on function public.ai_t_product_margin(date, date) from public, anon;
revoke execute on function public.ai_t_stagnant_stock(int, int) from public, anon;
revoke execute on function public.ai_t_receivables(int) from public, anon;
revoke execute on function public.ai_t_cash(date, date) from public, anon;
revoke execute on function public.ai_t_collections(date, date) from public, anon;
revoke execute on function public.ai_t_trend(date, date) from public, anon;
revoke execute on function public.ai_t_team(date, date) from public, anon;
grant execute on function public.ai_t_scope_info() to authenticated;
grant execute on function public.ai_t_sales(date, date, text) to authenticated;
grant execute on function public.ai_t_product_margin(date, date) to authenticated;
grant execute on function public.ai_t_stagnant_stock(int, int) to authenticated;
grant execute on function public.ai_t_receivables(int) to authenticated;
grant execute on function public.ai_t_cash(date, date) to authenticated;
grant execute on function public.ai_t_collections(date, date) to authenticated;
grant execute on function public.ai_t_trend(date, date) to authenticated;
grant execute on function public.ai_t_team(date, date) to authenticated;
