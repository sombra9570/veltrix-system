-- Veltrix · 066 · Reversos: un pago solo puede reversarse una vez (garantía en la base + verificación en funciones).
-- Aplicada en Supabase como "reversals_single_and_cancel_locks". Cambios:
create unique index if not exists payment_reversals_one_active_idx on public.payment_reversals (payment_id) where status in ('pending','approved');
create unique index if not exists payments_one_reversal_idx on public.payments (reverses_payment_id) where reverses_payment_id is not null;
--  * request_reversal: rechaza con REVERSAL_EXISTS si ya hay un reverso pendiente o aprobado.
--  * decide_reversal: bloquea el pago (FOR UPDATE) y rechaza con REVERSAL_EXISTS si ya fue reversado.
--  * pay_supplier: un monto nulo ya no pasa la validación.
--  * cancel_sale: bloquea las cuotas antes de verificar pagos (no se anula mientras se cobra).
-- (El texto completo de las funciones está en la base; este archivo documenta el cambio.)
