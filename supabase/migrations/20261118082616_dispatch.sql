alter table public.branches add column if not exists dispatch_since timestamptz;

create table if not exists public.order_dispatches (
  order_id     uuid primary key references public.orders(id) on delete cascade,
  org_id       uuid not null,
  branch_id    uuid not null references public.branches(id),
  delivered_by uuid,
  delivered_at timestamptz not null default now(),
  note         text
);
create index if not exists order_dispatches_branch_idx on public.order_dispatches (branch_id, delivered_at desc);
alter table public.order_dispatches enable row level security;
drop policy if exists dispatch_read on public.order_dispatches;
create policy dispatch_read on public.order_dispatches for select
  using (org_reader(org_id) or is_branch_member(branch_id));

create or replace function public.dispatch_set(p_branch uuid, p_on boolean)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not is_branch_manager(p_branch) then raise exception 'PERM_DENIED'; end if;
  update branches set dispatch_since = case when p_on then coalesce(dispatch_since, now()) else null end, updated_at = now()
   where id = p_branch;
end $$;

create or replace function public.dispatch_queue(p_branch uuid, p_done boolean default false)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v_since timestamptz;
begin
  if not can_stock(p_branch) then raise exception 'PERM_DENIED'; end if;
  select dispatch_since into v_since from branches where id = p_branch;
  return jsonb_build_object(
    'enabled', v_since is not null,
    'manager', is_branch_manager(p_branch),
    'orders', case when v_since is null then '[]'::jsonb else coalesce((
      select jsonb_agg(x order by (x->>'at') desc) from (
        select jsonb_build_object(
          'id', o.id, 'at', coalesce(o.confirmed_at, o.created_at), 'total', o.total_amount, 'currency', o.currency,
          'customer', case when c.is_walk_in then null else c.name end, 'phone', case when c.is_walk_in then null else c.phone end,
          'vendor', (select coalesce(p.full_name, '') from profiles p where p.id = o.vendor_id),
          'notes', o.notes,
          'items', (select coalesce(jsonb_agg(jsonb_build_object('description', i.description, 'qty', i.qty) order by i.created_at), '[]'::jsonb)
                      from order_items i join products pr on pr.id = i.product_id
                     where i.order_id = o.id and pr.product_type in ('good', 'combo')),
          'delivered_at', d.delivered_at,
          'delivered_by', (select coalesce(p.full_name, '') from profiles p where p.id = d.delivered_by),
          'note', d.note) as x
          from orders o
          left join customers c on c.id = o.customer_id
          left join order_dispatches d on d.order_id = o.id
         where o.branch_id = p_branch and o.status = 'confirmed' and o.deleted_at is null
           and o.order_type in ('counter', 'takeaway')
           and o.approval_status in ('auto_approved', 'approved')
           and coalesce(o.confirmed_at, o.created_at) >= v_since
           and (d.order_id is not null) = p_done
           and exists (select 1 from order_items i join products pr on pr.id = i.product_id
                        where i.order_id = o.id and pr.product_type in ('good', 'combo'))
         order by coalesce(o.confirmed_at, o.created_at) desc
         limit case when p_done then 50 else 200 end) t), '[]'::jsonb) end);
end $$;

create or replace function public.dispatch_mark(p_order uuid, p_note text default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare o orders%rowtype; v_since timestamptz;
begin
  select * into o from orders where id = p_order;
  if not found or o.status <> 'confirmed' then raise exception 'DISPATCH_INVALID'; end if;
  if not can_stock(o.branch_id) then raise exception 'PERM_DENIED'; end if;
  select dispatch_since into v_since from branches where id = o.branch_id;
  if v_since is null then raise exception 'DISPATCH_OFF'; end if;
  insert into order_dispatches (order_id, org_id, branch_id, delivered_by, note)
  values (o.id, o.org_id, o.branch_id, auth.uid(), nullif(left(trim(coalesce(p_note, '')), 200), ''))
  on conflict (order_id) do nothing;
end $$;

revoke all on function public.dispatch_set(uuid, boolean) from public, anon;
revoke all on function public.dispatch_queue(uuid, boolean) from public, anon;
revoke all on function public.dispatch_mark(uuid, text) from public, anon;
grant execute on function public.dispatch_set(uuid, boolean) to authenticated;
grant execute on function public.dispatch_queue(uuid, boolean) to authenticated;
grant execute on function public.dispatch_mark(uuid, text) to authenticated;
