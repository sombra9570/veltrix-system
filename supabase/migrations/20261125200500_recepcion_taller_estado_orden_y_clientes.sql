create or replace function public.set_work_order_status(p_wo uuid, p_status work_order_status, p_diagnosis text default null)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare w work_orders%rowtype; v_order_status order_status;
begin
  select * into w from work_orders where id = p_wo for update;
  if not found then raise exception 'Orden inexistente'; end if;
  if not can_work_shop(w.branch_id) then
    raise exception 'Sin permiso';
  end if;
  if p_status = 'delivered' then
    select status into v_order_status from orders where id = w.order_id;
    if v_order_status <> 'confirmed' then raise exception 'Primero se factura (confirma) la orden'; end if;
  end if;
  update work_orders set status = p_status, diagnosis = coalesce(p_diagnosis, diagnosis),
         delivered_at = case when p_status = 'delivered' then now() else delivered_at end,
         updated_at = now()
   where id = p_wo;
end $function$;

drop policy customers_read on public.customers;
create policy customers_read on public.customers for select using (
  org_reader(org_id) OR branch_reader(branch_id) OR has_branch_role(branch_id, '{vendor,technician}'::app_role[])
  OR can_work_shop(branch_id) OR collector_sees_customer(id) OR (is_walk_in AND is_branch_member(branch_id)));

drop policy customers_update on public.customers;
create policy customers_update on public.customers for update
  using (has_branch_role(branch_id, '{supervisor,vendor,technician}'::app_role[]) OR is_branch_manager(branch_id) OR can_work_shop(branch_id))
  with check (has_branch_role(branch_id, '{supervisor,vendor,technician}'::app_role[]) OR is_branch_manager(branch_id) OR can_work_shop(branch_id));
