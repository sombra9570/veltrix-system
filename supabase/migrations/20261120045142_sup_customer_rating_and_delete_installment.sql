create table if not exists customer_sup_ratings (
  id bigint generated always as identity primary key,
  org_id uuid not null, customer_id uuid not null references customers(id), route_id uuid not null,
  supervision_id uuid not null, supervisor_id uuid not null,
  rating text not null check (rating in ('excellent','good','bad','clavo','volado','suspicious')),
  at timestamptz not null default now()
);
create index if not exists customer_sup_ratings_cust_idx on customer_sup_ratings (customer_id, at desc);
create index if not exists customer_sup_ratings_sup_idx on customer_sup_ratings (supervision_id);
alter table customer_sup_ratings enable row level security;

create or replace function sup_rating_label(p text) returns text language sql immutable as $$
  select case p when 'excellent' then 'Excelente' when 'good' then 'Bueno' when 'bad' then 'Malo' when 'clavo' then 'Clavo'
                when 'volado' then 'Volado' when 'suspicious' then 'Sospechoso' else p end;
$$;

create or replace function sup_rate_customer(p_route uuid, p_customer uuid, p_rating text) returns void language plpgsql security definer set search_path to 'public' as $$
declare r collection_routes; v uuid; c customers;
begin
  r := _sup_route(p_route);
  select * into c from customers where id = p_customer and route_id = r.id and deleted_at is null;
  if not found then raise exception 'PERM_DENIED'; end if;
  if p_rating not in ('excellent','good','bad','clavo','volado','suspicious') then raise exception 'RATING_INVALID'; end if;
  v := _sup_open(p_route);
  insert into customer_sup_ratings (org_id, customer_id, route_id, supervision_id, supervisor_id, rating)
  values (r.org_id, c.id, r.id, v, auth.uid(), p_rating);
  insert into route_supervision_log (supervision_id, org_id, route_id, supervisor_id, action, detail)
  values (v, r.org_id, r.id, auth.uid(), 'rate_customer', jsonb_build_object('customer', c.name, 'rating', p_rating));
end $$;
revoke all on function sup_rate_customer(uuid,uuid,text) from public, anon;
grant execute on function sup_rate_customer(uuid,uuid,text) to authenticated;

-- Detalle de ruta del supervisor: calificación vigente del cliente y permiso de borrar cuotas
do $m$
declare d text; n text;
begin
  d := pg_get_functiondef('public.sup_route_detail(uuid)'::regprocedure);
  n := replace(d, $a$'credits', customer_credit_cards(c.id)) order by c.name)$a$,
     $b$'credits', customer_credit_cards(c.id),
        'sup_rating', (select s.rating from customer_sup_ratings s where s.customer_id = c.id order by s.at desc limit 1)) order by c.name)$b$);
  if n = d then raise exception 'detail credits not found'; end if;
  d := n;
  n := replace(d, $a$'can_customers', has_perm('loans.customers', r.branch_id),$a$,
     $b$'can_customers', has_perm('loans.customers', r.branch_id),
    'can_delete_installments', has_perm('collector.delete_installments', r.branch_id),$b$);
  if n = d then raise exception 'detail perms not found'; end if;
  execute n;
end $m$;

-- Reporte al administrador: calificaciones de clientes dadas por el supervisor
do $m$
declare d text; n text;
begin
  d := pg_get_functiondef('public.sup_finish(uuid)'::regprocedure);
  n := replace(d, $a$action <> 'start' order by at loop$a$, $b$action not in ('start', 'rate_customer') order by at loop$b$);
  if n = d then raise exception 'finish select not found'; end if;
  d := n;
  n := replace(d, E'      else l.action end;\n  end loop;\n',
    E'      when ''other'' then coalesce(l.detail->>''text'', ''Otra acción'')\n      else l.action end;\n  end loop;\n'
    || E'  if exists (select 1 from customer_sup_ratings where supervision_id = s.id) then\n'
    || E'    body := body || E''\\n\\nCalificación de clientes (dada por el supervisor):'';\n'
    || E'    for l in select distinct on (x.customer_id) x.customer_id, x.rating, (select name from customers where id = x.customer_id) as cname\n'
    || E'               from customer_sup_ratings x where x.supervision_id = s.id order by x.customer_id, x.at desc loop\n'
    || E'      body := body || E''\\n- '' || coalesce(l.cname, ''—'') || '': '' || sup_rating_label(l.rating);\n'
    || E'    end loop;\n  end if;\n');
  if n = d then raise exception 'finish loop end not found'; end if;
  execute n;
