-- =====================================================================
-- Veltrix · Tienda virtual de cada negocio
--   veltrixsystem.app/tienda/{slug}: catálogo público con fotos, pedido por WhatsApp.
--   La única función abierta al público (anon) es public_store(): solo LEE lo publicado.
-- =====================================================================

alter table plans add column if not exists max_store_products int;
update plans set max_store_products = 50   where code = 'starter';
update plans set max_store_products = 300  where code = 'pro';
update plans set max_store_products = 2000 where code = 'enterprise';

alter table products
  add column if not exists in_store          boolean not null default false,
  add column if not exists store_description text,
  add column if not exists photo_path        text;

create table if not exists stores (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id),
  company_id    uuid not null,
  branch_id     uuid not null,            -- de aquí sale el stock que se muestra
  slug          text not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$'),
  name          text not null,
  description   text,
  whatsapp      text,                     -- solo dígitos con código de país
  logo_path     text,
  is_published  boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  foreign key (org_id, company_id, branch_id) references branches(org_id, company_id, id),
  unique (company_id)
);
alter table stores enable row level security;
create policy stores_read on stores for select to authenticated using (is_org_member(org_id));
-- escritura solo por funciones

-- ---------- Fotos públicas de la tienda ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('store-images', 'store-images', true, 1048576, array['image/webp','image/jpeg','image/png'])
on conflict (id) do update set public = true, file_size_limit = 1048576,
  allowed_mime_types = array['image/webp','image/jpeg','image/png'];

-- Ruta: {org_id}/{company_id}/archivo — solo quien administra el catálogo de esa empresa
create or replace function can_write_store_file(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from companies c
                  where c.id::text = split_part(p_name, '/', 2) and c.org_id::text = split_part(p_name, '/', 1)
                    and c.deleted_at is null and can_manage_catalog(c.id));
$$;

drop policy if exists store_files_insert on storage.objects;
drop policy if exists store_files_update on storage.objects;
drop policy if exists store_files_delete on storage.objects;
create policy store_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'store-images' and public.can_write_store_file(name) and public.storage_has_room(name));
create policy store_files_update on storage.objects for update to authenticated
  using (bucket_id = 'store-images' and public.can_write_store_file(name))
  with check (bucket_id = 'store-images' and public.can_write_store_file(name));
create policy store_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'store-images' and public.can_write_store_file(name));

-- ---------- Administración (dueño / supervisor / almacenero) ----------
create or replace function store_admin(p_company uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c companies%rowtype; s stores%rowtype; v_slug text; v_branch uuid; v_max int; v_n int := 0;
begin
  select * into c from companies where id = p_company and deleted_at is null;
  if not found or not can_manage_catalog(c.id) then raise exception 'Sin permiso'; end if;

  select * into s from stores where company_id = c.id;
  if not found then
    -- Se crea la tienda (sin publicar) con un nombre de enlace propuesto
    select id into v_branch from branches where company_id = c.id and deleted_at is null and is_active order by code limit 1;
    v_slug := trim(both '-' from regexp_replace(lower(translate(
                (select name from organizations where id = c.org_id),
                'áéíóúàèìòùäëïöüâêîôûñçÁÉÍÓÚÑÇ', 'aeiouaeiouaeiouaeiouncaeiounc')), '[^a-z0-9]+', '-', 'g'));
    v_slug := left(coalesce(nullif(v_slug, ''), 'tienda'), 34);
    if length(v_slug) < 3 then v_slug := v_slug || '-shop'; end if;
    while exists (select 1 from stores where slug = v_slug) loop
      v_n := v_n + 1;
      v_slug := left(regexp_replace(v_slug, '-[0-9]+$', ''), 34) || '-' || v_n;
    end loop;
    insert into stores (org_id, company_id, branch_id, slug, name)
    values (c.org_id, c.id, v_branch, v_slug, (select name from organizations where id = c.org_id))
    returning * into s;
  end if;

  select p.max_store_products into v_max from organizations o join plans p on p.id = o.plan_id where o.id = c.org_id;
  return jsonb_build_object(
    'store', to_jsonb(s) - 'org_id',
    'currency', c.base_currency,
    'max_products', v_max,
    'branches', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by code), '[]'::jsonb)
                   from branches where company_id = c.id and deleted_at is null and is_active),
    'products', (select coalesce(jsonb_agg(jsonb_build_object(
                   'id', p.id, 'name', p.name, 'price', p.unit_price, 'type', p.product_type,
                   'in_store', p.in_store, 'description', p.store_description, 'photo', p.photo_path, 'active', p.is_active)
                 order by p.in_store desc, p.name), '[]'::jsonb)
                   from products p where p.company_id = c.id and p.deleted_at is null and p.product_type in ('good','service','combo'))
  );
