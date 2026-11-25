-- Registro de ventas hechas con identificador del teléfono: si la señal falla justo al confirmar y el teléfono reintenta,
-- la venta NO se duplica (mismo identificador = misma venta).
create table if not exists public.offline_sales (
  uuid uuid primary key,
  org_id uuid not null,
  order_id uuid not null references public.orders(id),
  vendor_id uuid not null,
  client_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.offline_sales enable row level security;  -- sin políticas: solo las funciones del servidor la leen o escriben
create index if not exists offline_sales_vendor_idx on public.offline_sales (vendor_id, created_at desc);

create or replace function public.create_sale_idem(
  p_branch uuid, p_items jsonb, p_notes text, p_discount numeric, p_uuid uuid, p_at timestamptz default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_order uuid; v_org uuid; ex offline_sales%rowtype;
begin
  if p_uuid is null then raise exception 'Identificador de venta faltante'; end if;
  -- Dos envíos simultáneos de la misma venta se atienden uno detrás del otro
  perform pg_advisory_xact_lock(hashtextextended(p_uuid::text, 0));
  select * into ex from offline_sales where uuid = p_uuid;
  if found then
    if ex.vendor_id <> auth.uid() then raise exception 'Sin permiso'; end if;
    return ex.order_id;   -- ya estaba registrada: se devuelve la misma, sin duplicar
  end if;
  v_order := create_sale(p_branch, p_items, p_notes, coalesce(p_discount, 0));
  select org_id into v_org from orders where id = v_order;
  insert into offline_sales (uuid, org_id, order_id, vendor_id, client_at)
  values (p_uuid, v_org, v_order, auth.uid(),
          case when p_at is null then null else greatest(least(p_at, now()), now() - interval '30 days') end);
  return v_order;
end $$;

revoke all on function public.create_sale_idem(uuid, jsonb, text, numeric, uuid, timestamptz) from public, anon;
grant execute on function public.create_sale_idem(uuid, jsonb, text, numeric, uuid, timestamptz) to authenticated;
