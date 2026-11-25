create or replace function public.perm_catalog() returns text[] language sql immutable set search_path = public as $$
  select array['cash.see_expected', 'cash.expense', 'cash.withdraw', 'cash.deposit', 'cash.change_fund',
    'sales.credit', 'customers.create', 'customers.edit', 'customers.view_docs', 'customers.upload_docs', 'collector.expenses',
    'loans.create', 'loans.customers', 'loans.interest', 'loans.cancel', 'loans.reschedule',
    'routes.liquidate', 'routes.invest', 'routes.approve_loans',
    'payments.reverse', 'products.create', 'products.edit', 'products.price', 'products.delete',
    'inv.receive', 'inv.purchase', 'inv.adjust',
    'inv.out_waste', 'inv.out_damaged', 'inv.out_expired', 'inv.out_internal', 'inv.out_supplier_return', 'inv.out_other',
    'inv.transfer', 'reports.export', 'sales.cancel_request', 'inv.see_cost',
    'store.create_product', 'store.photo', 'store.publish', 'store.edit_info'];
$$;

create or replace function public.perm_default(p_role text, p_key text) returns boolean language sql immutable set search_path = public as $$
  select case when p_key = 'cash.see_expected' then false
              when p_key like 'store.%' then p_role in ('supervisor', 'storekeeper')
              when p_key in ('collector.delete_credits', 'collector.delete_customers', 'collector.delete_installments', 'loans.no_photo', 'loans.no_id_photo') then false
              when p_key = 'routes.liquidate' then p_role in ('supervisor', 'collector')
              when p_key in ('loans.interest', 'loans.cancel', 'loans.reschedule', 'routes.invest', 'routes.approve_loans', 'collector.portfolio')
                then p_role = 'supervisor'
              else true end;
$$;

-- La tienda virtual solo existe para rubros que la usan (comercio y comida); empresas sin rubro registrado la conservan
create or replace function public.store_enabled(p_org uuid) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select case when jsonb_typeof(o.onboarding->'categories') <> 'array' or jsonb_array_length(o.onboarding->'categories') = 0 then true
      else exists (select 1 from jsonb_array_elements_text(o.onboarding->'categories') c(id)
                    where c.id in ('grocery','hardware','pharmacy','clothing','tech','auto_parts','bakery','stationery','agro','wholesale','credit_sales','restaurant','fast_food')) end
      from organizations o where o.id = p_org), false);
$$;

create or replace function public.store_perm(p_key text, p_company uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from companies c where c.id = p_company and c.deleted_at is null and store_enabled(c.org_id))
     and has_perm_company(p_key, p_company);
$$;

create or replace function public.can_write_store_file(p_name text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from companies c
                  where c.id::text = split_part(p_name, '/', 2) and c.org_id::text = split_part(p_name, '/', 1) and c.deleted_at is null
                    and (store_perm('store.photo', c.id) or store_perm('store.edit_info', c.id) or store_perm('store.create_product', c.id)));
$$;

create or replace function public.set_product_photo(p_product uuid, p_path text) returns void language plpgsql security definer set search_path = public as $$
declare pr products%rowtype;
begin
  select * into pr from products where id = p_product and deleted_at is null;
  if not found or not store_perm('store.photo', pr.company_id) then raise exception 'PERM_DENIED'; end if;
  if p_path is not null and (split_part(p_path, '/', 1) <> pr.org_id::text or split_part(p_path, '/', 2) <> pr.company_id::text) then raise exception 'Ruta inválida'; end if;
  if pr.model is not null then update products set photo_path = p_path where company_id = pr.company_id and model = pr.model and deleted_at is null;
  else update products set photo_path = p_path where id = pr.id; end if;
end $$;

