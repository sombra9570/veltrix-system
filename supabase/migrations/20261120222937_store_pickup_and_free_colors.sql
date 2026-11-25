alter table public.delivery_requests add column if not exists kind text not null default 'delivery' check (kind in ('delivery','pickup'));

alter table public.stores drop constraint if exists stores_theme_check, drop constraint if exists stores_admin_bg_check;
alter table public.stores add constraint stores_theme_check check (theme ~ '^([a-z]{2,12}|#[0-9a-fA-F]{6})$'),
  add constraint stores_admin_bg_check check (admin_bg ~ '^([a-z]{2,12}|#[0-9a-fA-F]{6})$');

create or replace function public.set_store_look(p_company uuid, p_theme text, p_admin_bg text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not store_perm('store.edit_info', p_company) then raise exception 'PERM_DENIED'; end if;
  if coalesce(p_theme,'') !~ '^([a-z]{2,12}|#[0-9a-fA-F]{6})$' or coalesce(p_admin_bg,'') !~ '^([a-z]{2,12}|#[0-9a-fA-F]{6})$' then raise exception 'Valor inválido'; end if;
  update stores set theme = p_theme, admin_bg = p_admin_bg, updated_at = now() where company_id = p_company;
  if not found then raise exception 'Tienda inexistente'; end if;
end $$;

create or replace function public.public_store_pickup(p_slug text, p_items jsonb, p_name text, p_phone text, p_notes text, p_pay text)
returns uuid language plpgsql security definer set search_path = public as $$
declare s stores%rowtype; it jsonb; pr products%rowtype; v_qty numeric; v_clean jsonb := '[]'::jsonb; v_wh uuid; v_stock numeric;
        v_sub numeric := 0; v_phone text; v_id uuid;
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
  select id into v_id from delivery_requests where branch_id = s.branch_id and phone = v_phone and status = 'pending' and kind = 'pickup'
     and items = v_clean and created_at > now() - interval '3 minutes' order by created_at desc limit 1;
  if v_id is not null then return v_id; end if;
  insert into delivery_requests (org_id, branch_id, kind, zone_id, zone_name, items, customer_name, phone, address, notes, pay_pref, subtotal, fee)
  values (s.org_id, s.branch_id, 'pickup', null, 'Recojo en caja', v_clean, left(trim(p_name), 60), v_phone, 'Recojo en caja',
          nullif(left(trim(coalesce(p_notes, '')), 300), ''), case when p_pay = 'qr' then 'qr' else 'cash' end, round(v_sub, 2), 0)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.public_store_pickup(text,jsonb,text,text,text,text) from public;
grant execute on function public.public_store_pickup(text,jsonb,text,text,text,text) to anon, authenticated;

do $m$
declare d text;
begin
  d := pg_get_functiondef('public.delivery_request_resolve(uuid,boolean,text)'::regprocedure);
  d := replace(d, '''cash'', v_cur, ''delivery'', r.address, v_notes)', '''cash'', v_cur, (case when r.kind = ''pickup'' then ''counter'' else ''delivery'' end)::order_type, case when r.kind = ''pickup'' then null else r.address end, v_notes)');
  d := replace(d, '''Delivery: '' || r.customer_name', 'case when r.kind = ''pickup'' then ''Recojo: '' else ''Delivery: '' end || r.customer_name');
  execute d;
end $m$;
