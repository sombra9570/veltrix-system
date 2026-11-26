-- Matriz de roles por rubro (aprobada por Diego, 26 nov 2026).
-- Cada rubro ofrece solo sus roles; gerente, contador, directivo y secretaria siguen siendo transversales.
-- No quita roles ya activados: solo valida al agregar o asignar.

create table if not exists public.rubro_roles (
  category text not null,
  role text not null,
  primary key (category, role)
);
alter table public.rubro_roles enable row level security;
drop policy if exists rubro_roles_lectura on public.rubro_roles;
create policy rubro_roles_lectura on public.rubro_roles for select to authenticated using (true);

delete from public.rubro_roles;
insert into public.rubro_roles (category, role)
select c, r from (values
  -- Tienda y venta de productos
  (array['grocery','hardware','pharmacy','clothing','tech','auto_parts','bakery','stationery','agro'], array['vendor','cashier','storekeeper','delivery']),
  -- Venta a crédito y mayorista / rutas
  (array['credit_sales','wholesale'], array['vendor','cashier','storekeeper','delivery','collector','supervisor']),
  -- Restaurante / comida rápida
  (array['restaurant','fast_food'], array['waiter','kitchen','cashier','storekeeper','delivery','reception']),
  -- Taller mecánico y servicio técnico (el técnico es "Técnico"; la recepción se muestra como "Asesor de servicio")
  (array['mechanic','tech_repair'], array['technician','cashier','storekeeper','reception']),
  -- Belleza, clínica, lavandería, gimnasio, educación (el técnico es estilista, profesional, operario, instructor o profesor)
  (array['beauty','health','laundry','gym','education'], array['technician','reception','cashier']),
  -- Hotel (el técnico es limpieza); mesero y cocina por su módulo de restaurante
  (array['lodging'], array['technician','reception','cashier','waiter','kitchen']),
  -- Transporte (supervisor = despachador, delivery = conductor)
  (array['transport'], array['supervisor','delivery','cashier','reception','collector']),
  -- Préstamos / microfinanzas / cobranza en calle
  (array['collections','microfinance'], array['collector','supervisor'])
) as g(cats, roles), unnest(g.cats) as c, unnest(g.roles) as r;

-- ¿La organización tiene algún rubro que ofrezca este rol?
create or replace function public.role_in_org_rubros(p_org uuid, p_role text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select p_role in ('manager','accountant','director','secretary')
      or exists (
        select 1 from companies co, unnest(co.business_categories) as cat
        join rubro_roles rr on rr.category = cat and rr.role = p_role
        where co.org_id = p_org and co.deleted_at is null);
$$;

-- Validación por rubro de la empresa (reemplaza la validación por módulos)
create or replace function public.role_allowed_in_company(p_company uuid, p_role text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select case
    when p_role in ('manager','accountant','director','secretary') then true
    when p_role = 'delivery' then
      exists (select 1 from companies co, unnest(co.business_categories) as cat
              join rubro_roles rr on rr.category = cat and rr.role = 'delivery'
              where co.id = p_company)
      and exists (select 1 from branches b where b.company_id = p_company and b.delivery_enabled and b.deleted_at is null)
    else exists (select 1 from companies co, unnest(co.business_categories) as cat
                 join rubro_roles rr on rr.category = cat and rr.role = p_role
                 where co.id = p_company)
  end;
$$;

-- Validación a nivel de organización (disparador de membresías y roles del administrador)
create or replace function public.role_module_ok(p_org uuid, p_roles app_role[])
returns boolean language sql stable security definer set search_path to 'public' as $$
  select not exists (
    select 1 from unnest(coalesce(p_roles,'{}')) r
    where r::text in ('cashier','vendor','waiter','kitchen','technician','storekeeper','reception','delivery','collector','supervisor')
      and not role_in_org_rubros(p_org, r::text));
$$;

-- Activar un cargo desde la pantalla de equipo
create or replace function public.org_add_team_role(p_org uuid, p_role text)
returns text[] language plpgsql security definer set search_path to 'public' as $$
declare cur text[]; lim int; ok boolean;
begin
  if not is_org_owner(p_org) then raise exception 'Solo el administrador activa roles'; end if;
  if p_role not in ('supervisor','manager','cashier','vendor','collector','waiter','kitchen','technician','storekeeper','accountant','reception','delivery') then
    raise exception 'ROLE_NOT_IN_NICHE';
  end if;
  if p_role = 'delivery' and (module_enabled(p_org,'retail') or module_enabled(p_org,'restaurant') or module_enabled(p_org,'distribution'))
     and role_in_org_rubros(p_org, 'delivery')
     and not exists (select 1 from branches b where b.org_id = p_org and b.delivery_enabled and b.deleted_at is null) then
    raise exception 'ROLE_NEEDS_DELIVERY';
  end if;
  ok := role_in_org_rubros(p_org, p_role);
  if not ok then raise exception 'ROLE_NOT_IN_NICHE'; end if;
  if not role_plan_ok(p_org, array[p_role::app_role]) then raise exception 'ROLE_NOT_IN_PLAN'; end if;
  select coalesce(array(select jsonb_array_elements_text(o.onboarding->'roles')), '{}'), p.max_roles into cur, lim
    from organizations o join plans p on p.id = o.plan_id where o.id = p_org;
  if p_role = any(cur) then return cur; end if;
  if lim is not null and cardinality(cur) + 1 > lim then raise exception 'PLAN_ROLES_LIMIT:%', lim; end if;
  cur := cur || p_role;
  update organizations set onboarding = jsonb_set(coalesce(onboarding,'{}'::jsonb), '{roles}', to_jsonb(cur)), updated_at = now() where id = p_org;
  insert into audit_log(org_id, table_name, row_id, action, actor_id, new_data)
    values (p_org, 'organizations', p_org, 'add_team_role', auth.uid(), jsonb_build_object('role', p_role));
  return cur;
end $$;
