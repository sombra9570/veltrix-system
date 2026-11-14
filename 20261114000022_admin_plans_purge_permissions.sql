-- =====================================================================
-- Veltrix · Consola: planes y precios, borrar empresas de prueba
--          Dueño: permisos por rol y por usuario (caja ciega y otros)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PLANES Y PRECIOS (solo superadmin) + lectura pública para la portada
-- ---------------------------------------------------------------------
create or replace function admin_save_plan(
  p_code text, p_name text, p_price_usd numeric, p_price_global_usd numeric,
  p_max_companies int, p_max_branches int, p_max_users int, p_max_storage_mb int,
  p_max_store_products int, p_chat_retention_days int
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'Solo el superadmin'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Indique el nombre'; end if;
  if p_price_usd is null or p_price_usd < 0 or p_price_global_usd is null or p_price_global_usd < 0 then
    raise exception 'PLAN_PRICE_INVALID';
  end if;
  if least(p_max_companies, p_max_branches, p_max_users, p_max_storage_mb, p_max_store_products, p_chat_retention_days) < 1 then
    raise exception 'PLAN_LIMIT_INVALID';
  end if;
  update plans set name = trim(p_name), price_usd = round(p_price_usd, 2), price_global_usd = round(p_price_global_usd, 2),
         max_companies = p_max_companies, max_branches = p_max_branches, max_users = p_max_users,
         max_storage_mb = p_max_storage_mb, max_store_products = p_max_store_products,
         chat_retention_days = p_chat_retention_days, updated_at = now()
   where code = p_code;
  if not found then raise exception 'Plan inexistente'; end if;
end $$;

create or replace function admin_plans() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'Solo el superadmin'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
            'code', p.code, 'name', p.name, 'price_usd', p.price_usd, 'price_global_usd', p.price_global_usd,
            'max_companies', p.max_companies, 'max_branches', p.max_branches, 'max_users', p.max_users,
            'max_storage_mb', p.max_storage_mb, 'max_store_products', p.max_store_products,
            'chat_retention_days', p.chat_retention_days,
            'orgs', (select count(*) from organizations o where o.plan_id = p.id and o.deleted_at is null))
            order by p.price_usd), '[]'::jsonb) from plans p where p.is_active);
end $$;

-- La portada muestra los precios reales (sin datos privados)
create or replace function public_plans() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'code', code, 'name', name, 'price_usd', price_usd, 'price_global_usd', coalesce(price_global_usd, price_usd),
           'max_companies', max_companies, 'max_branches', max_branches, 'max_users', max_users,
           'max_storage_mb', max_storage_mb) order by price_usd), '[]'::jsonb)
    from plans where is_active;
$$;

-- ---------------------------------------------------------------------
-- 2. BORRAR UNA EMPRESA DE PRUEBA POR COMPLETO (solo superadmin)
--    Los registros históricos no se pueden borrar nunca, salvo dentro de
--    esta función (marca veltrix.purge, solo durante su transacción).
-- ---------------------------------------------------------------------
do $$
declare f text; d text;
begin
  foreach f in array array['forbid_change', 'guard_draft_children', 'audit_row'] loop
    d := pg_get_functiondef(f::regproc);
    if position('veltrix.purge' in d) = 0 then
      d := regexp_replace(d, E'\\nbegin\\r?\\n',
             E'\nbegin\n  if current_setting(''veltrix.purge'', true) = ''on'' then return coalesce(new, old); end if;\n');
      if position('veltrix.purge' in d) = 0 then raise exception 'No se pudo preparar %', f; end if;
      execute d;
    end if;
  end loop;
end $$;