end $m$;

-- Borrar cuota = revertir el último cobro que la cubrió (permiso collector.delete_installments)
create or replace function collector_delete_installment(p_order uuid, p_n int) returns void language plpgsql security definer set search_path to 'public' as $$
declare o record; r collection_routes; i installments; p payments; v_new uuid; a record; v_late boolean; allowed boolean; v uuid;
begin
  select ord.id, ord.customer_id into o from orders ord where ord.id = p_order;
  if not found then raise exception 'Sin permiso'; end if;
  select cr.* into r from collection_routes cr join customers c on c.route_id = cr.id where c.id = o.customer_id and cr.deleted_at is null and cr.is_active;
  if not found then raise exception 'Sin permiso'; end if;
  perform assert_route_open(r.id);
  if r.collector_id = auth.uid() then
    allowed := coalesce((r.permissions->>'collector.delete_installments')::boolean, has_perm('collector.delete_installments', r.branch_id));
  elsif r.supervisor_id = auth.uid() or is_branch_manager(r.branch_id) or is_org_owner(r.org_id) then
    allowed := has_perm('collector.delete_installments', r.branch_id);
  else allowed := false; end if;
  if not allowed then raise exception 'LOAN_NO_PERMISSION'; end if;
  if not org_writable(r.org_id) then raise exception 'Cuenta suspendida: solo lectura'; end if;
  select * into i from installments where order_id = p_order and number = p_n;
  if not found then raise exception 'Sin permiso'; end if;
  select pp.* into p from payment_allocations al join payments pp on pp.id = al.payment_id
   where al.installment_id = i.id and al.amount > 0 and pp.reverses_payment_id is null
     and not exists (select 1 from payments x where x.reverses_payment_id = pp.id)
   order by pp.collected_at desc limit 1 for update of pp;
  if not found then raise exception 'INSTALLMENT_NOT_PAID'; end if;
  v_late := exists (select 1 from register_shifts where id = p.shift_id and status <> 'open')
         or exists (select 1 from route_settlements where id = p.settlement_id and status <> 'pending_delivery');
  insert into payments (branch_id, customer_id, origin_type, shift_id, route_id, settlement_id, collected_by, method, amount, currency,
                        custody_status, reverses_payment_id, needs_review, review_note, collected_at)
  values (p.branch_id, p.customer_id, p.origin_type, p.shift_id, p.route_id, p.settlement_id, coalesce(p.collected_by, auth.uid()), p.method, -p.amount, p.currency,
          p.custody_status, p.id, v_late, case when v_late then 'Cuota borrada después del cierre: ajustar en auditoría' end, now())
  returning id into v_new;
  for a in select installment_id, amount from payment_allocations where payment_id = p.id loop
    insert into payment_allocations (payment_id, installment_id, amount) values (v_new, a.installment_id, -a.amount);
  end loop;
  insert into payment_reversals (org_id, company_id, branch_id, payment_id, requested_by, reason, status, decided_by, decided_at, reversal_payment_id)
  values (p.org_id, p.company_id, p.branch_id, p.id, auth.uid(), 'Cuota ' || p_n || ' borrada', 'approved', auth.uid(), now(), v_new);
  if r.supervisor_id = auth.uid() then
    select s.id into v from route_supervisions s where s.route_id = r.id and s.supervisor_id = auth.uid() and s.ended_at is null limit 1;
    if v is not null then
      insert into route_supervision_log (supervision_id, org_id, route_id, supervisor_id, action, detail)
      values (v, r.org_id, r.id, auth.uid(), 'other', jsonb_build_object('text', 'Borró la cuota ' || p_n || ' (revirtió un cobro de ' || p.amount || ')'));
    end if;
  end if;
end $$;
revoke all on function collector_delete_installment(uuid,int) from public, anon;
grant execute on function collector_delete_installment(uuid,int) to authenticated;
