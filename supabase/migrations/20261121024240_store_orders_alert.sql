create or replace function public.my_store_orders_alert() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c record; v_pending int := 0; v_assigned int := 0; v_waiting int := 0; v_first uuid; v_eligible boolean := false; v_hot uuid;
        p int; a int; w int; v_all boolean;
begin
  for c in select co.id from companies co
            where co.deleted_at is null and co.org_id in (select m.org_id from memberships m where m.user_id = auth.uid() and m.is_active and m.deleted_at is null)
  loop
    if not my_store_access(c.id) then continue; end if;
    v_eligible := true; v_first := coalesce(v_first, c.id);
    v_all := store_perm('store.orders', c.id) or store_perm('store.assign', c.id);
    select count(*) filter (where v_all and r.status = 'pending'),
           count(*) filter (where r.status = 'accepted' and r.fulfilled_at is null and r.assigned_to = auth.uid()),
           count(*) filter (where r.status in ('pending','accepted') and r.fulfilled_at is null and (v_all or r.assigned_to = auth.uid())
                             and coalesce((select m.from_customer from store_order_messages m where m.request_id = r.id order by m.created_at desc limit 1), false))
      into p, a, w
      from delivery_requests r join branches b on b.id = r.branch_id where b.company_id = c.id;
    v_pending := v_pending + coalesce(p, 0); v_assigned := v_assigned + coalesce(a, 0); v_waiting := v_waiting + coalesce(w, 0);
    if coalesce(p, 0) + coalesce(a, 0) + coalesce(w, 0) > 0 and v_hot is null then v_hot := c.id; end if;
  end loop;
  return jsonb_build_object('eligible', v_eligible, 'pending', v_pending, 'assigned', v_assigned, 'waiting', v_waiting,
                            'total', v_pending + v_assigned + v_waiting, 'company_id', coalesce(v_hot, v_first));
end $$;
revoke all on function public.my_store_orders_alert() from public, anon;
grant execute on function public.my_store_orders_alert() to authenticated;
