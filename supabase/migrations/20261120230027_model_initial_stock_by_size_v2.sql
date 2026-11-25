create or replace function public.save_product_model(p_company uuid, p_model text, p_price numeric, p_sizes text[], p_colors text[], p_unit text, p_stock jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare c companies%rowtype; s text; k text; sizes text[]; colors text[]; v_name text; v_sku text; made int := 0; v_model text := btrim(coalesce(p_model, ''));
        v_id uuid; v_q numeric; v_branch uuid; v_wh uuid; v_ref uuid := gen_random_uuid();
begin
  select * into c from companies where id = p_company and deleted_at is null;
  if not found then raise exception 'Empresa inexistente'; end if;
  if not can_manage_catalog(c.id) then raise exception 'Sin permiso para editar productos'; end if;
  if not has_perm_company('products.create', c.id) then raise exception 'PERM_DENIED'; end if;
  if not org_writable(c.org_id) then raise exception 'Cuenta suspendida: solo lectura'; end if;
  if v_model = '' then raise exception 'Indique el nombre del modelo'; end if;
  if p_price is null or p_price < 0 then raise exception 'Precio inválido'; end if;
  sizes := array(select distinct btrim(x) from unnest(coalesce(p_sizes, '{}')) x where btrim(x) <> '');
  colors := array(select distinct btrim(x) from unnest(coalesce(p_colors, '{}')) x where btrim(x) <> '');
  if cardinality(sizes) = 0 then sizes := array['']; end if;
  if cardinality(colors) = 0 then colors := array['']; end if;
  if cardinality(sizes) > 30 or cardinality(colors) > 30 or cardinality(sizes) * cardinality(colors) > 300 then raise exception 'Demasiadas variantes'; end if;
  if p_stock is not null and jsonb_typeof(p_stock) = 'object' and p_stock <> '{}'::jsonb then
    select b.id into v_branch from branches b where b.company_id = c.id and b.deleted_at is null and b.is_active order by b.code limit 1;
    if v_branch is not null then
      if not has_perm('inv.receive', v_branch) then raise exception 'PERM_DENIED'; end if;
      v_wh := ensure_default_warehouse(v_branch);
    end if;
  end if;
  foreach s in array sizes loop
    foreach k in array colors loop
      if exists (select 1 from products where company_id = c.id and deleted_at is null and lower(model) = lower(v_model)
                   and coalesce(size, '') = s and coalesce(color, '') = k) then continue; end if;
      v_name := v_model || case when s <> '' then ' · ' || s else '' end || case when k <> '' then ' · ' || k else '' end;
      v_sku := upper(left(regexp_replace(v_model, '[^A-Za-z0-9]', '', 'g'), 4)) || '-' || upper(regexp_replace(s, '[^A-Za-z0-9]', '', 'g')) || '-' || upper(left(regexp_replace(k, '[^A-Za-z0-9]', '', 'g'), 3));
      while exists (select 1 from products where company_id = c.id and sku = v_sku) loop
        v_sku := v_sku || floor(random() * 9)::int::text;
      end loop;
      insert into products (org_id, company_id, sku, name, unit_price, currency, tax_rate, product_type, track_stock, unit, is_active, created_by, model, size, color)
      values (c.org_id, c.id, v_sku, v_name, round(p_price, 2), c.base_currency, 0, 'good', true, coalesce(nullif(btrim(p_unit), ''), 'unid'), true, auth.uid(), v_model, nullif(s, ''), nullif(k, ''))
      returning id into v_id;
      made := made + 1;
      if v_wh is not null then
        v_q := floor(coalesce(nullif(p_stock ->> (s || '|' || k), '')::numeric, 0));
        if v_q > 0 then perform post_stock(v_branch, v_wh, v_id, v_q, 'purchase', 0, 'manual_entry', v_ref, null); end if;
      end if;
    end loop;
  end loop;
  return made;
end $$;
revoke all on function public.save_product_model(uuid,text,numeric,text[],text[],text,jsonb) from public, anon;
grant execute on function public.save_product_model(uuid,text,numeric,text[],text[],text,jsonb) to authenticated;
