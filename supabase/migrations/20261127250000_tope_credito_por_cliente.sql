-- Tope de crédito por cliente (cobranza en calle): lo fija el administrador, o el gerente con el permiso loans.set_cap.
-- Si el cliente tiene tope, ese tope reemplaza al máximo por préstamo de la ruta para ese cliente.
alter table public.customers add column if not exists credit_cap numeric(14,2) check (credit_cap is null or credit_cap > 0);

do $$
declare src text; src2 text;
begin
  select pg_get_functiondef(p.oid) into src from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='perm_catalog';
  src2 := replace(src, '''customers.photo_gallery'']', '''customers.photo_gallery'', ''loans.set_cap'']');
  if src2 = src then raise exception 'perm_catalog'; end if;
  execute src2;

  select pg_get_functiondef(p.oid) into src from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='role_offered_keys_base';
  src2 := replace(src, '''perms.manage'',''routes.assign'',''reports.supervisors'']', '''perms.manage'',''routes.assign'',''reports.supervisors'',''loans.set_cap'']');
  if src2 = src then
    src2 := replace(src, '''perms.manage'',''routes.assign'',''reports.supervisors''', '''perms.manage'',''routes.assign'',''reports.supervisors'',''loans.set_cap''');
  end if;
  if src2 = src then raise exception 'role_offered_keys_base'; end if;
  execute src2;

  select pg_get_functiondef(p.oid) into src from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='perm_default_base';
  src2 := replace(src, '''perms.manage'', ''routes.assign'', ''reports.supervisors'') then false', '''perms.manage'', ''routes.assign'', ''reports.supervisors'', ''loans.set_cap'') then false');
  if src2 = src then raise exception 'perm_default_base'; end if;
  execute src2;

  select pg_get_functiondef(p.oid) into src from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='create_street_loan';
  src2 := replace(src, 'if coalesce((r.permissions->>''max_loan'')::numeric, 0) > 0 and p_principal > (r.permissions->>''max_loan'')::numeric then raise exception ''LOAN_ROUTE_MAX_AMOUNT''; end if;',
    'if c.credit_cap is not null then
    if p_principal > c.credit_cap then raise exception ''LOAN_CUSTOMER_CAP:%'', c.credit_cap; end if;
  elsif coalesce((r.permissions->>''max_loan'')::numeric, 0) > 0 and p_principal > (r.permissions->>''max_loan'')::numeric then raise exception ''LOAN_ROUTE_MAX_AMOUNT''; end if;');
  if src2 = src then raise exception 'create_street_loan'; end if;
  execute src2;

  select pg_get_functiondef(p.oid) into src from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='route_customers_admin';
  src2 := replace(src, 'not (is_org_owner(r.org_id))', 'not (org_delegate_can(r.org_id, ''loans.set_cap'') or is_org_owner(r.org_id))');
  src2 := replace(src2, '''balance'', customer_open_balance(c.id)', '''credit_cap'', c.credit_cap, ''balance'', customer_open_balance(c.id)');
  if src2 = src then raise exception 'route_customers_admin'; end if;
  execute src2;
end $$;

create or replace function public.set_customer_credit_cap(p_customer uuid, p_cap numeric)
returns numeric language plpgsql security definer set search_path to 'public' as $$
declare c customers%rowtype;
begin
  select * into c from customers where id = p_customer and deleted_at is null;
  if not found then raise exception 'CUSTOMER_NOT_FOUND'; end if;
  if not street_org(c.org_id) or not org_delegate_can(c.org_id, 'loans.set_cap') then raise exception 'PERM_DENIED'; end if;
  update customers set credit_cap = case when p_cap is null or p_cap <= 0 then null else round(p_cap, 2) end where id = p_customer;
  return case when p_cap is null or p_cap <= 0 then null else round(p_cap, 2) end;
end $$;
revoke all on function public.set_customer_credit_cap(uuid, numeric) from public;
grant execute on function public.set_customer_credit_cap(uuid, numeric) to authenticated;