create or replace function public.set_product_store(p_product uuid, p_in_store boolean, p_description text default null) returns void language plpgsql security definer set search_path = public as $$
declare pr products%rowtype; v_max int; v_used int; v_photo text;
begin
  select * into pr from products where id = p_product and deleted_at is null;
  if not found or not store_perm('store.publish', pr.company_id) then raise exception 'PERM_DENIED'; end if;
  if p_in_store and not pr.in_store then
    v_photo := pr.photo_path;
    if v_photo is null and pr.model is not null then
      select photo_path into v_photo from products where company_id = pr.company_id and model = pr.model and deleted_at is null and photo_path is not null limit 1;
    end if;
    if v_photo is null then raise exception 'STORE_PHOTO_REQUIRED: sube la foto del producto antes de publicarlo en la tienda'; end if;
    select p.max_store_products into v_max from organizations o join plans p on p.id = o.plan_id where o.id = pr.org_id;
    select count(distinct coalesce(model, id::text)) into v_used from products where org_id = pr.org_id and in_store and deleted_at is null;
    if v_max is not null and v_used >= v_max then raise exception 'PLAN_LIMIT_STORE: tu plan permite % productos en la tienda', v_max; end if;
  end if;
  if pr.model is not null then
    update products set in_store = p_in_store, photo_path = coalesce(photo_path, v_photo),
           store_description = nullif(left(trim(coalesce(p_description, store_description, '')), 600), '')
     where company_id = pr.company_id and model = pr.model and deleted_at is null;
  else
    update products set in_store = p_in_store, store_description = nullif(left(trim(coalesce(p_description, store_description, '')), 600), '') where id = pr.id;
  end if;
end $$;

create or replace function public.store_add_all(p_company uuid) returns integer language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_max int; v_now int; v_added int;
begin
  if not store_perm('store.publish', p_company) then raise exception 'PERM_DENIED'; end if;
  select c.org_id, pl.max_store_products into v_org, v_max
    from companies c join organizations o on o.id = c.org_id left join plans pl on pl.id = o.plan_id where c.id = p_company;
  select count(distinct coalesce(model, id::text)) into v_now from products where company_id = p_company and in_store and deleted_at is null;
  with k as (
    select coalesce(model, id::text) as g from products
     where company_id = p_company and deleted_at is null and is_active and is_sellable and not in_store
       and photo_path is not null and product_type in ('good', 'service', 'combo')
     group by 1 order by 1 limit greatest(coalesce(v_max, 100000) - v_now, 0))
  update products p set in_store = true from k
   where p.company_id = p_company and p.deleted_at is null and p.is_active and p.is_sellable and not p.in_store
     and p.photo_path is not null and p.product_type in ('good', 'service', 'combo') and coalesce(p.model, p.id::text) = k.g;
  get diagnostics v_added = row_count;
  return v_added;
end $$;

create or replace function public.set_store_logo(p_company uuid, p_path text) returns void language plpgsql security definer set search_path = public as $$
begin
  if not store_perm('store.edit_info', p_company) then raise exception 'PERM_DENIED'; end if;
  if p_path is not null and split_part(p_path, '/', 2) <> p_company::text then raise exception 'Ruta inválida'; end if;
  update stores set logo_path = p_path, updated_at = now() where company_id = p_company;
end $$;

-- Crear un producto (o un modelo con tallas y colores) directamente desde la tienda, con su foto
create or replace function public.store_create_product(p_company uuid, p_name text, p_price numeric, p_sizes text[], p_colors text[], p_description text, p_photo text, p_publish boolean)
returns integer language plpgsql security definer set search_path = public as $$
declare c companies%rowtype; s text; k text; sizes text[]; colors text[]; v_name text := btrim(coalesce(p_name, '')); v_sku text; made int := 0;
        v_max int; v_used int; v_pub boolean := coalesce(p_publish, false) and store_perm('store.publish', p_company); v_model boolean;
        v_desc text := nullif(left(btrim(coalesce(p_description, '')), 600), '');
