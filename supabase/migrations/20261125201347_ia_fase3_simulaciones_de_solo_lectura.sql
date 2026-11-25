-- Simulación "qué pasa si": cambia precio, costo y volumen sobre las ventas reales del periodo. Solo calcula, no modifica nada.
create or replace function public.ai_t_whatif(p_from date default null, p_to date default null, p_price_pct numeric default 0,
  p_cost_pct numeric default 0, p_volume_pct numeric default 0, p_product text default null)
 returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare c record; v_cost uuid[]; v_pp numeric := least(greatest(coalesce(p_price_pct, 0), -90), 200) / 100;
        v_cp numeric := least(greatest(coalesce(p_cost_pct, 0), -50), 200) / 100; v_vp numeric := least(greatest(coalesce(p_volume_pct, 0), -90), 300) / 100;
        v_q text := nullif(lower(trim(coalesce(p_product, ''))), ''); v_rows jsonb; v_excl jsonb;
begin
  select * into c from ai_ctx(p_from, p_to);
  select coalesce(array_agg(x), '{}') into v_cost from unnest(c.wide || c.own) x where has_perm('inv.see_cost', x);
  if cardinality(v_cost) = 0 then
    return jsonb_build_object('sin_permiso', true, 'nota', 'Su usuario no tiene permiso para ver costos y márgenes.');
  end if;
  with base as (
    select o.currency as moneda, oi.line_total as ingresos, oi.qty * coalesce(p.cost, 0) as costo, coalesce(p.cost, 0) > 0 as con_costo
      from order_items oi join orders o on o.id = oi.order_id join branches b on b.id = o.branch_id
      left join products p on p.id = oi.product_id
     where o.status = 'confirmed' and o.deleted_at is null and o.org_id = c.org and oi.item_kind <> 'labor'
       and (o.confirmed_at at time zone b.timezone)::date between c.d1 and c.d2
       and o.branch_id = any(v_cost) and (o.branch_id = any(c.wide) or o.vendor_id = c.uid)
       and (v_q is null or position(v_q in lower(coalesce(oi.description, ''))) > 0)),
  agg as (select moneda, sum(ingresos) filter (where con_costo) as ing, sum(costo) filter (where con_costo) as cst,
                 sum(ingresos) filter (where not con_costo) as ing_sin_costo
            from base group by moneda)
  select coalesce(jsonb_agg(jsonb_build_object('moneda', moneda,
           'actual', jsonb_build_object('ingresos', round(coalesce(ing, 0), 2), 'costo', round(coalesce(cst, 0), 2), 'ganancia', round(coalesce(ing, 0) - coalesce(cst, 0), 2)),
           'escenario', jsonb_build_object('ingresos', round(coalesce(ing, 0) * (1 + v_pp) * (1 + v_vp), 2),
                         'costo', round(coalesce(cst, 0) * (1 + v_cp) * (1 + v_vp), 2),
                         'ganancia', round(coalesce(ing, 0) * (1 + v_pp) * (1 + v_vp) - coalesce(cst, 0) * (1 + v_cp) * (1 + v_vp), 2)),
           'diferencia_ganancia', round((coalesce(ing, 0) * (1 + v_pp) - coalesce(cst, 0) * (1 + v_cp)) * (1 + v_vp) - (coalesce(ing, 0) - coalesce(cst, 0)), 2),
           'variacion_volumen_para_igualar_ganancia_actual_pct',
             case when coalesce(ing, 0) * (1 + v_pp) - coalesce(cst, 0) * (1 + v_cp) > 0 and coalesce(ing, 0) - coalesce(cst, 0) > 0
                  then round(((coalesce(ing, 0) - coalesce(cst, 0)) / (coalesce(ing, 0) * (1 + v_pp) - coalesce(cst, 0) * (1 + v_cp)) - 1) * 100, 1) end)), '[]'),
         coalesce(jsonb_agg(jsonb_build_object('moneda', moneda, 'ventas_excluidas_por_no_tener_costo', round(coalesce(ing_sin_costo, 0), 2)))
                  filter (where coalesce(ing_sin_costo, 0) > 0), '[]')
    into v_rows, v_excl from agg;
  return jsonb_build_object('desde', c.d1, 'hasta', c.d2, 'producto_filtrado', v_q,
    'supuestos', jsonb_build_object('precio_pct', v_pp * 100, 'costo_pct', v_cp * 100, 'volumen_pct', v_vp * 100),
    'resultado', v_rows, 'excluido', v_excl,
    'nota', 'Simulación sobre las ventas reales del periodo, sin efecto de la demanda: el volumen es un supuesto que indica quien consulta.');