create or replace function admin_purge_org(p_org uuid, p_confirm text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_name text; v_users uuid[]; t record; v_left int; v_pass int := 0; v_progress boolean;
        v_n int; v_total int := 0; v_stuck text; v_files int := 0;
begin
  if not is_platform_admin() then raise exception 'Solo el superadmin'; end if;
  select name into v_name from organizations where id = p_org;
  if v_name is null then raise exception 'Organización inexistente'; end if;
  if trim(coalesce(p_confirm, '')) <> v_name then raise exception 'PURGE_NAME_MISMATCH'; end if;
  if exists (select 1 from profiles where id = auth.uid() and org_id = p_org) then
    raise exception 'No puedes borrar tu propia organización';
  end if;

  select array_agg(id) into v_users from profiles
   where org_id = p_org and id not in (select user_id from platform_admins);

  perform set_config('veltrix.purge', 'on', true);

  delete from chat_reads where channel_id in (select id from chat_channels where org_id = p_org);
  delete from chat_members where channel_id in (select id from chat_channels where org_id = p_org);

  -- Varias pasadas: cada tabla se borra cuando ya no la referencia ninguna otra
  loop
    v_pass := v_pass + 1; v_progress := false; v_left := 0;
    for t in
      select c.table_name
        from information_schema.columns c
        join information_schema.tables tt on tt.table_schema = c.table_schema and tt.table_name = c.table_name
       where c.table_schema = 'public' and c.column_name = 'org_id' and tt.table_type = 'BASE TABLE'
         and c.table_name not in ('organizations', 'profiles')
    loop
      begin
        execute format('delete from %I where org_id = $1', t.table_name) using p_org;
        get diagnostics v_n = row_count;
        if v_n > 0 then v_progress := true; v_total := v_total + v_n; end if;
      exception when foreign_key_violation then
        v_left := v_left + 1; v_stuck := t.table_name;
      end;
    end loop;
    exit when v_left = 0;
    if not v_progress or v_pass > 20 then raise exception 'PURGE_STUCK %', v_stuck; end if;
  end loop;

  delete from profiles where org_id = p_org;
  delete from organizations where id = p_org;

  -- Cuentas de acceso del personal (no las del superadmin)
  begin
    delete from auth.users where id = any(coalesce(v_users, '{}'));
  exception when others then null;
  end;
  -- Archivos: si el almacenamiento no permite borrarlos por SQL, quedan contados para borrarlos a mano
  begin
    delete from storage.objects where name like p_org::text || '/%';
  exception when others then
    select count(*) into v_files from storage.objects where name like p_org::text || '/%';
  end;

  return jsonb_build_object('name', v_name, 'rows', v_total, 'users', coalesce(array_length(v_users, 1), 0),
                            'files_left', v_files);
end $$;

-- ---------------------------------------------------------------------
-- 3. PERMISOS POR ROL Y POR USUARIO
--    Dueño y supervisor siempre pueden todo. Para el resto del personal:
--    permiso del usuario > permiso de su rol en la empresa > valor por defecto.
-- ---------------------------------------------------------------------
alter table organizations add column if not exists role_permissions jsonb not null default '{}'::jsonb;
alter table memberships   add column if not exists permissions      jsonb not null default '{}'::jsonb;

create or replace function perm_catalog() returns text[]
language sql immutable as $$
  select array['cash.see_expected', 'cash.movements', 'sales.credit', 'customers.edit',
               'customers.view_docs', 'collector.expenses'];
$$;

-- Por defecto: caja ciega (el cajero NO ve el efectivo esperado); lo demás permitido
create or replace function perm_default(p_role text, p_key text) returns boolean
language sql immutable as $$
  select case when p_key = 'cash.see_expected' then false else true end;
$$;

create or replace function has_perm(p_key text, p_branch uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when is_platform_admin() then true
    when exists (select 1 from branches b where b.id = p_branch and is_org_owner(b.org_id)) then true
    when is_branch_manager(p_branch) then true
    else coalesce(
      -- 1) excepción puesta a este usuario
      (select bool_or((m.permissions->>p_key)::boolean)
         from memberships m
        where m.user_id = auth.uid() and m.branch_id = p_branch and m.is_active and m.deleted_at is null
          and m.permissions ? p_key),
      -- 2) permiso del rol en la organización, o 3) valor por defecto
      (select bool_or(coalesce((o.role_permissions->(m.role::text)->>p_key)::boolean, perm_default(m.role::text, p_key)))
         from memberships m join organizations o on o.id = m.org_id
        where m.user_id = auth.uid() and m.branch_id = p_branch and m.is_active and m.deleted_at is null),
      false)
  end;
$$;

-- Permisos efectivos del usuario en una sucursal (para mostrar u ocultar botones)
create or replace function my_permissions(p_branch uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(k, has_perm(k, p_branch)), '{}'::jsonb) from unnest(perm_catalog()) k;
$$;

