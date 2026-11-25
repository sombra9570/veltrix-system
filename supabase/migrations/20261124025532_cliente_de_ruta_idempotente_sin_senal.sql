drop function if exists public.collector_save_customer(uuid,text,text,text,text,text,numeric,numeric,text,text,text,numeric,numeric);

create or replace function public.collector_save_customer(
  p_route uuid, p_name text, p_phone text default null, p_address text default null, p_tax_id text default null, p_notes text default null,
  p_lat numeric default null, p_lng numeric default null, p_g_name text default null, p_g_phone text default null, p_g_address text default null,
  p_g_lat numeric default null, p_g_lng numeric default null, p_offline_uuid uuid default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare r collection_routes%rowtype; pol jsonb; v_id uuid;
begin
  perform assert_route_open(p_route);
  select * into r from collection_routes where id = p_route and deleted_at is null and is_active;
  if not found or not (r.collector_id = auth.uid() or r.supervisor_id = auth.uid() or is_branch_manager(r.branch_id) or is_org_owner(r.org_id)) then
    raise exception 'Esta ruta no está asignada a usted';
  end if;
  if not has_perm('loans.customers', r.branch_id) then raise exception 'LOAN_NO_PERMISSION'; end if;
  if not org_writable(r.org_id) then raise exception 'Cuenta suspendida: solo lectura'; end if;
  -- Reintento de un cliente creado sin señal: el identificador evita duplicarlo
  if p_offline_uuid is not null then
    select id into v_id from customers where id = p_offline_uuid and route_id = r.id;
    if found then return v_id; end if;
    if exists (select 1 from customers where id = p_offline_uuid) then raise exception 'Identificador en uso'; end if;
  end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Indique el nombre'; end if;
  if coalesce(trim(p_tax_id), '') = '' or coalesce(trim(p_phone), '') = '' or coalesce(trim(p_address), '') = ''
     or p_lat is null or p_lng is null then raise exception 'CUSTOMER_REQUIRED'; end if;
  pol := loan_policy(r.org_id);
  if (pol->>'max_customers_collector')::numeric > 0
     and (select count(*) from customers where route_id = r.id and deleted_at is null) >= (pol->>'max_customers_collector')::numeric then
    raise exception 'LOAN_MAX_CUSTOMERS';
  end if;
  insert into customers (id, branch_id, route_id, name, phone, address, tax_id, notes, gps_lat, gps_lng,
                         guarantor_name, guarantor_phone, guarantor_address, guarantor_lat, guarantor_lng)
  values (coalesce(p_offline_uuid, gen_random_uuid()), r.branch_id, r.id, trim(p_name), nullif(trim(coalesce(p_phone, '')), ''), nullif(trim(coalesce(p_address, '')), ''),
          nullif(trim(coalesce(p_tax_id, '')), ''), nullif(trim(coalesce(p_notes, '')), ''), p_lat, p_lng,
          nullif(trim(coalesce(p_g_name, '')), ''), nullif(trim(coalesce(p_g_phone, '')), ''), nullif(trim(coalesce(p_g_address, '')), ''), p_g_lat, p_g_lng)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.collector_save_customer(uuid,text,text,text,text,text,numeric,numeric,text,text,text,numeric,numeric,uuid) from public, anon;
grant execute on function public.collector_save_customer(uuid,text,text,text,text,text,numeric,numeric,text,text,text,numeric,numeric,uuid) to authenticated, service_role;