end $$;

-- Simulación de liquidar stock estancado con descuento: capital liberado frente al costo.
create or replace function public.ai_t_liquidation(p_days int default 60, p_discount_pct numeric default 20)
 returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare c record; v_days int := least(greatest(coalesce(p_days, 60), 7), 365); v_d numeric := least(greatest(coalesce(p_discount_pct, 20), 0), 90) / 100;
        v_cost uuid[]; v_stock uuid[]; v_rows jsonb; v_loss jsonb;
begin
  select * into c from ai_ctx();
  select coalesce(array_agg(b.id), '{}') into v_stock from branches b
   where b.id = any(c.wide || c.own) and (b.id = any(c.wide) or has_branch_role(b.id, '{storekeeper}'));
  if cardinality(v_stock) = 0 then return jsonb_build_object('sin_alcance', true, 'nota', 'Su rol no gestiona inventario.'); end if;
  select coalesce(array_agg(x), '{}') into v_cost from unnest(v_stock) x where has_perm('inv.see_cost', x);
  if cardinality(v_cost) = 0 then return jsonb_build_object('sin_permiso', true, 'nota', 'Su usuario no tiene permiso para ver costos.'); end if;
  with st as (
    select p.id, p.name, p.currency, p.cost, p.unit_price, s.branch_id, sum(s.qty) as existencias,
           (select max(o.confirmed_at) from order_items oi join orders o on o.id = oi.order_id
             where oi.product_id = p.id and o.branch_id = s.branch_id and o.status = 'confirmed') as ultima_venta
      from stock_levels s join products p on p.id = s.product_id and p.track_stock and p.is_active and p.deleted_at is null
     where s.org_id = c.org and s.branch_id = any(v_cost) and s.qty > 0 and coalesce(p.cost, 0) > 0
     group by p.id, p.name, p.currency, p.cost, p.unit_price, s.branch_id),
  stale as (select *, existencias * cost as capital, existencias * unit_price * (1 - v_d) as caja
              from st where ultima_venta is null or ultima_venta < now() - make_interval(days => v_days))
  select (select coalesce(jsonb_agg(t), '[]') from (
            select currency as moneda, count(*) as productos, round(sum(capital), 2) as capital_a_costo, round(sum(caja), 2) as caja_si_se_vende_todo,
                   round(sum(caja) - sum(capital), 2) as resultado_vs_costo
              from stale group by currency) t),
         (select coalesce(jsonb_agg(t), '[]') from (
            select name as producto, currency as moneda, round(existencias, 2) as existencias, round(cost, 2) as costo_unitario,
                   round(unit_price * (1 - v_d), 2) as precio_con_descuento
              from stale where unit_price * (1 - v_d) < cost order by existencias * (cost - unit_price * (1 - v_d)) desc limit 10) t)
    into v_rows, v_loss;
  return jsonb_build_object('dias_sin_vender_minimo', v_days, 'descuento_pct', v_d * 100, 'resumen', v_rows, 'se_venderian_bajo_el_costo', v_loss,
    'nota', 'Supone que se vende todo el stock estancado al precio actual con descuento; no estima la demanda. No incluye productos sin costo registrado.');
end $$;

revoke execute on function public.ai_t_whatif(date, date, numeric, numeric, numeric, text) from public, anon;
revoke execute on function public.ai_t_liquidation(int, numeric) from public, anon;
grant execute on function public.ai_t_whatif(date, date, numeric, numeric, numeric, text) to authenticated;
grant execute on function public.ai_t_liquidation(int, numeric) to authenticated;
