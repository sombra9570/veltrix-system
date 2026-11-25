create table if not exists public.offline_ops (
  op_id uuid primary key,
  user_id uuid not null,
  kind text not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.offline_ops enable row level security;
-- Sin políticas: solo se usa desde las funciones de abajo.

-- Mismo préstamo, mismo identificador: si el reintento llega dos veces, devuelve el primero (no duplica).
create or replace function public.create_street_loan_v2(
  p_route uuid, p_customer uuid, p_principal numeric, p_interest numeric, p_count integer,
  p_every_days integer, p_first_due date, p_notes text, p_offline_uuid uuid
) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare prev jsonb; res jsonb;
begin
  if auth.uid() is null then raise exception 'Sin sesión'; end if;
  if p_offline_uuid is null then raise exception 'Identificador requerido'; end if;
  perform pg_advisory_xact_lock(hashtext(p_offline_uuid::text));
  select result into prev from offline_ops where op_id = p_offline_uuid and user_id = auth.uid();
  if found then return prev; end if;
  res := create_street_loan(p_route, p_customer, p_principal, p_interest, p_count, p_every_days, p_first_due, p_notes);
  insert into offline_ops (op_id, user_id, kind, result) values (p_offline_uuid, auth.uid(), 'loan', res);
  return res;
end $$;

create or replace function public.collector_credit_sale_v2(
  p_route uuid, p_customer uuid, p_items jsonb, p_count integer, p_every_days integer,
  p_first_due date, p_notes text, p_offline_uuid uuid
) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare prev jsonb; res jsonb;
begin
  if auth.uid() is null then raise exception 'Sin sesión'; end if;
  if p_offline_uuid is null then raise exception 'Identificador requerido'; end if;
  perform pg_advisory_xact_lock(hashtext(p_offline_uuid::text));
  select result into prev from offline_ops where op_id = p_offline_uuid and user_id = auth.uid();
  if found then return prev; end if;
  res := collector_credit_sale(p_route, p_customer, p_items, p_count, p_every_days, p_first_due, p_notes);
  insert into offline_ops (op_id, user_id, kind, result) values (p_offline_uuid, auth.uid(), 'credit_sale', res);
  return res;
end $$;

revoke all on function public.create_street_loan_v2(uuid,uuid,numeric,numeric,integer,integer,date,text,uuid), public.collector_credit_sale_v2(uuid,uuid,jsonb,integer,integer,date,text,uuid) from public, anon;
grant execute on function public.create_street_loan_v2(uuid,uuid,numeric,numeric,integer,integer,date,text,uuid), public.collector_credit_sale_v2(uuid,uuid,jsonb,integer,integer,date,text,uuid) to authenticated;
