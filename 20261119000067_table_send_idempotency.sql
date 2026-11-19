-- Veltrix · 067 · Mesas: el envío a cocina lleva un identificador; si se reintenta tras un corte de señal
-- el servidor no repite los platos. Aplicada en Supabase como "table_send_idempotency".
create table if not exists public.table_send_batches (
  client_id uuid primary key,
  order_id uuid not null,
  created_at timestamptz not null default now()
);
alter table public.table_send_batches enable row level security;
revoke all on public.table_send_batches from anon, authenticated;
-- add_table_items(p_order uuid, p_items jsonb, p_client uuid default null): reemplaza la versión de 2 argumentos.
-- Tras bloquear la orden, inserta p_client en table_send_batches (ON CONFLICT DO NOTHING); si ya existía, retorna sin repetir.
-- (El texto completo de la función está en la base; este archivo documenta el cambio.)
