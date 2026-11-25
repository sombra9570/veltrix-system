alter table public.stores add column if not exists address text, add column if not exists map_url text;

create or replace function public.set_store_location(p_company uuid, p_address text, p_url text) returns void
language plpgsql security definer set search_path = public as $$
declare v_url text := nullif(left(trim(coalesce(p_url, '')), 400), '');
begin
  if not store_perm('store.edit_info', p_company) then raise exception 'PERM_DENIED'; end if;
  if v_url is not null and v_url !~* '^https://' then raise exception 'Valor inválido'; end if;
  update stores set address = nullif(left(trim(coalesce(p_address, '')), 200), ''), map_url = v_url, updated_at = now() where company_id = p_company;
  if not found then raise exception 'Tienda inexistente'; end if;
end $$;
revoke all on function public.set_store_location(uuid,text,text) from public, anon;
grant execute on function public.set_store_location(uuid,text,text) to authenticated;

do $m$
declare d text;
begin
  d := pg_get_functiondef('public.public_store(text)'::regprocedure);
  d := replace(d, '''theme'', s.theme,', '''theme'', s.theme, ''address'', s.address, ''map_url'', s.map_url,');
  execute d;
end $m$;

drop function if exists public.public_store_pickup(text,jsonb,text,text,text,text);
create or replace function public.public_store_pickup(p_slug text, p_items jsonb, p_name text, p_phone text, p_notes text, p_pay text, p_kind text default 'pickup', p_lat numeric default null, p_lng numeric default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare s stores%rowtype; it jsonb; pr products%rowtype; v_qty numeric; v_clean jsonb := '[]'::jsonb; v_wh uuid; v_stock numeric;
        v_sub numeric := 0; v_phone text; v_id uuid; v_kind text := case when p_kind = 'delivery' then 'delivery' else 'pickup' end;
begin
  select * into s from stores where slug = lower(trim(p_slug)) and is_published;
  if not found or not org_writable(s.org_id) then raise exception 'STORE_INVALID'; end if;
  v_phone := regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g');
  if length(v_phone) < 6 or length(v_phone) > 16 then raise exception 'PHONE_INVALID'; end if;
  if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'DATA_INVALID'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 40 then raise exception 'ITEMS_INVALID'; end if;
  if (select count(*) from delivery_requests where branch_id = s.branch_id and status = 'pending') >= 40
     or (select count(*) from delivery_requests where phone = v_phone and status = 'pending') >= 3
     or (select count(*) from delivery_requests where phone = v_phone and created_at > now() - interval '1 hour') >= 6 then
    raise exception 'TOO_MANY_REQUESTS';
  end if;
  v_wh := default_warehouse(s.branch_id);
  for it in select * from jsonb_array_elements(p_items) loop
    v_qty := (it->>'qty')::numeric;
    if v_qty is null or v_qty <= 0 or v_qty > 30 or v_qty <> trunc(v_qty) then raise exception 'ITEMS_INVALID'; end if;
    select * into pr from products where id = (it->>'product_id')::uuid and company_id = s.company_id and in_store and is_active and is_sellable and deleted_at is null;
    if not found then raise exception 'PRODUCT_UNAVAILABLE'; end if;
    if pr.track_stock then
      select coalesce(qty, 0) into v_stock from stock_levels where warehouse_id = v_wh and product_id = pr.id;
      if coalesce(v_stock, 0) < v_qty then raise exception 'PRODUCT_UNAVAILABLE'; end if;
    end if;
    v_sub := v_sub + pr.unit_price * v_qty;
    v_clean := v_clean || jsonb_build_array(jsonb_build_object('product_id', pr.id, 'qty', v_qty, 'notes', null));
  end loop;
  select id into v_id from delivery_requests where branch_id = s.branch_id and phone = v_phone and status = 'pending' and kind = v_kind
     and items = v_clean and created_at > now() - interval '3 minutes' order by created_at desc limit 1;
  if v_id is not null then return v_id; end if;
  insert into delivery_requests (org_id, branch_id, kind, zone_id, zone_name, items, customer_name, phone, address, lat, lng, notes, pay_pref, subtotal, fee)
  values (s.org_id, s.branch_id, v_kind, null, case when v_kind = 'pickup' then 'Recojo en tienda' else 'Delivery por WhatsApp' end, v_clean,
          left(trim(p_name), 60), v_phone, case when v_kind = 'pickup' then 'Recojo en tienda' else 'Ubicación por WhatsApp' end,
          case when p_lat between -90 and 90 then round(p_lat, 6) end, case when p_lng between -180 and 180 then round(p_lng, 6) end,
          nullif(left(trim(coalesce(p_notes, '')), 300), ''), case when p_pay = 'qr' then 'qr' else 'cash' end, round(v_sub, 2), 0)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.public_store_pickup(text,jsonb,text,text,text,text,text,numeric,numeric) from public;
grant execute on function public.public_store_pickup(text,jsonb,text,text,text,text,text,numeric,numeric) to anon, authenticated;