begin
  select * into c from companies where id = p_company and deleted_at is null;
  if not found then raise exception 'Empresa inexistente'; end if;
  if not store_perm('store.create_product', c.id) then raise exception 'PERM_DENIED'; end if;
  if not org_writable(c.org_id) then raise exception 'Cuenta suspendida: solo lectura'; end if;
  if v_name = '' then raise exception 'Indique el nombre'; end if;
  if p_price is null or p_price < 0 then raise exception 'Precio inválido'; end if;
  if p_photo is null or split_part(p_photo, '/', 1) <> c.org_id::text or split_part(p_photo, '/', 2) <> c.id::text then raise exception 'STORE_PHOTO_REQUIRED'; end if;
  sizes := array(select distinct btrim(x) from unnest(coalesce(p_sizes, '{}')) x where btrim(x) <> '');
  colors := array(select distinct btrim(x) from unnest(coalesce(p_colors, '{}')) x where btrim(x) <> '');
  v_model := cardinality(sizes) > 0 or cardinality(colors) > 0;
  if v_pub then
    select p.max_store_products into v_max from organizations o join plans p on p.id = o.plan_id where o.id = c.org_id;
    select count(distinct coalesce(model, id::text)) into v_used from products where org_id = c.org_id and in_store and deleted_at is null;
    if v_max is not null and v_used >= v_max then raise exception 'PLAN_LIMIT_STORE: tu plan permite % productos en la tienda', v_max; end if;
  end if;
  if not v_model then
    v_sku := 'P' || lpad((select count(*) + 1 from products where company_id = c.id)::text, 5, '0');
    while exists (select 1 from products where company_id = c.id and sku = v_sku) loop v_sku := 'P' || lpad((floor(random() * 99999) + 1)::int::text, 5, '0'); end loop;
    insert into products (org_id, company_id, sku, name, unit_price, currency, tax_rate, product_type, track_stock, unit, is_active, created_by, photo_path, in_store, store_description)
    values (c.org_id, c.id, v_sku, v_name, round(p_price, 2), c.base_currency, 0, 'good', true, 'unid', true, auth.uid(), p_photo, v_pub, v_desc);
    return 1;
  end if;
  if exists (select 1 from products where company_id = c.id and deleted_at is null and lower(model) = lower(v_name)) then raise exception 'MODEL_EXISTS'; end if;
  if cardinality(sizes) = 0 then sizes := array['']; end if;
  if cardinality(colors) = 0 then colors := array['']; end if;
  if cardinality(sizes) > 30 or cardinality(colors) > 30 or cardinality(sizes) * cardinality(colors) > 300 then raise exception 'Demasiadas variantes'; end if;
  foreach s in array sizes loop foreach k in array colors loop
    v_sku := upper(left(regexp_replace(v_name, '[^A-Za-z0-9]', '', 'g'), 4)) || '-' || upper(regexp_replace(s, '[^A-Za-z0-9]', '', 'g')) || '-' || upper(left(regexp_replace(k, '[^A-Za-z0-9]', '', 'g'), 3));
    while exists (select 1 from products where company_id = c.id and sku = v_sku) loop v_sku := v_sku || floor(random() * 9)::int::text; end loop;
    insert into products (org_id, company_id, sku, name, unit_price, currency, tax_rate, product_type, track_stock, unit, is_active, created_by, model, size, color, photo_path, in_store, store_description)
    values (c.org_id, c.id, v_sku, v_name || case when s <> '' then ' · ' || s else '' end || case when k <> '' then ' · ' || k else '' end, round(p_price, 2), c.base_currency, 0,
            'good', true, 'unid', true, auth.uid(), v_name, nullif(s, ''), nullif(k, ''), p_photo, v_pub, v_desc);
    made := made + 1;
  end loop; end loop;
  return made;
end $$;
revoke all on function public.store_create_product(uuid, text, numeric, text[], text[], text, text, boolean) from public, anon;
grant execute on function public.store_create_product(uuid, text, numeric, text[], text[], text, text, boolean) to authenticated;
revoke all on function public.store_perm(text, uuid) from public, anon;
grant execute on function public.store_perm(text, uuid) to authenticated;
revoke all on function public.store_enabled(uuid) from public, anon;
grant execute on function public.store_enabled(uuid) to authenticated;
