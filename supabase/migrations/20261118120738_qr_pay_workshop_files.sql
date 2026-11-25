insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sale-files', 'sale-files', false, 1048576, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

create or replace function public.can_access_sale_file(p_name text, p_write boolean)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from branches b
                  where b.id::text = split_part(p_name, '/', 2) and b.org_id::text = split_part(p_name, '/', 1)
                    and b.deleted_at is null
                    and (is_branch_member(b.id) or (not p_write and (org_reader(b.org_id) or branch_reader(b.id)))));
$$;
revoke all on function public.can_access_sale_file(text, boolean) from public, anon;
grant execute on function public.can_access_sale_file(text, boolean) to authenticated;

drop policy if exists sale_files_insert on storage.objects;
create policy sale_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'sale-files' and can_access_sale_file(name, true) and storage_has_room(name));
drop policy if exists sale_files_read on storage.objects;
create policy sale_files_read on storage.objects for select to authenticated
  using (bucket_id = 'sale-files' and can_access_sale_file(name, false));

alter table public.branches add column if not exists pay_qr_path text;
alter table public.branches add column if not exists pay_qr_note text;

create or replace function public.set_pay_qr(p_branch uuid, p_path text, p_note text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare b branches%rowtype;
begin
  select * into b from branches where id = p_branch;
  if not found or not is_branch_manager(p_branch) then raise exception 'PERM_DENIED'; end if;
  if p_path is not null and split_part(p_path, '/', 1) <> b.org_id::text or p_path is not null and split_part(p_path, '/', 2) <> b.id::text then
    raise exception 'Ruta inválida';
  end if;
  update branches set pay_qr_path = p_path, pay_qr_note = nullif(left(trim(coalesce(p_note, '')), 160), ''), updated_at = now()
   where id = p_branch;
end $$;

create or replace function public.pay_qr_info(p_branch uuid default null, p_shift uuid default null)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v_branch uuid; b branches%rowtype;
begin
  if p_shift is not null then
    select branch_id into v_branch from register_shifts where id = p_shift and (cashier_id = auth.uid() or is_branch_manager(branch_id));
  else
    v_branch := p_branch;
  end if;
  if v_branch is null or not is_branch_member(v_branch) then raise exception 'PERM_DENIED'; end if;
  select * into b from branches where id = v_branch;
  return jsonb_build_object('org_id', b.org_id, 'branch_id', b.id, 'path', b.pay_qr_path, 'note', b.pay_qr_note,
                            'manager', is_branch_manager(b.id));
end $$;

create table if not exists public.payment_attachments (
  payment_id uuid primary key references public.payments(id) on delete cascade,
  org_id     uuid not null,
  branch_id  uuid not null references public.branches(id),
  path       text not null,
  created_by uuid,
  created_at timestamptz not null default now()
);
alter table public.payment_attachments enable row level security;
drop policy if exists payatt_read on public.payment_attachments;
create policy payatt_read on public.payment_attachments for select
  using (org_reader(org_id) or branch_reader(branch_id) or created_by = (select auth.uid()));

create or replace function public.payment_proof_add(p_offline_uuid uuid, p_path text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare p payments%rowtype;
begin
  select * into p from payments where offline_uuid = p_offline_uuid;
  if not found then raise exception 'Cobro no encontrado'; end if;
  if not (p.collected_by = auth.uid() or is_branch_manager(p.branch_id)) then raise exception 'PERM_DENIED'; end if;
  if split_part(p_path, '/', 1) <> p.org_id::text or split_part(p_path, '/', 2) <> p.branch_id::text then raise exception 'Ruta inválida'; end if;
  insert into payment_attachments (payment_id, org_id, branch_id, path, created_by)
  values (p.id, p.org_id, p.branch_id, p_path, auth.uid())
  on conflict (payment_id) do update set path = excluded.path, created_by = excluded.created_by, created_at = now();
end $$;

create or replace function public.shift_proofs(p_shift uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare s register_shifts%rowtype;
begin
  select * into s from register_shifts where id = p_shift;
  if not found or not (is_branch_manager(s.branch_id) or branch_reader(s.branch_id)) then raise exception 'PERM_DENIED'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
            'at', p.collected_at, 'amount', p.amount, 'method', p.method, 'path', a.path,
            'customer', (select c.name from customers c where c.id = p.customer_id and not c.is_walk_in))
          order by p.collected_at), '[]'::jsonb)
    from payments p join payment_attachments a on a.payment_id = p.id
   where p.shift_id = p_shift);
