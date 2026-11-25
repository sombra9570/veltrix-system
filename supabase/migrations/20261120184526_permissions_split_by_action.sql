create or replace function public._perm_split(j jsonb) returns jsonb language plpgsql immutable as $$
declare r jsonb := coalesce(j, '{}'::jsonb); k text;
begin
  if jsonb_typeof(r) <> 'object' then return j; end if;
  if r ? 'cash.movements' then
    foreach k in array array['cash.expense','cash.withdraw','cash.deposit','cash.change_fund'] loop r := r || jsonb_build_object(k, r->'cash.movements'); end loop;
    r := r - 'cash.movements';
  end if;
  if r ? 'inv.out' then
    foreach k in array array['inv.out_waste','inv.out_damaged','inv.out_expired','inv.out_internal','inv.out_supplier_return','inv.out_other'] loop r := r || jsonb_build_object(k, r->'inv.out'); end loop;
    r := r - 'inv.out';
  end if;
  if r ? 'customers.edit' then r := r || jsonb_build_object('customers.create', r->'customers.edit'); end if;
  if r ? 'customers.view_docs' then r := r || jsonb_build_object('customers.upload_docs', r->'customers.view_docs'); end if;
  if r ? 'products.edit' then r := r || jsonb_build_object('products.create', r->'products.edit'); end if;
  if r ? 'inv.receive' then r := r || jsonb_build_object('inv.purchase', r->'inv.receive'); end if;
  return r;
end $$;

update organizations o set role_permissions = (select jsonb_object_agg(e.key, public._perm_split(e.value)) from jsonb_each(o.role_permissions) e)
 where o.role_permissions is not null and jsonb_typeof(o.role_permissions) = 'object' and o.role_permissions <> '{}'::jsonb;
update memberships set permissions = public._perm_split(permissions) where permissions is not null and permissions <> '{}'::jsonb;
update custom_roles set permissions = public._perm_split(permissions) where permissions is not null and permissions <> '{}'::jsonb;

create or replace function public.perm_catalog() returns text[] language sql immutable set search_path to 'public' as $$
  select array['cash.see_expected', 'cash.expense', 'cash.withdraw', 'cash.deposit', 'cash.change_fund',
    'sales.credit', 'customers.create', 'customers.edit', 'customers.view_docs', 'customers.upload_docs', 'collector.expenses',
    'loans.create', 'loans.customers', 'loans.interest', 'loans.cancel', 'loans.reschedule',
    'routes.liquidate', 'routes.invest', 'routes.approve_loans',
    'payments.reverse', 'products.create', 'products.edit', 'products.price', 'products.delete',
    'inv.receive', 'inv.purchase', 'inv.adjust',
    'inv.out_waste', 'inv.out_damaged', 'inv.out_expired', 'inv.out_internal', 'inv.out_supplier_return', 'inv.out_other',
    'inv.transfer', 'reports.export', 'sales.cancel_request', 'inv.see_cost'];
$$;

do $$
declare d text;
begin
  select pg_get_functiondef('public.add_cash_movement(cash_movement_type,numeric,text)'::regprocedure) into d;
  d := replace(d, $q$has_perm('cash.movements', s.branch_id)$q$, $q$has_perm(case p_type when 'withdrawal' then 'cash.withdraw' when 'deposit' then 'cash.deposit' when 'change_fund' then 'cash.change_fund' else 'cash.expense' end, s.branch_id)$q$);
  d := replace(d, 'para registrar movimientos de caja', 'para registrar este movimiento de caja');
  execute d;

  select pg_get_functiondef('public.save_customer(uuid,uuid,text,text,text,text,numeric,text)'::regprocedure) into d;
  d := replace(d, $q$has_perm('customers.edit', p_branch)$q$, $q$has_perm(case when p_id is null then 'customers.create' else 'customers.edit' end, p_branch)$q$);
  execute d;

  select pg_get_functiondef('public.save_product(uuid,uuid,text,numeric,product_type,boolean,text,text,boolean)'::regprocedure) into d;
  d := replace(d, $q$has_perm_company('products.edit', c.id)$q$, $q$has_perm_company(case when p_id is null then 'products.create' else 'products.edit' end, c.id)$q$);
  execute d;

  select pg_get_functiondef('public.inv_receive(uuid,uuid,jsonb,text,integer)'::regprocedure) into d;
  d := replace(d, $q$has_perm('inv.receive', b.id)$q$, $q$has_perm(case when p_supplier is null then 'inv.receive' else 'inv.purchase' end, b.id)$q$);
  execute d;

  select pg_get_functiondef('public.inv_out(uuid,uuid,numeric,text)'::regprocedure) into d;
  d := replace(d, 'p_qty numeric, p_reason text)', $q$p_qty numeric, p_reason text, p_kind text DEFAULT 'other')$q$);
  d := replace(d, $q$has_perm('inv.out', b.id)$q$, $q$has_perm('inv.out_' || case when p_kind in ('waste','damaged','expired','internal','supplier_return') then p_kind else 'other' end, b.id)$q$);
  execute d;
  drop function public.inv_out(uuid, uuid, numeric, text);

  select pg_get_functiondef('public.can_access_customer_file(text)'::regprocedure) into d;
  d := replace(d, 'can_access_customer_file(p_name text)', 'can_upload_customer_file(p_name text)');
  d := replace(d, $q$has_perm('customers.view_docs', c.branch_id)$q$, $q$has_perm('customers.upload_docs', c.branch_id)$q$);
  execute d;
end $$;

revoke all on function public.inv_out(uuid, uuid, numeric, text, text) from public, anon;
grant execute on function public.inv_out(uuid, uuid, numeric, text, text) to authenticated;
revoke all on function public.can_upload_customer_file(text) from public, anon;
grant execute on function public.can_upload_customer_file(text) to authenticated;
drop function public._perm_split(jsonb);

alter policy customer_files_insert on storage.objects with check (bucket_id = 'customer-files' and public.can_upload_customer_file(name) and storage_has_room(name));
alter policy customer_files_update on storage.objects using (bucket_id = 'customer-files' and public.can_access_customer_file(name)) with check (bucket_id = 'customer-files' and public.can_upload_customer_file(name));
alter policy customer_files_delete on storage.objects using (bucket_id = 'customer-files' and public.can_upload_customer_file(name));
