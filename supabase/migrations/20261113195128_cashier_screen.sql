create or replace function cashier_home() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s register_shifts%rowtype;
begin
  select * into s from register_shifts where cashier_id = auth.uid() and status = 'open';

  return jsonb_build_object(
    'shift', case when s.id is null then null else jsonb_build_object(
      'id', s.id,
      'opened_at', s.opened_at,
      'opening_cash', s.opening_cash,
      'register', (select name from cash_registers where id = s.register_id),
      'branch', (select name from branches where id = s.branch_id),
      'currency', (select base_currency from companies where id = s.company_id),
      'payments', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'id', p.id, 'at', p.collected_at, 'customer', c.name,
                 'method', p.method, 'amount', p.amount) order by p.collected_at desc), '[]'::jsonb)
          from payments p join customers c on c.id = p.customer_id
         where p.shift_id = s.id),
      'movements', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'id', m.id, 'at', m.created_at, 'type', m.type,
                 'amount', m.amount, 'description', m.description) order by m.created_at desc), '[]'::jsonb)
          from cash_movements m
         where m.shift_id = s.id)
    ) end,

    'registers', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', r.id, 'name', r.name, 'branch', b.name, 'currency', co.base_currency,
               'busy', exists (select 1 from register_shifts x where x.register_id = r.id and x.status = 'open'))
             order by b.name, r.name), '[]'::jsonb)
        from cash_registers r
        join branches b on b.id = r.branch_id
        join companies co on co.id = r.company_id
       where r.is_active and r.deleted_at is null and b.is_active and b.deleted_at is null
         and has_branch_role(r.branch_id, '{cashier}')),

    'last_closed', (
      select jsonb_build_object('status', x.status, 'difference', x.difference, 'closed_at', x.closed_at,
                                'currency', (select base_currency from companies where id = x.company_id))
        from register_shifts x
       where x.cashier_id = auth.uid() and x.status <> 'open'
       order by x.closed_at desc limit 1)
  );
end $$;

create or replace function cashier_order_items(p_order uuid)
returns table (description text, qty numeric, unit_price numeric, line_total numeric)
language sql stable security definer set search_path = public as $$
  select i.description, i.qty, i.unit_price, i.line_total
    from order_items i
    join orders o on o.id = i.order_id
   where o.id = p_order
     and o.status = 'confirmed'
     and o.branch_id in (select branch_id from register_shifts where cashier_id = auth.uid() and status = 'open')
     and i.kitchen_status is distinct from 'cancelled'
   order by i.created_at;
$$;

create or replace function add_cash_movement(p_type cash_movement_type, p_amount numeric, p_description text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare s register_shifts%rowtype; v_id uuid; v_cur char(3);
begin
  select * into s from register_shifts where cashier_id = auth.uid() and status = 'open';
  if s.id is null then raise exception 'Necesita un turno de caja abierto'; end if;
  if not org_writable(s.org_id) then raise exception 'Cuenta suspendida: solo lectura'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Monto inválido'; end if;
  if coalesce(trim(p_description), '') = '' then raise exception 'Indique el motivo'; end if;
  select base_currency into v_cur from companies where id = s.company_id;

  insert into cash_movements (branch_id, type, amount, currency, shift_id, description, created_by)
  values (s.branch_id, p_type, round(p_amount, 2), v_cur, s.id, trim(p_description), auth.uid())
  returning id into v_id;
  return v_id;
end $$;

revoke execute on function cashier_home(), cashier_order_items(uuid),
  add_cash_movement(cash_movement_type, numeric, text) from public, anon;
grant execute on function cashier_home(), cashier_order_items(uuid),
  add_cash_movement(cash_movement_type, numeric, text) to authenticated, service_role;