end $$;

create table if not exists public.work_order_files (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null,
  branch_id  uuid not null references public.branches(id),
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  kind       text not null check (kind in ('photo', 'signature')),
  path       text not null,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists work_order_files_wo_idx on public.work_order_files (work_order_id, created_at);
alter table public.work_order_files enable row level security;
drop policy if exists wofiles_read on public.work_order_files;
create policy wofiles_read on public.work_order_files for select
  using (org_reader(org_id) or branch_reader(branch_id) or can_work_shop(branch_id));

create or replace function public._wo_resolve(p_wo uuid)
returns work_orders language sql stable security definer set search_path to 'public' as $$
  select * from work_orders where id = p_wo or order_id = p_wo limit 1;
$$;
revoke all on function public._wo_resolve(uuid) from public, anon, authenticated;

create or replace function public.wo_file_add(p_wo uuid, p_kind text, p_path text)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare w work_orders%rowtype; v_id uuid; n int;
begin
  w := _wo_resolve(p_wo);
  if w.id is null then raise exception 'Orden inexistente'; end if;
  if not can_work_shop(w.branch_id) then raise exception 'PERM_DENIED'; end if;
  if p_kind not in ('photo', 'signature') then raise exception 'Tipo inválido'; end if;
  if split_part(p_path, '/', 1) <> w.org_id::text or split_part(p_path, '/', 2) <> w.branch_id::text then raise exception 'Ruta inválida'; end if;
  select count(*) into n from work_order_files where work_order_id = w.id and kind = 'photo';
  if p_kind = 'photo' and n >= 8 then raise exception 'WO_PHOTO_LIMIT'; end if;
  if p_kind = 'signature' then delete from work_order_files where work_order_id = w.id and kind = 'signature'; end if;
  insert into work_order_files (org_id, branch_id, work_order_id, kind, path, created_by)
  values (w.org_id, w.branch_id, w.id, p_kind, p_path, auth.uid()) returning id into v_id;
  return v_id;
end $$;

create or replace function public.wo_files(p_wo uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare w work_orders%rowtype;
begin
  w := _wo_resolve(p_wo);
  if w.id is null or not (can_work_shop(w.branch_id) or branch_reader(w.branch_id) or org_reader(w.org_id)) then raise exception 'PERM_DENIED'; end if;
  return jsonb_build_object('org_id', w.org_id, 'branch_id', w.branch_id,
    'files', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'kind', f.kind, 'path', f.path, 'at', f.created_at) order by f.created_at), '[]'::jsonb)
                from work_order_files f where f.work_order_id = w.id));
end $$;

revoke all on function public.set_pay_qr(uuid, text, text) from public, anon;
revoke all on function public.pay_qr_info(uuid, uuid) from public, anon;
revoke all on function public.payment_proof_add(uuid, text) from public, anon;
revoke all on function public.shift_proofs(uuid) from public, anon;
revoke all on function public.wo_file_add(uuid, text, text) from public, anon;
revoke all on function public.wo_files(uuid) from public, anon;
grant execute on function public.set_pay_qr(uuid, text, text) to authenticated;
grant execute on function public.pay_qr_info(uuid, uuid) to authenticated;
grant execute on function public.payment_proof_add(uuid, text) to authenticated;
grant execute on function public.shift_proofs(uuid) to authenticated;
grant execute on function public.wo_file_add(uuid, text, text) to authenticated;
grant execute on function public.wo_files(uuid) to authenticated;
