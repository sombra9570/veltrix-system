create table if not exists public.table_send_batches (
  client_id uuid primary key,
  order_id uuid not null,
  created_at timestamptz not null default now()
);
alter table public.table_send_batches enable row level security;
revoke all on public.table_send_batches from anon, authenticated;

drop function if exists public.add_table_items(uuid, jsonb);
create or replace function public.add_table_items(p_order uuid, p_items jsonb, p_client uuid default null)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
declare o orders%rowtype; it jsonb; pr products%rowtype; v_qty numeric; v_new int;
begin
  select * into o from orders where id = p_order for update;
  if not found or o.status <> 'draft' or o.order_type <> 'dine_in' then raise exception 'La cuenta ya está cerrada'; end if;
  if not can_serve_tables(o.branch_id) then raise exception 'Sin permiso'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido no tiene ítems';
  end if;
  -- Idempotencia: si este mismo envío ya llegó (reintento tras un corte de señal), no se repite
  if p_client is not null then
    insert into table_send_batches (client_id, order_id) values (p_client, o.id) on conflict (client_id) do nothing;
    get diagnostics v_new = row_count;
    if v_new = 0 then return; end if;
  end if;
  for it in select * from jsonb_array_elements(p_items) loop
    v_qty := (it->>'qty')::numeric;
    if v_qty is null or v_qty <= 0 or v_qty > 1000 then raise exception 'Cantidad inválida'; end if;
    select * into pr from products
     where id = (it->>'product_id')::uuid and company_id = o.company_id and is_active and is_sellable and deleted_at is null;
    if not found then raise exception 'Producto no disponible'; end if;
    insert into order_items (org_id, order_id, product_id, description, qty, unit_price, tax_rate, notes)
    values (o.org_id, o.id, pr.id, pr.name, v_qty, pr.unit_price, pr.tax_rate,
            nullif(left(trim(coalesce(it->>'notes', '')), 200), ''));
  end loop;
end $function$;
revoke all on function public.add_table_items(uuid, jsonb, uuid) from public, anon;
grant execute on function public.add_table_items(uuid, jsonb, uuid) to authenticated, service_role;
