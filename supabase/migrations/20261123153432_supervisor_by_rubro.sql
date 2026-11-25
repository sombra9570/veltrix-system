-- Módulos que trae cada rubro (espejo de business-catalog.ts)
create or replace function public.category_modules(p_cat text) returns text[]
language sql immutable set search_path to 'public' as $$
  select case
    when p_cat in ('grocery','hardware','pharmacy','clothing','tech','auto_parts','bakery','stationery','agro') then array['retail','inventory','purchasing']
    when p_cat = 'wholesale' then array['distribution','inventory','purchasing','field_collection']
    when p_cat = 'credit_sales' then array['retail','inventory','field_collection']
    when p_cat in ('restaurant','fast_food') then array['restaurant','inventory','purchasing']
    when p_cat = 'mechanic' then array['workshop','inventory','purchasing']
    when p_cat = 'tech_repair' then array['workshop','inventory']
    when p_cat in ('beauty','health','laundry') then array['workshop','retail']
    when p_cat in ('gym','education') then array['retail','field_collection']
    when p_cat = 'lodging' then array['retail','restaurant']
    when p_cat = 'transport' then array['distribution','field_collection']
    when p_cat in ('microfinance','collections') then array['field_collection','finance']
    else array[]::text[] end
$$;

-- Rubros de la empresa de una sucursal
create or replace function public.branch_cats(p_branch uuid) returns text[]
language sql stable security definer set search_path to 'public' as $$
  select coalesce((select c.business_categories::text[] from branches b join companies c on c.id = b.company_id where b.id = p_branch), '{}')
$$;

-- Valor de partida de cada permiso para un supervisor, según el rubro de su sucursal
create or replace function public.supervisor_branch_default(p_branch uuid, p_key text) returns boolean
language plpgsql stable security definer set search_path to 'public' as $$
declare cats text[]; mods text[]; lending boolean; fld boolean;
begin
  cats := branch_cats(p_branch);
  if p_key in ('collector.delete_credits','collector.delete_customers','collector.delete_installments','collector.delete_expenses') then return false; end if;
  if cardinality(cats) = 0 then
    -- sin rubro definido: se conserva el comportamiento anterior
    return not (p_key in ('loans.customers','payments.record_installment','payments.record_partial','loans.create','loans.interest','routes.liquidate','collector.expenses','routes.invest'));
  end if;
  select coalesce(array_agg(distinct x), '{}') into mods from (select unnest(category_modules(c)) x from unnest(cats) c) s;
  lending := cats && array['microfinance','collections'];
  fld := 'field_collection' = any(mods);
  return case
    when p_key like 'loans.%' or p_key = 'routes.invest' then lending
    when p_key in ('routes.liquidate','payments.record_installment','payments.record_partial') or p_key like 'collector.%' then fld
    when p_key like 'inv.%' or (p_key like 'products.%' and p_key <> 'products.see_code') then 'inventory' = any(mods)
    when p_key like 'store.%' then mods && array['retail','restaurant']
    else true end;
end $$;

-- has_perm: el supervisor parte con lo que corresponde al rubro de su sucursal
DO $mig$
declare d text; s int; e int; newc text;
begin
  d := pg_get_functiondef('public.has_perm(text,uuid)'::regprocedure);
  s := position(E'    when p_key = any(array[''loans.customers''' in d);
  if s = 0 then raise exception 'cláusula anterior no encontrada'; end if;
  e := position('then false' in substr(d, s));
  newc := E'    when (p_key not like ''routes.%'' or p_key in (''routes.liquidate'',''routes.invest''))\n         and exists (select 1 from memberships m where m.user_id = auth.uid() and m.branch_id = p_branch and m.role = ''supervisor'' and m.is_active and m.deleted_at is null)\n      then supervisor_branch_default(p_branch, p_key)\n';
  d := left(d, s - 1) || newc || substr(d, s + e + length('then false'));
  -- quitar el salto de línea que sobra tras el cuerpo reemplazado
  execute d;
end
$mig$;

-- Pantallas del personal según el rubro de su empresa (el dueño ve todo)
create or replace function public.my_modules() returns text[]
language sql stable security definer set search_path to 'public' as $$
  with me as (select org_id from profiles where id = auth.uid()),
  scope as (
    select
      exists (select 1 from memberships m where m.user_id = auth.uid() and m.is_active and m.deleted_at is null and (m.role = 'owner' or m.branch_id is null)) as all_access,
      coalesce((select array_agg(distinct cm) from memberships m
                  join branches b on b.id = m.branch_id join companies c on c.id = b.company_id
                  cross join lateral unnest(coalesce(c.business_categories::text[], '{}')) cat
                  cross join lateral unnest(category_modules(cat)) cm
                 where m.user_id = auth.uid() and m.is_active and m.deleted_at is null), '{}') as mods
  )
  select coalesce(array_agg(m.module order by m.module), '{}')
    from org_modules m, me, scope
   where m.enabled and m.org_id = me.org_id
     and (scope.all_access or cardinality(scope.mods) = 0 or m.module in ('finance','hr') or m.module = any(scope.mods));
$$;
