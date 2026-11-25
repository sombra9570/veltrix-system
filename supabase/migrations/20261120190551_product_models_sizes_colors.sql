alter table public.products add column if not exists model text, add column if not exists size text, add column if not exists color text;
create index if not exists products_company_model_idx on public.products (company_id, model) where model is not null;

-- Modelo con tallas y colores: cada combinación es un producto con su propio stock (así venta, caja e inventario funcionan igual)
create or replace function public.save_product_model(p_company uuid, p_model text, p_price numeric, p_sizes text[], p_colors text[], p_unit text default 'unid')
returns integer language plpgsql security definer set search_path to 'public' as $$
declare c companies%rowtype; s text; k text; sizes text[]; colors text[]; v_name text; v_sku text; made int := 0; v_model text := btrim(coalesce(p_model, ''));
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
      values (c.org_id, c.id, v_sku, v_name, round(p_price, 2), c.base_currency, 0, 'good', true, coalesce(nullif(btrim(p_unit), ''), 'unid'), true, auth.uid(), v_model, nullif(s, ''), nullif(k, ''));
      made := made + 1;
    end loop;
  end loop;
  return made;
end $$;
revoke all on function public.save_product_model(uuid, text, numeric, text[], text[], text) from public, anon;
grant execute on function public.save_product_model(uuid, text, numeric, text[], text[], text) to authenticated;

-- El inventario y el catálogo devuelven también modelo, talla y color
do $$
declare d text;
begin
  select pg_get_functiondef('public.inv_overview(uuid)'::regprocedure) into d;
  d := replace(d, $q$  return r;
end$q$, $q$  r := jsonb_set(r, '{items}', coalesce((select jsonb_agg(e || jsonb_build_object('model', p.model, 'size', p.size, 'color', p.color) order by i)
            from jsonb_array_elements(r->'items') with ordinality t(e, i) left join products p on p.id = (e->>'id')::uuid), '[]'::jsonb));
  return r;
end$q$);
  execute d;
  select pg_get_functiondef('public.products_admin(uuid)'::regprocedure) into d;
  d := replace(d, $q$'type', p.product_type,$q$, $q$'model', p.model, 'size', p.size, 'color', p.color, 'type', p.product_type,$q$);
  execute d;
end $$;
