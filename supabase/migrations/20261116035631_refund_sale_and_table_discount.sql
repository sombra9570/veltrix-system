alter table approval_requests drop constraint if exists approval_requests_kind_check;
alter table approval_requests add constraint approval_requests_kind_check check (kind in ('cancel_sale', 'refund_sale'));

create or replace function public.refund_sale(p_order uuid, p_reason text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare o orders%rowtype; pay record; v_rev uuid;
begin
  select * into o from orders where id = p_order and deleted_at is null for update;
  if not found or not is_branch_manager(o.branch_id) then raise exception 'Sin permiso'; end if;
  if o.status <> 'confirmed' then raise exception 'SALE_NOT_CANCELLABLE'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Indique el motivo'; end if;
  for pay in
    select distinct p.id
      from payments p
      join payment_allocations pa on pa.payment_id = p.id
      join installments i on i.id = pa.installment_id
     where i.order_id = o.id and p.reverses_payment_id is null
       and not exists (select 1 from payments r where r.reverses_payment_id = p.id)
  loop
    if exists (select 1 from payment_allocations pa2 join installments i2 on i2.id = pa2.installment_id
                where pa2.payment_id = pay.id and i2.order_id <> o.id) then
      raise exception 'REFUND_SHARED_PAYMENT';
    end if;
    insert into payment_reversals (branch_id, payment_id, requested_by, reason)
    values (o.branch_id, pay.id, auth.uid(), 'Devolución de venta: ' || left(trim(p_reason), 200)) returning id into v_rev;
    perform decide_reversal(v_rev, true);
  end loop;
  perform cancel_sale(p_order, 'Devolución: ' || left(trim(p_reason), 280));
  insert into audit_log (org_id, branch_id, table_name, row_id, action, actor_id, new_data)
  values (o.org_id, o.branch_id, 'orders', o.id, 'sale_refunded', auth.uid(),
          jsonb_build_object('reason', left(trim(p_reason), 300), 'total', o.total_amount));
end $$;

create or replace function public.request_cancel_sale(p_order uuid, p_reason text)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare o orders%rowtype; v_id uuid; v_paid boolean; v_kind text;
begin
  select * into o from orders where id = p_order and deleted_at is null;
  if not found then raise exception 'Venta inexistente'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Indique el motivo'; end if;
  v_paid := _order_paid(o.id) <> 0;
  v_kind := case when v_paid then 'refund_sale' else 'cancel_sale' end;
  if is_branch_manager(o.branch_id) then
    if v_paid then perform refund_sale(p_order, p_reason); else perform cancel_sale(p_order, p_reason); end if;
    return null;
  end if;
  if not (o.vendor_id = auth.uid() or can_sell(o.branch_id)) then raise exception 'Sin permiso'; end if;
  if not has_perm('sales.cancel_request', o.branch_id) then raise exception 'PERM_DENIED'; end if;
  if o.status <> 'confirmed' then raise exception 'SALE_NOT_CANCELLABLE'; end if;
  if exists (select 1 from approval_requests where ref_id = p_order and status = 'pending') then raise exception 'REQUEST_PENDING'; end if;
  insert into approval_requests (org_id, branch_id, kind, ref_id, amount, reason)
  values (o.org_id, o.branch_id, v_kind, o.id, o.total_amount, left(trim(p_reason), 300)) returning id into v_id;
  return v_id;
end $$;

create or replace function public.decide_approval(p_id uuid, p_approve boolean, p_note text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare a approval_requests%rowtype;
begin
  select * into a from approval_requests where id = p_id for update;
  if not found or not is_branch_manager(a.branch_id) then raise exception 'Sin permiso'; end if;
  if a.status <> 'pending' then raise exception 'Ya fue resuelta'; end if;
  if p_approve then
    if a.kind = 'refund_sale' then perform refund_sale(a.ref_id, a.reason);
    elsif a.kind = 'cancel_sale' then perform cancel_sale(a.ref_id, a.reason); end if;
  end if;
  update approval_requests set status = case when p_approve then 'approved' else 'rejected' end,
         decided_by = auth.uid(), decided_at = now(), decision_note = nullif(left(trim(coalesce(p_note, '')), 300), '')
   where id = p_id;
end $$;

drop function if exists public.close_table(uuid, numeric);
create or replace function public.close_table(p_order uuid, p_tip numeric, p_discount numeric default 0)
returns void language plpgsql security definer set search_path to 'public' as $$
declare o orders%rowtype; v_pct numeric := coalesce(p_discount, 0); v_cap numeric; v_full numeric;
begin
  select * into o from orders where id = p_order for update;
  if not found or o.status <> 'draft' then raise exception 'La cuenta ya está cerrada'; end if;
  if not can_serve_tables(o.branch_id) then raise exception 'Sin permiso'; end if;
  if coalesce(p_tip, 0) < 0 then raise exception 'Propina inválida'; end if;
  if v_pct < 0 or v_pct >= 100 then raise exception 'Descuento inválido'; end if;
  if v_pct > 0 then
    v_cap := my_limit('discount_pct', o.branch_id);
    if v_cap is not null and v_pct > v_cap then raise exception 'DISCOUNT_OVER_LIMIT:%', v_cap; end if;
    select coalesce(sum(line_total), 0) into v_full from order_items where order_id = o.id and kitchen_status is distinct from 'cancelled';
    update order_items set unit_price = round(unit_price * (1 - v_pct / 100), 2) where order_id = o.id;
    update orders set notes = concat_ws(' · ', nullif(notes, ''), 'Descuento ' || v_pct || '%') where id = o.id;
    insert into audit_log (org_id, branch_id, table_name, row_id, action, actor_id, new_data)
    values (o.org_id, o.branch_id, 'orders', o.id, 'sale_discount', auth.uid(),
            jsonb_build_object('pct', v_pct, 'amount', round(v_full - (select coalesce(sum(line_total), 0) from order_items where order_id = o.id and kitchen_status is distinct from 'cancelled'), 2)));
  end if;
  update orders set tip_amount = round(coalesce(p_tip, 0), 2), status = 'confirmed' where id = o.id;
end $$;

revoke all on function public.refund_sale(uuid, text) from public, anon;
revoke all on function public.close_table(uuid, numeric, numeric) from public, anon;
grant execute on function public.refund_sale(uuid, text) to authenticated;
grant execute on function public.close_table(uuid, numeric, numeric) to authenticated;
