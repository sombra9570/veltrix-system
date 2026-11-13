-- =====================================================================
--  VELTRIX — 03 · Puente con la app Next.js (negocios-pro)
--  Datos que las pantallas actuales usan y que el núcleo no tenía.
-- =====================================================================

-- Planes iniciales (precios de referencia; se editan desde el superadmin)
insert into plans (code, name, price_usd, features) values
  ('starter',    'Starter',    35,  '{"modules":["retail","inventory"]}'),
  ('pro',        'Pro',        60,  '{"modules":["retail","inventory","purchasing","finance","field_collection"]}'),
  ('enterprise', 'Enterprise', 199, '{"all_modules":true}')
on conflict (code) do nothing;

-- Rubro y sector fiscal que muestra la app (régimen ya existe: companies.tax_regime)
alter table companies
  add column if not exists business_type   text,
  add column if not exists business_sector text not null default 'standard'
    check (business_sector in ('standard','essential','special'));

-- Correo visible del trabajador (el login real está en Supabase Auth)
alter table profiles add column if not exists email text;

-- Al crear la empresa: sucursal principal, almacén y caja listos para operar
create or replace function bootstrap_company(p_company uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare c companies%rowtype; v_branch uuid; m text;
begin
  select * into c from companies where id = p_company;
  if not found or not is_org_owner(c.org_id) then raise exception 'Sin permiso'; end if;

  -- Activa los módulos que permite el plan
  for m in select unnest(array['inventory','purchasing','finance','retail','restaurant',
                               'workshop','field_collection','distribution','hr']) loop
    begin
      insert into org_modules (org_id, module) values (c.org_id, m) on conflict do nothing;
    exception when others then null;   -- el plan no lo incluye: se omite
    end;
  end loop;

  select id into v_branch from branches where company_id = c.id and deleted_at is null order by created_at limit 1;
  if v_branch is null then
    insert into branches (org_id, company_id, code, name)
    values (c.org_id, c.id, 'PRI', 'Sucursal Principal') returning id into v_branch;
  end if;
  if not exists (select 1 from cash_registers where branch_id = v_branch) then
    insert into cash_registers (org_id, company_id, branch_id, name) values (c.org_id, c.id, v_branch, 'Caja 01');
  end if;
  if module_enabled(c.org_id, 'inventory') and not exists (select 1 from warehouses where branch_id = v_branch) then
    insert into warehouses (org_id, company_id, branch_id, name, is_default)
    values (c.org_id, c.id, v_branch, 'Almacén principal', true);
  end if;
  return v_branch;
end $$;
