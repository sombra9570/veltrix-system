create or replace function public.inv_transfer_targets(p_branch uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare src record;
begin
  if not can_stock(p_branch) then raise exception 'Sin permiso'; end if;
  select b.org_id, b.company_id, c.base_currency into src
    from branches b join companies c on c.id = b.company_id where b.id = p_branch;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'company', c.legal_name)
                                    order by c.legal_name, b.code), '[]'::jsonb)
            from branches b join companies c on c.id = b.company_id
           where b.org_id = src.org_id and b.id <> p_branch
             and b.deleted_at is null and b.is_active and c.deleted_at is null
             and c.base_currency = src.base_currency
             and (is_org_owner(src.org_id) or b.company_id = src.company_id)
             and exists (select 1 from warehouses w where w.branch_id = b.id and w.is_active and w.deleted_at is null));
end $$;

create or replace function public.inv_transfer(p_from_branch uuid, p_to_branch uuid, p_items jsonb, p_note text default null)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare wa uuid; wb uuid; it jsonb; n int := 0; v_qty numeric;
begin
  if not can_stock(p_from_branch) then raise exception 'Sin permiso'; end if;
  if not exists (select 1 from jsonb_array_elements(inv_transfer_targets(p_from_branch)) e where (e->>'id')::uuid = p_to_branch) then
    raise exception 'TRANSFER_TARGET';
  end if;
  select id into wa from warehouses where branch_id = p_from_branch and is_active and deleted_at is null order by is_default desc, created_at limit 1;
  select id into wb from warehouses where branch_id = p_to_branch and is_active and deleted_at is null order by is_default desc, created_at limit 1;
  if wa is null or wb is null then raise exception 'TRANSFER_TARGET'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Transferencia inválida'; end if;
  for it in select * from jsonb_array_elements(p_items) loop
    v_qty := (it->>'qty')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'Transferencia inválida'; end if;
    perform transfer_stock(wa, wb, (it->>'product_id')::uuid, v_qty, nullif(left(trim(coalesce(p_note, '')), 200), ''));
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.fin_accounts(p_company uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v_org uuid;
begin
  select org_id into v_org from companies where id = p_company;
  if v_org is null or not (org_reader(v_org) or has_company_role(p_company, '{supervisor,accountant}')) then
    raise exception 'Sin permiso';
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
            'id', a.id, 'name', a.name, 'type', a.type, 'currency', a.currency, 'active', a.is_active,
            'paid', coalesce((select sum(sp.amount) from supplier_payments sp where sp.account_id = a.id), 0))
          order by a.is_active desc, a.name), '[]'::jsonb)
    from financial_accounts a where a.company_id = p_company);
end $$;

create or replace function public.fin_save_account(p_id uuid, p_company uuid, p_name text, p_type financial_account_type, p_active boolean default true)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare c companies%rowtype; v_id uuid;
begin
  select * into c from companies where id = p_company and deleted_at is null;
  if not found or not is_org_owner(c.org_id) then raise exception 'Sin permiso'; end if;
  if p_name is null or length(trim(p_name)) = 0 then raise exception 'Falta el nombre'; end if;
  if p_id is null then
    insert into financial_accounts (org_id, company_id, name, type, currency, is_active)
    values (c.org_id, c.id, left(trim(p_name), 80), p_type, c.base_currency, true) returning id into v_id;
  else
    update financial_accounts set name = left(trim(p_name), 80), type = p_type, is_active = coalesce(p_active, true)
     where id = p_id and company_id = c.id returning id into v_id;
    if v_id is null then raise exception 'Cuenta inexistente'; end if;
  end if;
  return v_id;
end $$;

revoke all on function public.inv_transfer_targets(uuid) from public, anon;
revoke all on function public.inv_transfer(uuid, uuid, jsonb, text) from public, anon;
revoke all on function public.fin_accounts(uuid) from public, anon;
revoke all on function public.fin_save_account(uuid, uuid, text, financial_account_type, boolean) from public, anon;
grant execute on function public.inv_transfer_targets(uuid) to authenticated;
grant execute on function public.inv_transfer(uuid, uuid, jsonb, text) to authenticated;
grant execute on function public.fin_accounts(uuid) to authenticated;
grant execute on function public.fin_save_account(uuid, uuid, text, financial_account_type, boolean) to authenticated;