create or replace function permissions_admin(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_roles text[] := array['cashier', 'vendor', 'collector', 'waiter', 'kitchen', 'technician', 'storekeeper', 'accountant'];
begin
  if not (is_org_owner(p_org) or is_platform_admin()) then raise exception 'Sin permiso'; end if;
  return jsonb_build_object(
    'keys', to_jsonb(perm_catalog()),
    'roles', (select jsonb_object_agg(r, (select jsonb_object_agg(k,
                coalesce((o.role_permissions->r->>k)::boolean, perm_default(r, k))) from unnest(perm_catalog()) k))
              from unnest(v_roles) r, organizations o where o.id = p_org),
    'users', (select coalesce(jsonb_agg(jsonb_build_object(
                'membership_id', m.id, 'name', p.full_name, 'role', m.role, 'branch', b.name,
                'permissions', m.permissions) order by p.full_name, m.role), '[]'::jsonb)
                from memberships m
                join profiles p on p.id = m.user_id
                left join branches b on b.id = m.branch_id
               where m.org_id = p_org and m.is_active and m.deleted_at is null
                 and m.role not in ('owner', 'supervisor'))
  );
end $$;

create or replace function set_role_permission(p_org uuid, p_role text, p_key text, p_value boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_org_owner(p_org) then raise exception 'Solo el dueño cambia los permisos'; end if;
  if not (p_key = any(perm_catalog())) then raise exception 'Permiso inexistente'; end if;
  if p_role in ('owner', 'supervisor') or p_role not in (select unnest(enum_range(null::app_role))::text) then
    raise exception 'Rol inválido';
  end if;
  update organizations
     set role_permissions = jsonb_set(role_permissions, array[p_role],
           coalesce(role_permissions->p_role, '{}'::jsonb) || jsonb_build_object(p_key, coalesce(p_value, perm_default(p_role, p_key))))
   where id = p_org;
end $$;

-- p_value null = vuelve a heredar el permiso del rol
create or replace function set_user_permission(p_membership uuid, p_key text, p_value boolean) returns void
language plpgsql security definer set search_path = public as $$
declare m memberships%rowtype;
begin
  select * into m from memberships where id = p_membership and deleted_at is null;
  if not found or not is_org_owner(m.org_id) then raise exception 'Solo el dueño cambia los permisos'; end if;
  if not (p_key = any(perm_catalog())) then raise exception 'Permiso inexistente'; end if;
  update memberships
     set permissions = case when p_value is null then permissions - p_key
                            else permissions || jsonb_build_object(p_key, p_value) end,
         updated_at = now()
   where id = p_membership;
end $$;

-- El dueño no puede tocar los permisos por fuera de estas funciones (dato protegido)
create or replace function guard_org_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not is_platform_admin() and
     (new.subscription_status, new.plan_id, new.next_billing_date, new.grace_ends_at,
      new.payment_method_token, new.trial_ends_at,
      new.extra_branches, new.extra_users, new.extra_storage_mb, new.ai_monthly_quota,
      new.is_pilot, new.founder_discount_pct, new.founder_until,
      new.billing_provider, new.billing_customer_id, new.billing_subscription_id, new.billing_portal_url,
      new.billing_cancel_at)
     is distinct from
     (old.subscription_status, old.plan_id, old.next_billing_date, old.grace_ends_at,
      old.payment_method_token, old.trial_ends_at,
      old.extra_branches, old.extra_users, old.extra_storage_mb, old.ai_monthly_quota,
      old.is_pilot, old.founder_discount_pct, old.founder_until,
      old.billing_provider, old.billing_customer_id, old.billing_subscription_id, old.billing_portal_url,
      old.billing_cancel_at) then
    raise exception 'Los datos de suscripción solo los cambia la pasarela de pago';
  end if;
  return new;
end $$;

-- Aplicar los permisos dentro de las funciones existentes
do $$
declare d text;
  procedure_patch text;
begin
  -- Cajero: ve el efectivo esperado solo si tiene el permiso (si no, arqueo ciego)
  d := pg_get_functiondef('cashier_home'::regproc);
  if position('cash.see_expected' in d) = 0 then
    d := replace(d, '''opening_cash'', s.opening_cash,',
      '''opening_cash'', s.opening_cash, ''expected'', case when has_perm(''cash.see_expected'', s.branch_id) then _shift_expected_cash(s.id) end,');
    if position('cash.see_expected' in d) = 0 then raise exception 'cashier_home: no se pudo aplicar'; end if;
    execute d;
  end if;

  -- Cajero: gastos, retiros y depósitos
  d := pg_get_functiondef('add_cash_movement(cash_movement_type,numeric,text)'::regprocedure);
  if position('cash.movements' in d) = 0 then
    d := replace(d, 'if s.id is null then raise exception ''Necesita un turno de caja abierto''; end if;',
      'if s.id is null then raise exception ''Necesita un turno de caja abierto''; end if;
  if not has_perm(''cash.movements'', s.branch_id) then raise exception ''Tu usuario no tiene permiso para registrar movimientos de caja''; end if;');
    if position('cash.movements' in d) = 0 then raise exception 'add_cash_movement: no se pudo aplicar'; end if;
    execute d;
  end if;

  -- Cobrador: gastos de ruta
  d := pg_get_functiondef('collector_expense(uuid,numeric,text,uuid)'::regprocedure);
  if position('collector.expenses' in d) = 0 then
    d := replace(d, 'if not found then raise exception ''Esta ruta no está asignada a usted''; end if;',
      'if not found then raise exception ''Esta ruta no está asignada a usted''; end if;
  if not has_perm(''collector.expenses'', r.branch_id) then raise exception ''Tu usuario no tiene permiso para registrar gastos de ruta''; end if;');
    if position('collector.expenses' in d) = 0 then raise exception 'collector_expense: no se pudo aplicar'; end if;
    execute d;
  end if;

  -- Ventas a crédito
  d := pg_get_functiondef('create_credit_sale(uuid,uuid,jsonb,integer,integer,date,text)'::regprocedure);
  if position('sales.credit' in d) = 0 then
    d := replace(d, 'then raise exception ''Sin permiso para vender a crédito''; end if;',
      'then raise exception ''Sin permiso para vender a crédito''; end if;
  if not has_perm(''sales.credit'', b.id) then raise exception ''Tu usuario no tiene permiso para vender a crédito''; end if;');
    if position('sales.credit' in d) = 0 then raise exception 'create_credit_sale: no se pudo aplicar'; end if;
    execute d;
  end if;

  -- Crear o editar clientes
  d := pg_get_functiondef('save_customer(uuid,uuid,text,text,text,text,numeric,text)'::regprocedure);
  if position('customers.edit' in d) = 0 then
    d := replace(d, 'if not can_handle_customers(p_branch) then raise exception ''Sin permiso''; end if;',
      'if not can_handle_customers(p_branch) then raise exception ''Sin permiso''; end if;
  if not has_perm(''customers.edit'', p_branch) then raise exception ''Tu usuario no tiene permiso para crear o editar clientes''; end if;');
    if position('customers.edit' in d) = 0 then raise exception 'save_customer: no se pudo aplicar'; end if;
    execute d;
  end if;
end $$;

-- Ver fotos de carnet de los clientes
create or replace function can_access_customer_file(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from customers c
     where c.id::text = split_part(p_name, '/', 2)
       and c.org_id::text = split_part(p_name, '/', 1)
       and c.deleted_at is null
       and (is_branch_manager(c.branch_id) or has_branch_role(c.branch_id, '{supervisor,vendor}'))
       and has_perm('customers.view_docs', c.branch_id));
$$;

revoke execute on function admin_save_plan(text, text, numeric, numeric, int, int, int, int, int, int), admin_plans(),
  admin_purge_org(uuid, text), has_perm(text, uuid), my_permissions(uuid), permissions_admin(uuid),
  set_role_permission(uuid, text, text, boolean), set_user_permission(uuid, text, boolean) from public, anon;
grant execute on function public_plans() to anon, authenticated, service_role;
grant execute on function admin_save_plan(text, text, numeric, numeric, int, int, int, int, int, int), admin_plans(),
  admin_purge_org(uuid, text), has_perm(text, uuid), my_permissions(uuid), permissions_admin(uuid),
  set_role_permission(uuid, text, text, boolean), set_user_permission(uuid, text, boolean) to authenticated, service_role;
grant execute on function perm_catalog(), perm_default(text, text) to authenticated, service_role;
