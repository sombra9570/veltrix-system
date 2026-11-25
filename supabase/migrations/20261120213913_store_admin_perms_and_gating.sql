create or replace function public.set_store_qr(p_company uuid, p_path text) returns void language plpgsql security definer set search_path = public as $$
begin
  if not store_perm('store.edit_info', p_company) then raise exception 'PERM_DENIED'; end if;
  if p_path is not null and split_part(p_path, '/', 2) <> p_company::text then raise exception 'Ruta inválida'; end if;
  update stores set own_qr_path = p_path, updated_at = now() where company_id = p_company;
end $$;

create or replace function public.save_store(p_company uuid, p_slug text, p_name text, p_description text, p_whatsapp text, p_branch uuid, p_published boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_slug text := lower(trim(coalesce(p_slug, ''))); v_wa text := regexp_replace(coalesce(p_whatsapp, ''), '[^0-9]', '', 'g');
begin
  if not store_perm('store.edit_info', p_company) then raise exception 'PERM_DENIED'; end if;
  if v_slug !~ '^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$' then raise exception 'STORE_SLUG_INVALID'; end if;
  if exists (select 1 from stores where slug = v_slug and company_id <> p_company) then raise exception 'STORE_SLUG_TAKEN'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Indique el nombre'; end if;
  if p_published and length(v_wa) < 8 then raise exception 'STORE_NEEDS_WHATSAPP'; end if;
  if not exists (select 1 from branches where id = p_branch and company_id = p_company and deleted_at is null) then raise exception 'Sucursal inválida'; end if;
  update stores set slug = v_slug, name = trim(p_name), description = nullif(trim(coalesce(p_description, '')), ''),
         whatsapp = nullif(v_wa, ''), branch_id = p_branch, is_published = coalesce(p_published, false), updated_at = now()
   where company_id = p_company;
  if not found then raise exception 'Tienda inexistente'; end if;
end $$;

create or replace function public.store_admin(p_company uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare c companies%rowtype; s stores%rowtype; v_slug text; v_branch uuid; v_max int; v_n int := 0;
        pc boolean; pp boolean; pu boolean; pe boolean;
begin
  select * into c from companies where id = p_company and deleted_at is null;
  if not found or not store_enabled(c.org_id) then raise exception 'PERM_DENIED'; end if;
  pc := store_perm('store.create_product', c.id); pp := store_perm('store.photo', c.id); pu := store_perm('store.publish', c.id); pe := store_perm('store.edit_info', c.id);
  if not (pc or pp or pu or pe) then raise exception 'PERM_DENIED'; end if;
  select * into s from stores where company_id = c.id;
  if not found then
    if not pe then raise exception 'PERM_DENIED'; end if;
    select id into v_branch from branches where company_id = c.id and deleted_at is null and is_active order by code limit 1;
    v_slug := trim(both '-' from regexp_replace(lower(translate((select name from organizations where id = c.org_id),
                'áéíóúàèìòùäëïöüâêîôûñçÁÉÍÓÚÑÇ', 'aeiouaeiouaeiouaeiouncaeiounc')), '[^a-z0-9]+', '-', 'g'));
    v_slug := left(coalesce(nullif(v_slug, ''), 'tienda'), 34);
    if length(v_slug) < 3 then v_slug := v_slug || '-shop'; end if;
    while exists (select 1 from stores where slug = v_slug) loop
      v_n := v_n + 1; v_slug := left(regexp_replace(v_slug, '-[0-9]+$', ''), 34) || '-' || v_n;
    end loop;
    insert into stores (org_id, company_id, branch_id, slug, name)
    values (c.org_id, c.id, v_branch, v_slug, (select name from organizations where id = c.org_id)) returning * into s;
  end if;
  select p.max_store_products into v_max from organizations o join plans p on p.id = o.plan_id where o.id = c.org_id;
  return jsonb_build_object(
    'store', to_jsonb(s) - 'org_id', 'currency', c.base_currency, 'max_products', v_max,
    'perms', jsonb_build_object('create', pc, 'photo', pp, 'publish', pu, 'edit', pe),
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
