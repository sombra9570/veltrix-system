-- Garantía dura: un pago solo puede tener un reverso vigente y solo puede reversarse una vez
create unique index if not exists payment_reversals_one_active_idx on public.payment_reversals (payment_id) where status in ('pending','approved');
create unique index if not exists payments_one_reversal_idx on public.payments (reverses_payment_id) where reverses_payment_id is not null;

do $$
declare d text; o text;
begin
  -- request_reversal: rechazar si ya hay un reverso pendiente o aprobado
  select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='request_reversal';
  o := d;
  d := replace(d, E'if coalesce(trim(p_reason), '''') = '''' then raise exception ''Indique el motivo''; end if;',
    E'if coalesce(trim(p_reason), '''') = '''' then raise exception ''Indique el motivo''; end if;\n  if exists (select 1 from payment_reversals r where r.payment_id = p.id and r.status in (''pending'',''approved'')) then raise exception ''REVERSAL_EXISTS''; end if;');
  if d = o then raise exception 'request_reversal: no se pudo aplicar'; end if;
  execute d;

  -- decide_reversal: bloquear el pago y no reversar dos veces
  select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='decide_reversal';
  o := d;
  d := replace(d, 'select * into p from payments where id = rv.payment_id;',
    E'select * into p from payments where id = rv.payment_id for update;\n  if exists (select 1 from payments x where x.reverses_payment_id = p.id) then raise exception ''REVERSAL_EXISTS''; end if;');
  if d = o then raise exception 'decide_reversal: no se pudo aplicar'; end if;
  execute d;

  -- pay_supplier: monto nulo no debe pasar la validación
  select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='pay_supplier';
  o := d;
  d := replace(d, 'if p_amount <= 0 or v_paid', 'if p_amount is null or p_amount <= 0 or v_paid');
  if d = o then raise exception 'pay_supplier: no se pudo aplicar'; end if;
  execute d;

  -- cancel_sale: bloquear las cuotas antes de verificar si hay pagos (evita anular mientras se cobra)
  select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='cancel_sale';
  o := d;
  d := replace(d, 'if _order_paid(o.id) <> 0 then raise exception ''SALE_HAS_PAYMENTS''; end if;',
    E'perform 1 from installments where order_id = o.id for update;\n  if _order_paid(o.id) <> 0 then raise exception ''SALE_HAS_PAYMENTS''; end if;');
  if d = o then raise exception 'cancel_sale: no se pudo aplicar'; end if;
  execute d;
end $$;
