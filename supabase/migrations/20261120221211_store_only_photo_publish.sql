drop function if exists public.store_create_product(uuid, text, numeric, text[], text[], text, text, boolean);
drop function if exists public.store_add_all(uuid);

create or replace function public.perm_catalog() returns text[] language sql immutable set search_path = public as $$
  select array['cash.see_expected', 'cash.expense', 'cash.withdraw', 'cash.deposit', 'cash.change_fund',
    'sales.credit', 'customers.create', 'customers.edit', 'customers.view_docs', 'customers.upload_docs', 'collector.expenses',
    'loans.create', 'loans.customers', 'loans.interest', 'loans.cancel', 'loans.reschedule',
    'routes.liquidate', 'routes.invest', 'routes.approve_loans',
    'payments.reverse', 'products.create', 'products.edit', 'products.price', 'products.delete',
    'inv.receive', 'inv.purchase', 'inv.adjust',
    'inv.out_waste', 'inv.out_damaged', 'inv.out_expired', 'inv.out_internal', 'inv.out_supplier_return', 'inv.out_other',
    'inv.transfer', 'reports.export', 'sales.cancel_request', 'inv.see_cost',
    'store.photo', 'store.publish', 'store.edit_info'];
$$;

create or replace function public.can_write_store_file(p_name text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from companies c
                  where c.id::text = split_part(p_name, '/', 2) and c.org_id::text = split_part(p_name, '/', 1) and c.deleted_at is null
                    and (store_perm('store.photo', c.id) or store_perm('store.edit_info', c.id)));
$$;

create or replace function public.my_store_access(p_company uuid) returns boolean language sql stable security definer set search_path = public as $$
  select store_perm('store.photo', p_company) or store_perm('store.publish', p_company) or store_perm('store.edit_info', p_company);
$$;

create or replace function public.store_admin(p_company uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare c companies%rowtype; s stores%rowtype; v_slug text; v_branch uuid; v_max int; v_n int := 0; pp boolean; pu boolean; pe boolean;
begin
  select * into c from companies where id = p_company and deleted_at is null;
  if not found or not store_enabled(c.org_id) then raise exception 'PERM_DENIED'; end if;
  pp := store_perm('store.photo', c.id); pu := store_perm('store.publish', c.id); pe := store_perm('store.edit_info', c.id);
  if not (pp or pu or pe) then raise exception 'PERM_DENIED'; end if;
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
    'perms', jsonb_build_object('photo', pp, 'publish', pu, 'edit', pe),
    'branches', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by code), '[]'::jsonb)
                   from branches where company_id = c.id and deleted_at is null and is_active),
    'products', (select coalesce(jsonb_agg(x order by (x->>'in_store') desc, x->>'name'), '[]'::jsonb) from (
        select jsonb_build_object('id', min(p.id::text), 'name', coalesce(p.model, min(p.name)), 'price', min(p.unit_price), 'type', min(p.product_type),
               'in_store', bool_or(p.in_store), 'description', max(p.store_description), 'photo', max(p.photo_path), 'active', bool_or(p.is_active),
               'variants', case when p.model is null then 1 else count(*) end) as x
          from products p
         where p.company_id = c.id and p.deleted_at is null and p.is_active and p.product_type in ('good','service','combo')
         group by coalesce(p.model, p.id::text), p.model) t)
  );
end $$;