end $$;

create or replace function save_store(p_company uuid, p_slug text, p_name text, p_description text,
                                      p_whatsapp text, p_branch uuid, p_published boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare v_slug text := lower(trim(coalesce(p_slug, ''))); v_wa text := regexp_replace(coalesce(p_whatsapp, ''), '[^0-9]', '', 'g');
begin
  if not can_manage_catalog(p_company) then raise exception 'Sin permiso'; end if;
  if v_slug !~ '^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$' then raise exception 'STORE_SLUG_INVALID'; end if;
  if exists (select 1 from stores where slug = v_slug and company_id <> p_company) then raise exception 'STORE_SLUG_TAKEN'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Indique el nombre'; end if;
  if p_published and length(v_wa) < 8 then raise exception 'STORE_NEEDS_WHATSAPP'; end if;
  if not exists (select 1 from branches where id = p_branch and company_id = p_company and deleted_at is null) then
    raise exception 'Sucursal inválida';
  end if;
  update stores set slug = v_slug, name = trim(p_name), description = nullif(trim(coalesce(p_description, '')), ''),
         whatsapp = nullif(v_wa, ''), branch_id = p_branch, is_published = coalesce(p_published, false), updated_at = now()
   where company_id = p_company;
  if not found then raise exception 'Tienda inexistente'; end if;
end $$;

create or replace function set_store_logo(p_company uuid, p_path text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not can_manage_catalog(p_company) then raise exception 'Sin permiso'; end if;
  if p_path is not null and split_part(p_path, '/', 2) <> p_company::text then raise exception 'Ruta inválida'; end if;
  update stores set logo_path = p_path, updated_at = now() where company_id = p_company;
end $$;

-- Publicar / quitar un producto de la tienda (respeta el límite del plan)
create or replace function set_product_store(p_product uuid, p_in_store boolean, p_description text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare pr products%rowtype; v_max int; v_used int;
begin
  select * into pr from products where id = p_product and deleted_at is null;
  if not found or not can_manage_catalog(pr.company_id) then raise exception 'Sin permiso'; end if;
  if p_in_store and not pr.in_store then
    select p.max_store_products into v_max from organizations o join plans p on p.id = o.plan_id where o.id = pr.org_id;
    select count(*) into v_used from products where org_id = pr.org_id and in_store and deleted_at is null;
    if v_max is not null and v_used >= v_max then
      raise exception 'PLAN_LIMIT_STORE: tu plan permite % productos en la tienda', v_max;
    end if;
  end if;
  update products set in_store = p_in_store,
         store_description = nullif(left(trim(coalesce(p_description, store_description, '')), 600), '')
   where id = pr.id;
end $$;

create or replace function set_product_photo(p_product uuid, p_path text) returns void
language plpgsql security definer set search_path = public as $$
declare pr products%rowtype;
begin
  select * into pr from products where id = p_product and deleted_at is null;
  if not found or not can_manage_catalog(pr.company_id) then raise exception 'Sin permiso'; end if;
  if p_path is not null and (split_part(p_path, '/', 1) <> pr.org_id::text or split_part(p_path, '/', 2) <> pr.company_id::text) then
    raise exception 'Ruta inválida';
  end if;
  update products set photo_path = p_path where id = pr.id;
end $$;

-- ---------- Lectura pública (sin sesión) ----------
create or replace function public_store(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s stores%rowtype; v_wh uuid; v_cur char(3);
begin
  select * into s from stores where slug = lower(trim(p_slug)) and is_published;
  if not found then return null; end if;
  -- si la cuenta está suspendida, la tienda no se muestra
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
                   'available', not p.track_stock
                                or coalesce((select qty from stock_levels where warehouse_id = v_wh and product_id = p.id), 0) > 0)
                 order by p.name), '[]'::jsonb)
                   from products p
                  where p.company_id = s.company_id and p.in_store and p.is_active and p.is_sellable and p.deleted_at is null
                  limit 2000)
  );
end $$;

revoke execute on function can_write_store_file(text), store_admin(uuid), save_store(uuid, text, text, text, text, uuid, boolean),
  set_store_logo(uuid, text), set_product_store(uuid, boolean, text), set_product_photo(uuid, text), public_store(text) from public;
grant execute on function can_write_store_file(text), store_admin(uuid), save_store(uuid, text, text, text, text, uuid, boolean),
  set_store_logo(uuid, text), set_product_store(uuid, boolean, text), set_product_photo(uuid, text), public_store(text)
  to authenticated, service_role;
grant execute on function public_store(text) to anon;
