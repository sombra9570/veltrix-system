-- El contador puede CONSULTAR inventario (existencias, movimientos) y clientes (saldos, mora). No puede modificar nada.
create or replace function public.can_view_stock(p_branch uuid) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select can_stock(p_branch) or has_branch_role(p_branch, '{accountant}');
$$;

create or replace function public.can_read_customers(p_branch uuid) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select can_handle_customers(p_branch) or has_branch_role(p_branch, '{accountant}');
$$;

do $$
declare d text; n text;
begin
  foreach n in array array['_inv_overview_full', 'inv_movements', 'inv_purchases'] loop
    select pg_get_functiondef(p.oid) into d from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = n;
    d := replace(d, 'not can_stock(b.id)', 'not can_view_stock(b.id)');
    d := replace(d, 'not can_stock(p_branch)', 'not can_view_stock(p_branch)');
    execute d;
  end loop;
  foreach n in array array['customers_list', 'customer_detail'] loop
    select pg_get_functiondef(p.oid) into d from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = n;
    d := replace(d, 'not can_handle_customers(p_branch)', 'not can_read_customers(p_branch)');
    d := replace(d, 'not can_handle_customers(c.branch_id)', 'not can_read_customers(c.branch_id)');
    execute d;
  end loop;
end $$;

revoke all on function public.can_view_stock(uuid) from public, anon;
revoke all on function public.can_read_customers(uuid) from public, anon;
grant execute on function public.can_view_stock(uuid) to authenticated;
grant execute on function public.can_read_customers(uuid) to authenticated;
