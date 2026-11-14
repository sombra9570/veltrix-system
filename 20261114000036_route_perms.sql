-- =====================================================================
-- Veltrix · Permisos de caja de ruta, delegables por el administrador
--   routes.liquidate: hacer el cierre de caja (liquidación) con gastos, pagos y retiros
--   routes.invest:    meter inversión o retirar dinero de la caja de la ruta
--   El administrador siempre puede; al supervisor se le da por defecto y se le puede quitar;
--   al cobrador u otro rol se le puede dar. Estos permisos no se dan solos por ser supervisor.
-- =====================================================================
create or replace function perm_catalog() returns text[]
language sql immutable as $$
  select array['cash.see_expected', 'cash.movements', 'sales.credit', 'customers.edit',
               'customers.view_docs', 'collector.expenses',
               'loans.create', 'loans.customers', 'loans.interest', 'loans.cancel',
               'routes.liquidate', 'routes.invest'];
$$;

create or replace function perm_default(p_role text, p_key text) returns boolean
language sql immutable as $$
  select case when p_key = 'cash.see_expected' then false
              when p_key in ('loans.interest', 'loans.cancel', 'routes.liquidate', 'routes.invest') then p_role = 'supervisor'
              else true end;
$$;

do $$
declare d text;
begin
  -- El supervisor ya no recibe solo los permisos de caja de ruta: los decide el administrador
  d := pg_get_functiondef('has_perm(text, uuid)'::regprocedure);
  if position('routes.%' in d) = 0 then
    d := replace(d, 'when is_branch_manager(p_branch) then true', 'when is_branch_manager(p_branch) and p_key not like ''routes.%'' then true');
    if position('routes.%' in d) = 0 then raise exception 'has_perm: no se pudo aplicar'; end if;
    execute d;
  end if;

  -- El supervisor aparece en la pantalla de permisos (por rol y por persona)
  d := pg_get_functiondef('permissions_admin(uuid)'::regprocedure);
  if position('''supervisor'', ''cashier''' in d) = 0 then
    d := replace(d, 'array[''cashier'', ''vendor'',', 'array[''supervisor'', ''cashier'', ''vendor'',');
    d := replace(d, 'and m.role not in (''owner'', ''supervisor'')', 'and m.role <> ''owner''');
    if position('''supervisor'', ''cashier''' in d) = 0 then raise exception 'permissions_admin: no se pudo aplicar'; end if;
    execute d;
  end if;

  d := pg_get_functiondef('set_role_permission(uuid, text, text, boolean)'::regprocedure);
  if position('p_role in (''owner'', ''supervisor'')' in d) > 0 then
    d := replace(d, 'p_role in (''owner'', ''supervisor'')', 'p_role = ''owner''');
    execute d;
  end if;

  -- Cierre de caja e inversión/retiro según permiso
  d := pg_get_functiondef('liquidate_route(uuid, numeric, jsonb, text)'::regprocedure);
  if position('routes.liquidate' in d) = 0 then
    d := replace(d, 'if not found or not (is_org_owner(r.org_id) or is_branch_manager(r.branch_id)) then raise exception ''Sin permiso''; end if;',
                    'if not found or not has_perm(''routes.liquidate'', r.branch_id) then raise exception ''ROUTE_NO_PERMISSION''; end if;');
    if position('routes.liquidate' in d) = 0 then raise exception 'liquidate_route: no se pudo aplicar'; end if;
    execute d;
  end if;
  d := pg_get_functiondef('route_fund_move(uuid, text, numeric, text)'::regprocedure);
  if position('routes.invest' in d) = 0 then
    d := replace(d, 'if not found or not (is_org_owner(r.org_id) or is_branch_manager(r.branch_id)) then raise exception ''Sin permiso''; end if;',
                    'if not found or not has_perm(''routes.invest'', r.branch_id) then raise exception ''ROUTE_NO_PERMISSION''; end if;');
    if position('routes.invest' in d) = 0 then raise exception 'route_fund_move: no se pudo aplicar'; end if;
    execute d;
  end if;

  -- El cobrador sabe si tiene esos permisos delegados
  d := pg_get_functiondef('collector_day()'::regprocedure);
  if position('can_liquidate' in d) = 0 then
    d := replace(d, '''can_loan'', has_perm(''loans.create'', r.branch_id),',
      '''can_loan'', has_perm(''loans.create'', r.branch_id),
        ''can_liquidate'', has_perm(''routes.liquidate'', r.branch_id),
        ''can_invest'', has_perm(''routes.invest'', r.branch_id),');
    if position('can_liquidate' in d) = 0 then raise exception 'collector_day: no se pudo aplicar'; end if;
    execute d;
  end if;
end $$;
