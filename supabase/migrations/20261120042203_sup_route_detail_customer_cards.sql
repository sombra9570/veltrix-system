do $m$
declare d text; n text;
begin
  d := pg_get_functiondef('public.sup_route_detail(uuid)'::regprocedure);
  n := replace(d, $a$'rating', customer_rating(c.id), 'balance', customer_open_balance(c.id), 'overdue', customer_overdue(c.id),$a$,
    $b$'rating', customer_rating(c.id), 'balance', customer_open_balance(c.id), 'overdue', customer_overdue(c.id),
        'due_today', (select coalesce(sum(i.amount - installment_paid(i.id)), 0) from installments i join orders o on o.id = i.order_id
                       where o.customer_id = c.id and o.status = 'confirmed' and o.approval_status in ('auto_approved','approved')
                         and i.due_date = branch_today(c.branch_id)),
        'next_due', (select min(i.due_date) from installments i join orders o on o.id = i.order_id
                      where o.customer_id = c.id and o.status = 'confirmed' and o.approval_status in ('auto_approved','approved')
                        and i.amount - installment_paid(i.id) > 0),
        'paid_today', exists (select 1 from payments p2 where p2.customer_id = c.id and p2.route_id = r.id and p2.amount > 0 and p2.reverses_payment_id is null
                              and (p2.collected_at at time zone (select timezone from branches where id = r.branch_id))::date = branch_today(r.branch_id)),
        'visited_today', exists (select 1 from visits v where v.customer_id = c.id and v.route_id = r.id
                                  and (v.visited_at at time zone (select timezone from branches where id = r.branch_id))::date = branch_today(r.branch_id)),
        'last_visit', (select jsonb_build_object('at', v.visited_at, 'result', v.result, 'notes', v.notes, 'promise_date', v.promise_date, 'promise_amount', v.promise_amount)
                         from visits v where v.customer_id = c.id order by v.visited_at desc limit 1),$b$);
  if n = d then raise exception 'customers block not found'; end if;
  d := n;
  n := replace(d, $a$'can_liquidate', has_perm('routes.liquidate', r.branch_id),$a$,
    $b$'can_liquidate', has_perm('routes.liquidate', r.branch_id),
    'org_id', r.org_id, 'today', branch_today(r.branch_id),
    'can_customers', has_perm('loans.customers', r.branch_id),$b$);
  if n = d then raise exception 'top block not found'; end if;
  execute n;
end $m$;
