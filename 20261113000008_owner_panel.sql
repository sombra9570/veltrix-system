-- =====================================================================
-- Veltrix · Funciones del panel del dueño
-- =====================================================================

-- Crea una sucursal lista para trabajar: sucursal + caja + almacén (si usa inventario).
-- El límite del plan lo controla el trigger branches_plan_limit.
create or replace function create_branch(
  p_company uuid, p_name text, p_timezone text default null, p_address text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare c companies%rowtype; v_branch uuid; v_code text; v_tz text;
begin
  select * into c from companies where id = p_company and deleted_at is null;
  if not found or not is_org_owner(c.org_id) then raise exception 'Sin permiso'; end if;
  if not org_writable(c.org_id) then raise exception 'Suscripción suspendida: solo lectura'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Escribe el nombre de la sucursal'; end if;

  v_tz := coalesce(nullif(trim(p_timezone), ''),
                   (select timezone from branches where company_id = c.id and deleted_at is null order by created_at limit 1),
                   'America/La_Paz');
  if not exists (select 1 from pg_timezone_names where name = v_tz) then raise exception 'Zona horaria inválida'; end if;

  v_code := 'S' || lpad(((select count(*) from branches where company_id = c.id) + 1)::text, 2, '0');
  insert into branches (org_id, company_id, code, name, timezone, address, created_by)
  values (c.org_id, c.id, v_code, trim(p_name), v_tz, nullif(trim(p_address), ''), auth.uid())
  returning id into v_branch;

  insert into cash_registers (org_id, company_id, branch_id, name) values (c.org_id, c.id, v_branch, 'Caja 01');
  if module_enabled(c.org_id, 'inventory') then
    insert into warehouses (org_id, company_id, branch_id, name, is_default)
    values (c.org_id, c.id, v_branch, 'Almacén principal', true);
  end if;
  return v_branch;
end $$;

-- Crea otra empresa (otro país) con su sucursal principal. Límite: companies_plan_limit.
create or replace function create_company(
  p_legal_name text, p_country char(2), p_currency char(3),
  p_tax_id text default null, p_tax_rate numeric default 0, p_timezone text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_company uuid;
begin
  select org_id into v_org from profiles where id = auth.uid();
  if v_org is null or not is_org_owner(v_org) then raise exception 'Sin permiso'; end if;
  if not org_writable(v_org) then raise exception 'Suscripción suspendida: solo lectura'; end if;
  if coalesce(trim(p_legal_name), '') = '' then raise exception 'Escribe el nombre de la empresa'; end if;
  if p_tax_rate < 0 or p_tax_rate > 1 then raise exception 'Impuesto inválido'; end if;

  insert into companies (org_id, legal_name, tax_id, country_code, base_currency, tax_rate, created_by)
  values (v_org, trim(p_legal_name), nullif(trim(p_tax_id), ''), upper(p_country), upper(p_currency), p_tax_rate, auth.uid())
  returning id into v_company;

  perform create_branch(v_company, 'Sucursal Principal', p_timezone, null);
  return v_company;
end $$;

-- Resumen para la pantalla de inicio del dueño
create or replace function owner_overview(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v jsonb; l record;
begin
  if not (is_org_owner(p_org) or is_platform_admin()) then raise exception 'Sin permiso'; end if;
  select * into l from org_limits(p_org);

  select jsonb_build_object(
    'org', (select jsonb_build_object(
               'name', o.name, 'plan_code', p.code, 'plan_name', p.name, 'price_usd', p.price_usd,
               'status', o.subscription_status, 'trial_ends_at', o.trial_ends_at,
               'next_billing_date', o.next_billing_date, 'grace_ends_at', o.grace_ends_at)
              from organizations o join plans p on p.id = o.plan_id where o.id = p_org),
    'usage', jsonb_build_object(
       'companies', jsonb_build_object('used', l.used_companies, 'max', l.max_companies),
       'branches',  jsonb_build_object('used', l.used_branches,  'max', l.max_branches),
       'users',     jsonb_build_object('used', l.used_users,     'max', l.max_users),
       'storage_mb', jsonb_build_object('used', 0, 'max', l.max_storage_mb)),
    -- cobros de hoy (netos de reversos), por moneda, según la hora local de cada sucursal
    'today', coalesce((
       select jsonb_agg(jsonb_build_object('currency', x.currency, 'amount', x.amount, 'count', x.cnt))
         from (select pm.currency, sum(pm.amount) as amount, count(*) filter (where pm.amount > 0) as cnt
                 from payments pm join branches b on b.id = pm.branch_id
                where pm.org_id = p_org
                  and (pm.collected_at at time zone b.timezone)::date = (now() at time zone b.timezone)::date
                group by pm.currency) x), '[]'::jsonb),
    'open_shifts', (select count(*) from register_shifts s where s.org_id = p_org and s.status = 'open'),
    'pending_reversals', (select count(*) from payment_reversals r where r.org_id = p_org and r.status = 'pending'),
    'pending_settlements', (select count(*) from route_settlements st
                             where st.org_id = p_org and st.status = 'pending_delivery')
  ) into v;
  return v;
end $$;

revoke all on function create_branch(uuid, text, text, text) from public, anon;
revoke all on function create_company(text, char, char, text, numeric, text) from public, anon;
revoke all on function owner_overview(uuid) from public, anon;
grant execute on function create_branch(uuid, text, text, text) to authenticated;
grant execute on function create_company(text, char, char, text, numeric, text) to authenticated;
grant execute on function owner_overview(uuid) to authenticated;
