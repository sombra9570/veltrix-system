create or replace function public.delete_product(p_product uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_company uuid;
begin
  select company_id into v_company from products where id = p_product and deleted_at is null;
  if v_company is null or not can_manage_catalog(v_company) then raise exception 'Sin permiso'; end if;
  update products set deleted_at = now(), is_active = false, in_store = false, updated_at = now() where id = p_product;
end $$;

create table if not exists inventory_evidence (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null, company_id uuid not null, branch_id uuid not null references branches(id),
  kind text not null check (kind in ('in', 'out', 'adjust', 'transfer')),
  condition text not null default 'ok' check (condition in ('ok', 'damaged', 'incomplete', 'expired', 'returned')),
  summary text, note text, photo_path text,
  created_by uuid not null default auth.uid(), created_at timestamptz not null default now()
);
create index if not exists inventory_evidence_branch_idx on inventory_evidence (branch_id, created_at desc);
alter table inventory_evidence enable row level security;
revoke all on inventory_evidence from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('inventory-files', 'inventory-files', false, 1048576, array['image/webp','image/jpeg','image/png'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.can_access_inventory_file(p_name text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from branches b where b.id::text = split_part(p_name, '/', 2) and b.org_id::text = split_part(p_name, '/', 1)
                  and b.deleted_at is null and (can_stock(b.id) or branch_reader(b.id)));
$$;
revoke all on function public.can_access_inventory_file(text) from public, anon;
grant execute on function public.can_access_inventory_file(text) to authenticated;
drop policy if exists inventory_files_read on storage.objects;
drop policy if exists inventory_files_insert on storage.objects;
create policy inventory_files_read on storage.objects for select to authenticated
  using (bucket_id = 'inventory-files' and can_access_inventory_file(name));
create policy inventory_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'inventory-files' and can_access_inventory_file(name) and storage_has_room(name));

create or replace function public.inv_evidence_add(p_branch uuid, p_kind text, p_condition text, p_summary text, p_note text, p_photo text)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare b branches%rowtype; v_id uuid;
begin
  select * into b from branches where id = p_branch and deleted_at is null;
  if not found or not can_stock(b.id) then raise exception 'Sin permiso'; end if;
  if p_photo is not null and split_part(p_photo, '/', 2) <> b.id::text then raise exception 'Ruta inválida'; end if;
  insert into inventory_evidence (org_id, company_id, branch_id, kind, condition, summary, note, photo_path)
  values (b.org_id, b.company_id, b.id, p_kind, coalesce(nullif(p_condition, ''), 'ok'),
          nullif(left(trim(coalesce(p_summary, '')), 300), ''), nullif(left(trim(coalesce(p_note, '')), 500), ''), p_photo)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.inv_evidence_list(p_branch uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not (can_stock(p_branch) or branch_reader(p_branch)) then raise exception 'Sin permiso'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'at', e.created_at, 'kind', e.kind, 'condition', e.condition,
           'summary', e.summary, 'note', e.note, 'photo', e.photo_path, 'by', p.full_name) order by e.created_at desc)
    from (select * from inventory_evidence where branch_id = p_branch order by created_at desc limit 100) e
    left join profiles p on p.id = e.created_by), '[]'::jsonb);
end $$;

create or replace function public.inv_out(p_branch uuid, p_product uuid, p_qty numeric, p_reason text)
returns numeric language plpgsql security definer set search_path to 'public' as $$
declare b branches%rowtype; v_wh uuid; v_have numeric; v_cost numeric;
begin
  select * into b from branches where id = p_branch and deleted_at is null;
  if not found or not can_stock(b.id) then raise exception 'Sin permiso'; end if;
  if not org_writable(b.org_id) then raise exception 'Cuenta suspendida: solo lectura'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'Cantidad inválida'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Indique el motivo de la salida'; end if;
  v_wh := ensure_default_warehouse(b.id);
  select coalesce((select qty from stock_levels where warehouse_id = v_wh and product_id = p_product), 0) into v_have;
  if p_qty > v_have then raise exception 'No hay suficiente stock'; end if;
  select cost into v_cost from products where id = p_product and company_id = b.company_id and deleted_at is null;
  if not found then raise exception 'Producto inválido'; end if;
  perform post_stock(b.id, v_wh, p_product, -p_qty, 'adjustment', v_cost, 'stock_out', null, left(trim(p_reason), 200));
  return v_have - p_qty;
end $$;

revoke all on function public.delete_product(uuid) from public, anon;
revoke all on function public.inv_evidence_add(uuid, text, text, text, text, text) from public, anon;
revoke all on function public.inv_evidence_list(uuid) from public, anon;
revoke all on function public.inv_out(uuid, uuid, numeric, text) from public, anon;
grant execute on function public.delete_product(uuid) to authenticated;
grant execute on function public.inv_evidence_add(uuid, text, text, text, text, text) to authenticated;
grant execute on function public.inv_evidence_list(uuid) to authenticated;
grant execute on function public.inv_out(uuid, uuid, numeric, text) to authenticated;
