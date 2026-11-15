-- 046: pago de la suscripción por transferencia o QR bancario con comprobante
-- El administrador del cliente sube la foto del comprobante; el superadmin la aprueba y la suscripción se extiende sola
-- (reutiliza admin_record_payment → subscription_events → on_subscription_paid).

create table if not exists platform_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table platform_settings enable row level security;
revoke all on platform_settings from anon, authenticated;

create table if not exists payment_proofs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  months int not null check (months between 1 and 24),
  amount numeric(12,2) not null check (amount > 0),
  currency char(3) not null,
  reference text,
  file_path text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  note text,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  decided_by uuid,
  decided_at timestamptz
);
create index if not exists payment_proofs_org_idx on payment_proofs (org_id, created_at desc);
create index if not exists payment_proofs_pending_idx on payment_proofs (created_at) where status = 'pending';
alter table payment_proofs enable row level security;
revoke all on payment_proofs from anon, authenticated;

-- Bucket privado: <org_id>/archivo (comprobantes) y platform/ (QR de cobro de Veltrix)
insert into storage.buckets (id, name, public) values ('billing-proofs', 'billing-proofs', false)
on conflict (id) do nothing;

create or replace function public.can_access_billing_file(p_name text, p_write boolean)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select case
    when split_part(p_name, '/', 1) = 'platform' then (not p_write and auth.uid() is not null) or is_platform_admin()
    when split_part(p_name, '/', 1) ~ '^[0-9a-f-]{36}$' then is_org_owner(split_part(p_name, '/', 1)::uuid) or (not p_write and is_platform_admin())
    else false end;
$$;
revoke all on function public.can_access_billing_file(text, boolean) from public, anon;
grant execute on function public.can_access_billing_file(text, boolean) to authenticated;

drop policy if exists billing_files_read on storage.objects;
drop policy if exists billing_files_insert on storage.objects;
drop policy if exists billing_files_update on storage.objects;
create policy billing_files_read on storage.objects for select to authenticated
  using (bucket_id = 'billing-proofs' and can_access_billing_file(name, false));
create policy billing_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'billing-proofs' and can_access_billing_file(name, true));
create policy billing_files_update on storage.objects for update to authenticated
  using (bucket_id = 'billing-proofs' and can_access_billing_file(name, true));

-- Datos para transferir (los ve cualquier usuario con sesión; solo el superadmin los cambia)
create or replace function public.billing_transfer_info()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce((select value from platform_settings where key = 'transfer'), '{}'::jsonb);
$$;

create or replace function public.admin_set_transfer_info(p_value jsonb)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not is_platform_admin() then raise exception 'Solo el superadmin'; end if;
  insert into platform_settings (key, value, updated_at) values ('transfer', coalesce(p_value, '{}'::jsonb), now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
end $$;

create or replace function public.submit_payment_proof(p_org uuid, p_months int, p_amount numeric, p_currency text, p_reference text, p_path text)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid;
begin
  if not is_org_owner(p_org) then raise exception 'Sin permiso'; end if;
  if p_months is null or p_months not between 1 and 24 then raise exception 'PAYMENT_MONTHS_INVALID'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'PAYMENT_AMOUNT_INVALID'; end if;
  if p_path is null or split_part(p_path, '/', 1) <> p_org::text then raise exception 'Comprobante inválido'; end if;
  if (select count(*) from payment_proofs where org_id = p_org and status = 'pending') >= 3 then
    raise exception 'PROOF_TOO_MANY';
  end if;
  insert into payment_proofs (org_id, months, amount, currency, reference, file_path)
  values (p_org, p_months, round(p_amount, 2), upper(coalesce(nullif(trim(p_currency), ''), 'USD')),
          nullif(trim(coalesce(p_reference, '')), ''), p_path)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.my_payment_proofs(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not is_org_owner(p_org) then raise exception 'Sin permiso'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'at', created_at, 'months', months, 'amount', amount,
            'currency', currency, 'reference', reference, 'status', status, 'note', note) order by created_at desc)
            from (select * from payment_proofs where org_id = p_org order by created_at desc limit 20) x), '[]'::jsonb);
end $$;

create or replace function public.admin_payment_proofs(p_status text default 'pending')
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not is_platform_admin() then raise exception 'Solo el superadmin'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', pp.id, 'at', pp.created_at, 'org_id', o.id, 'org', o.name,
            'email', o.billing_email, 'plan', pl.name, 'plan_usd', pl.price_usd, 'months', pp.months, 'amount', pp.amount,
            'currency', pp.currency, 'reference', pp.reference, 'path', pp.file_path, 'status', pp.status, 'note', pp.note)
            order by pp.created_at)
     from payment_proofs pp join organizations o on o.id = pp.org_id left join plans pl on pl.id = o.plan_id
    where pp.status = coalesce(p_status, 'pending')), '[]'::jsonb);
end $$;

create or replace function public.admin_decide_payment_proof(p_id uuid, p_approve boolean, p_amount_usd numeric, p_note text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare r payment_proofs%rowtype; v_until date;
begin
  if not is_platform_admin() then raise exception 'Solo el superadmin'; end if;
  select * into r from payment_proofs where id = p_id for update;
  if not found or r.status <> 'pending' then raise exception 'Comprobante ya resuelto o inexistente'; end if;
  if p_approve then
    v_until := admin_record_payment(r.org_id, p_amount_usd, r.months, 'transfer:' || r.id::text);
  end if;
  update payment_proofs set status = case when p_approve then 'approved' else 'rejected' end,
         note = nullif(trim(coalesce(p_note, '')), ''), decided_by = auth.uid(), decided_at = now()
   where id = p_id;
  return jsonb_build_object('status', case when p_approve then 'approved' else 'rejected' end, 'until', v_until);
end $$;

revoke all on function public.billing_transfer_info() from public, anon;
revoke all on function public.admin_set_transfer_info(jsonb) from public, anon;
revoke all on function public.submit_payment_proof(uuid, int, numeric, text, text, text) from public, anon;
revoke all on function public.my_payment_proofs(uuid) from public, anon;
revoke all on function public.admin_payment_proofs(text) from public, anon;
revoke all on function public.admin_decide_payment_proof(uuid, boolean, numeric, text) from public, anon;
grant execute on function public.billing_transfer_info() to authenticated;
grant execute on function public.admin_set_transfer_info(jsonb) to authenticated;
grant execute on function public.submit_payment_proof(uuid, int, numeric, text, text, text) to authenticated;
grant execute on function public.my_payment_proofs(uuid) to authenticated;
grant execute on function public.admin_payment_proofs(text) to authenticated;
grant execute on function public.admin_decide_payment_proof(uuid, boolean, numeric, text) to authenticated;
