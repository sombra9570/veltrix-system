-- Unifica las políticas permisivas duplicadas (lectura + escritura "ALL") sin cambiar quién puede qué:
--  · la política de lectura pasa a ser (lectura anterior OR condición de la escritura anterior);
--  · la escritura "ALL" se separa en INSERT / UPDATE / DELETE con las mismas condiciones.
do $$
declare r record; p_read record; p_write record; v_w_using text; v_w_check text;
begin
  for r in select * from (values
    ('commission_rules','comm_read','comm_write'),('dining_areas','areas_read','areas_write'),('dining_tables','tables_read','tables_write'),
    ('installments','inst_read','inst_write'),('modifier_groups','modgroups_read','modgroups_write'),('modifier_options','modopts_read','modopts_write'),
    ('order_item_modifiers','oim_read','oim_write'),('order_items','items_read','items_write'),('product_modifier_groups','pmg_read','pmg_write'),
    ('purchase_items','pitems_read','pitems_write'),('recipes','recipes_read','recipes_write'),('route_assignments','assign_read','assign_write')
  ) v(t, rd, wr)
  loop
    select * into p_read from pg_policies where schemaname='public' and tablename=r.t and policyname=r.rd;
    select * into p_write from pg_policies where schemaname='public' and tablename=r.t and policyname=r.wr;
    if p_read.policyname is null or p_write.policyname is null then raise exception 'Política no encontrada en %', r.t; end if;
    v_w_using := p_write.qual; v_w_check := coalesce(p_write.with_check, p_write.qual);
    execute format('alter policy %I on public.%I using ((%s) or (%s))', r.rd, r.t, p_read.qual, v_w_using);
    execute format('drop policy %I on public.%I', r.wr, r.t);
    execute format('create policy %I on public.%I for insert to authenticated with check (%s)', r.wr || '_ins', r.t, v_w_check);
    execute format('create policy %I on public.%I for update to authenticated using (%s) with check (%s)', r.wr || '_upd', r.t, v_w_using, v_w_check);
    execute format('create policy %I on public.%I for delete to authenticated using (%s)', r.wr || '_del', r.t, v_w_using);
  end loop;
end $$;

drop policy plans_admin on public.plans;
create policy plans_admin_ins on public.plans for insert to authenticated with check (is_platform_admin());
create policy plans_admin_upd on public.plans for update to authenticated using (is_platform_admin()) with check (is_platform_admin());
create policy plans_admin_del on public.plans for delete to authenticated using (is_platform_admin());

drop policy products_insert on public.products;
drop policy products_staff_insert on public.products;
create policy products_insert on public.products for insert to authenticated
  with check ((is_org_owner(org_id) or has_company_role(company_id, '{supervisor,storekeeper}'::app_role[])) and org_writable(org_id));
drop policy products_update on public.products;
drop policy products_staff_update on public.products;
create policy products_update on public.products for update to authenticated
  using (is_org_owner(org_id) or has_company_role(company_id, '{supervisor,storekeeper}'::app_role[]))
  with check (is_org_owner(org_id) or has_company_role(company_id, '{supervisor,storekeeper}'::app_role[]));
