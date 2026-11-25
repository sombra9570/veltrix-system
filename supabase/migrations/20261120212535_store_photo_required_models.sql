create or replace function public.set_product_photo(p_product uuid, p_path text)
returns void language plpgsql security definer set search_path = public as $$
declare pr products%rowtype;
begin
  select * into pr from products where id = p_product and deleted_at is null;
  if not found or not can_manage_catalog(pr.company_id) then raise exception 'Sin permiso'; end if;
  if p_path is not null and (split_part(p_path, '/', 1) <> pr.org_id::text or split_part(p_path, '/', 2) <> pr.company_id::text) then
    raise exception 'Ruta inválida';
  end if;
  if pr.model is not null then
    update products set photo_path = p_path where company_id = pr.company_id and model = pr.model and deleted_at is null;
  else
    update products set photo_path = p_path where id = pr.id;
  end if;
end $$;

create or replace function public.set_product_store(p_product uuid, p_in_store boolean, p_description text default null)
returns void language plpgsql security definer set search_path = public as $$
declare pr products%rowtype; v_max int; v_used int; v_photo text;
begin
  select * into pr from products where id = p_product and deleted_at is null;
  if not found or not can_manage_catalog(pr.company_id) then raise exception 'Sin permiso'; end if;
  if p_in_store and not pr.in_store then
    v_photo := pr.photo_path;
    if v_photo is null and pr.model is not null then
      select photo_path into v_photo from products where company_id = pr.company_id and model = pr.model and deleted_at is null and photo_path is not null limit 1;
    end if;
    if v_photo is null then raise exception 'STORE_PHOTO_REQUIRED: sube la foto del producto antes de publicarlo en la tienda'; end if;
    select p.max_store_products into v_max from organizations o join plans p on p.id = o.plan_id where o.id = pr.org_id;
    select count(distinct coalesce(model, id::text)) into v_used from products where org_id = pr.org_id and in_store and deleted_at is null;
    if v_max is not null and v_used >= v_max then
      raise exception 'PLAN_LIMIT_STORE: tu plan permite % productos en la tienda', v_max;
    end if;
  end if;
  if pr.model is not null then
    update products set in_store = p_in_store,
           photo_path = coalesce(photo_path, v_photo),
           store_description = nullif(left(trim(coalesce(p_description, store_description, '')), 600), '')
     where company_id = pr.company_id and model = pr.model and deleted_at is null;
  else
    update products set in_store = p_in_store,
           store_description = nullif(left(trim(coalesce(p_description, store_description, '')), 600), '')
     where id = pr.id;
  end if;
end $$;

create or replace function public.public_store(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s stores%rowtype; v_wh uuid; v_cur char(3);
begin
  select * into s from stores where slug = lower(trim(p_slug)) and is_published;
  if not found then return null; end if;
  if not org_writable(s.org_id) then return null; end if;
  v_wh := default_warehouse(s.branch_id);
  select base_currency into v_cur from companies where id = s.company_id;
  return jsonb_build_object(
    'slug', s.slug, 'name', s.name, 'description', s.description, 'whatsapp', s.whatsapp,
    'logo', s.logo_path, 'currency', v_cur,
    'country', (select country_code from companies where id = s.company_id),
    'products', (select coalesce(jsonb_agg(jsonb_build_object(
                   'id', p.id, 'name', p.name, 'price', p.unit_price, 'type', p.product_type,
                   'description', p.store_description, 'photo', p.photo_path, 'unit', p.unit,
                   'model', p.model, 'size', p.size, 'color', p.color,
                   'available', not p.track_stock
                                or coalesce((select qty from stock_levels where warehouse_id = v_wh and product_id = p.id), 0) > 0)
                 order by coalesce(p.model, p.name), p.size, p.color), '[]'::jsonb)
                   from products p
                  where p.company_id = s.company_id and p.in_store and p.is_active and p.is_sellable and p.deleted_at is null
                    and p.photo_path is not null
                  limit 2000)
  );
end $$;

create or replace function public.store_admin(p_company uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c companies%rowtype; s stores%rowtype; v_slug text; v_branch uuid; v_max int; v_n int := 0;
begin
  select * into c from companies where id = p_company and deleted_at is null;
  if not found or not can_manage_catalog(c.id) then raise exception 'Sin permiso'; end if;
  select * into s from stores where company_id = c.id;
  if not found then
    select id into v_branch from branches where company_id = c.id and deleted_at is null and is_active order by code limit 1;
    v_slug := trim(both '-' from regexp_replace(lower(translate((select name from organizations where id = c.org_id),
                'áéíóúàèìòùäëïöüâêîôûñçÁÉÍÓÚÑÇ', 'aeiouaeiouaeiouaeiouncaeiounc')), '[^a-z0-9]+', '-', 'g'));
    v_slug := left(coalesce(nullif(v_slug, ''), 'tienda'), 34);
    if length(v_slug) < 3 then v_slug := v_slug || '-shop'; end if;
    while exists (select 1 from stores where slug = v_slug) loop
      v_n := v_n + 1;
      v_slug := left(regexp_replace(v_slug, '-[0-9]+$', ''), 34) || '-' || v_n;
    end loop;
    insert into stores (org_id, company_id, branch_id, slug, name)
    values (c.org_id, c.id, v_branch, v_slug, (select name from organizations where id = c.org_id)) returning * into s;
  end if;
  select p.max_store_products into v_max from organizations o join plans p on p.id = o.plan_id where o.id = c.org_id;
  return jsonb_build_object(
    'store', to_jsonb(s) - 'org_id', 'currency', c.base_currency, 'max_products', v_max,
    'branches', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by code), '[]'::jsonb)
                   from branches where company_id = c.id and deleted_at is null and is_active),
    'products', (select coalesce(jsonb_agg(x order by (x->>'in_store') desc, x->>'name'), '[]'::jsonb) from (
        select jsonb_build_object('id', min(p.id::text), 'name', coalesce(p.model, min(p.name)), 'price', min(p.unit_price), 'type', min(p.product_type),
               'in_store', bool_or(p.in_store), 'description', max(p.store_description), 'photo', max(p.photo_path), 'active', bool_or(p.is_active),
               'variants', case when p.model is null then 1 else count(*) end) as x
          from products p
         where p.company_id = c.id and p.deleted_at is null and p.product_type in ('good','service','combo')
         group by coalesce(p.model, p.id::text), p.model) t)
  );
end $$;
revoke all on function public.public_store(text) from public;
grant execute on function public.public_store(text) to anon, authenticated;
