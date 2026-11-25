create or replace function public.customers_list(p_branch uuid, p_search text default null)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $b$
declare q text := nullif(lower(trim(coalesce(p_search, ''))), ''); today date := branch_today(p_branch);
begin
  if not can_read_customers(p_branch) then raise exception 'Sin permiso'; end if;
  return (
    select coalesce(jsonb_agg(x order by x->>'name'), '[]'::jsonb) from (
      select jsonb_build_object('id', c.id, 'name', c.name, 'tax_id', c.tax_id, 'phone', c.phone,
               'credit_limit', c.credit_limit, 'credit_status', c.credit_status,
               'balance', coalesce(s.bal, 0), 'overdue', coalesce(s.ovd, 0),
               'has_doc', c.doc_photo_path is not null) as x
        from (select * from customers c0
               where c0.branch_id = p_branch and not c0.is_walk_in and c0.deleted_at is null
                 and (q is null or lower(c0.name) like '%' || q || '%' or lower(coalesce(c0.tax_id, '')) like '%' || q || '%' or coalesce(c0.phone, '') like '%' || q || '%')
               limit 300) c
        left join lateral (
          select sum(i.amount - coalesce(t.paid, 0)) filter (where o.approval_status in ('auto_approved','approved','pending_supervisor')) bal,
                 sum(i.amount - coalesce(t.paid, 0)) filter (where o.approval_status in ('auto_approved','approved') and i.due_date < today and i.amount - coalesce(t.paid, 0) > 0) ovd
            from orders o join installments i on i.order_id = o.id
            left join installment_totals t on t.installment_id = i.id
           where o.customer_id = c.id and o.status = 'confirmed' and o.approval_status in ('auto_approved','approved','pending_supervisor')) s on true) t);
end $b$;
