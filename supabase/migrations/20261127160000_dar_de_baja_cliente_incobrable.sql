-- Dar de baja a un cliente incobrable: solo el administrador y solo con 180 días o más de retraso.
-- Sale de la ruta y de la cartera. No toca la caja. Queda constancia en el registro de auditoría.
create or replace function public.owner_write_off_customer(p_customer uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare c customers%rowtype; r collection_routes%rowtype; v_debt numeric; v_orders integer;
begin
  select * into c from customers where id = p_customer and deleted_at is null;
  if not found then raise exception 'Sin permiso'; end if;
  select * into r from collection_routes where id = c.route_id and deleted_at is null;
  if not found or not is_org_owner(r.org_id) then raise exception 'LOAN_NO_PERMISSION'; end if;
  if not org_writable(r.org_id) then raise exception 'Cuenta suspendida: solo lectura'; end if;
  if not exists (
    select 1 from installments i join orders o on o.id = i.order_id
     where o.customer_id = c.id and o.status = 'confirmed' and o.approval_status in ('auto_approved','approved')
       and i.due_date <= branch_today(o.branch_id) - 180
       and i.amount - installment_paid(i.id) > 0
  ) then raise exception 'WRITEOFF_TOO_EARLY'; end if;

  v_debt := customer_open_balance(c.id);
  select count(*) into v_orders from orders o where o.customer_id = c.id and o.status = 'confirmed';

  perform set_config('veltrix.loan_cancel', 'on', true);
  update orders set status = 'cancelled' where customer_id = c.id and status = 'confirmed';
  perform set_config('veltrix.loan_cancel', '', true);
  update loans set cancelled_at = now() where customer_id = c.id and cancelled_at is null;
  update customers set deleted_at = now() where id = c.id;

  insert into audit_log (org_id, branch_id, table_name, row_id, action, actor_id, new_data)
  values (r.org_id, r.branch_id, 'customers', c.id, 'write_off_customer', auth.uid(),
          jsonb_build_object('customer', c.name, 'route', r.name, 'debt_written_off', v_debt, 'credits', v_orders));
end $$;
revoke all on function public.owner_write_off_customer(uuid) from public, anon;
grant execute on function public.owner_write_off_customer(uuid) to authenticated;
