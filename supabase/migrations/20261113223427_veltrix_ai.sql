alter table organizations add column if not exists ai_monthly_quota int not null default 0 check (ai_monthly_quota >= 0);

create or replace function guard_org_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not is_platform_admin() and
     (new.subscription_status, new.plan_id, new.next_billing_date, new.grace_ends_at,
      new.payment_method_token, new.trial_ends_at,
      new.extra_branches, new.extra_users, new.extra_storage_mb, new.ai_monthly_quota)
     is distinct from
     (old.subscription_status, old.plan_id, old.next_billing_date, old.grace_ends_at,
      old.payment_method_token, old.trial_ends_at,
      old.extra_branches, old.extra_users, old.extra_storage_mb, old.ai_monthly_quota) then
    raise exception 'Los datos de suscripción solo los cambia la pasarela de pago';
  end if;
  return new;
end $$;

create table if not exists ai_usage (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id),
  user_id     uuid not null references profiles(id),
  tokens_in   int not null default 0,
  tokens_out  int not null default 0,
  status      text not null default 'started' check (status in ('started','done','failed')),
  created_at  timestamptz not null default now()
);
create index if not exists ai_usage_org_month on ai_usage(org_id, created_at);
alter table ai_usage enable row level security;
revoke all on ai_usage from anon, authenticated;

create or replace function ai_can_use(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_org_owner(p_org) or exists (
    select 1 from memberships m where m.user_id = auth.uid() and m.org_id = p_org
       and m.role = 'supervisor' and m.is_active and m.deleted_at is null);
$$;

create or replace function ai_used_this_month(p_org uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from ai_usage
   where org_id = p_org and status <> 'failed' and created_at >= date_trunc('month', now());
$$;

create or replace function ai_quota_status() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_org uuid := (select org_id from profiles where id = auth.uid()); v_q int;
begin
  if v_org is null or not ai_can_use(v_org) then return jsonb_build_object('allowed', false); end if;
  select ai_monthly_quota into v_q from organizations where id = v_org;
  return jsonb_build_object('allowed', true, 'quota', v_q, 'used', ai_used_this_month(v_org),
                            'resets', (date_trunc('month', now()) + interval '1 month')::date);
end $$;

create or replace function ai_business_snapshot(p_org uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'empresa', (select name from organizations where id = p_org),
    'fecha_hoy', (now() at time zone coalesce((select timezone from branches where org_id = p_org and deleted_at is null order by created_at limit 1), 'UTC'))::date,
    'sucursales', (select coalesce(jsonb_agg(jsonb_build_object('nombre', b.name, 'empresa', c.legal_name, 'moneda', c.base_currency)), '[]')
                     from branches b join companies c on c.id = b.company_id
                    where b.org_id = p_org and b.deleted_at is null and b.is_active),
    'cobros', (select coalesce(jsonb_agg(jsonb_build_object('moneda', x.currency, 'hoy', x.d1, 'ultimos_7_dias', x.d7, 'ultimos_30_dias', x.d30)), '[]')
                 from (select currency,
                              sum(amount) filter (where collected_at >= date_trunc('day', now())) d1,
                              sum(amount) filter (where collected_at >= now() - interval '7 days') d7,
                              sum(amount) d30
                         from payments where org_id = p_org and collected_at >= now() - interval '30 days'
                        group by currency) x),
    'ventas_por_dia_14d', (select coalesce(jsonb_agg(jsonb_build_object('dia', d, 'moneda', currency, 'total', t, 'pedidos', n) order by d), '[]')
                             from (select (confirmed_at)::date d, currency, sum(total_amount) t, count(*) n
                                     from orders where org_id = p_org and status = 'confirmed' and confirmed_at >= now() - interval '14 days'
                                    group by 1, 2) v),
    'productos_mas_vendidos_30d', (select coalesce(jsonb_agg(jsonb_build_object('producto', description, 'cantidad', q, 'importe', t) order by t desc), '[]')
                                     from (select oi.description, sum(oi.qty) q, sum(oi.line_total) t
                                             from order_items oi join orders o on o.id = oi.order_id
                                            where o.org_id = p_org and o.status = 'confirmed' and o.confirmed_at >= now() - interval '30 days'
                                            group by oi.description order by t desc limit 10) p),
    'clientes_con_deuda_vencida', (select coalesce(jsonb_agg(jsonb_build_object('cliente', name, 'telefono', phone, 'vencido', overdue, 'saldo', balance) order by overdue desc), '[]')
                                     from (select c.name, c.phone, customer_overdue(c.id) overdue, customer_open_balance(c.id) balance
                                             from customers c where c.org_id = p_org and not c.is_walk_in and c.deleted_at is null) d
                                    where overdue > 0 limit 15),
    'deuda_total_clientes', (select coalesce(sum(customer_open_balance(c.id)), 0) from customers c where c.org_id = p_org and not c.is_walk_in and c.deleted_at is null),
    'stock_bajo', (select coalesce(jsonb_agg(jsonb_build_object('producto', p.name, 'cantidad', s.qty, 'sucursal', b.name)), '[]')
                     from stock_levels s join products p on p.id = s.product_id join branches b on b.id = s.branch_id
                    where s.org_id = p_org and p.track_stock and p.is_active and s.qty <= 3 limit 20),
    'pendientes', jsonb_build_object(
        'creditos_por_aprobar', (select count(*) from orders where org_id = p_org and status = 'confirmed' and approval_status = 'pending_supervisor'),
        'rendiciones_por_recibir', (select count(*) from route_settlements where org_id = p_org and status = 'pending_delivery'),
        'cajas_abiertas', (select count(*) from register_shifts where org_id = p_org and status = 'open'),
        'cierres_con_diferencia_7d', (select count(*) from register_shifts where org_id = p_org and status = 'discrepancy' and closed_at >= now() - interval '7 days')),
    'equipo', (select coalesce(jsonb_agg(jsonb_build_object('rol', role, 'cantidad', n)), '[]')
                 from (select role::text, count(distinct user_id) n from memberships
                        where org_id = p_org and is_active and deleted_at is null group by role) e)
  );
$$;

create or replace function ai_begin() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_org uuid := (select org_id from profiles where id = auth.uid()); v_q int; v_id uuid;
begin
  if v_org is null or not ai_can_use(v_org) then raise exception 'AI_NOT_ALLOWED'; end if;
  if not org_writable(v_org) then raise exception 'Cuenta suspendida: solo lectura'; end if;
  select ai_monthly_quota into v_q from organizations where id = v_org for update;
  if coalesce(v_q, 0) = 0 then raise exception 'AI_NOT_ENABLED'; end if;
  if ai_used_this_month(v_org) >= v_q then raise exception 'AI_QUOTA_EXCEEDED'; end if;
  insert into ai_usage (org_id, user_id) values (v_org, auth.uid()) returning id into v_id;
  return jsonb_build_object('usage_id', v_id, 'snapshot', ai_business_snapshot(v_org));
end $$;

create or replace function ai_finish(p_usage uuid, p_tokens_in int, p_tokens_out int, p_ok boolean) returns void
language sql security definer set search_path = public as $$
  update ai_usage set tokens_in = greatest(coalesce(p_tokens_in, 0), 0), tokens_out = greatest(coalesce(p_tokens_out, 0), 0),
         status = case when p_ok then 'done' else 'failed' end
   where id = p_usage and user_id = auth.uid() and status = 'started' and created_at > now() - interval '10 minutes';
$$;

create or replace function ai_admin_overview() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'Sin permiso'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
            'org_id', o.id, 'name', o.name, 'quota', o.ai_monthly_quota, 'used', ai_used_this_month(o.id),
            'tokens_in', (select coalesce(sum(tokens_in), 0) from ai_usage where org_id = o.id and created_at >= date_trunc('month', now())),
            'tokens_out', (select coalesce(sum(tokens_out), 0) from ai_usage where org_id = o.id and created_at >= date_trunc('month', now())))
          order by o.name), '[]'::jsonb) from organizations o);
end $$;

create or replace function ai_set_quota(p_org uuid, p_quota int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'Sin permiso'; end if;
  if p_quota is null or p_quota < 0 or p_quota > 100000 then raise exception 'Cupo inválido'; end if;
  update organizations set ai_monthly_quota = p_quota where id = p_org;
end $$;

revoke execute on function ai_can_use(uuid), ai_used_this_month(uuid), ai_quota_status(), ai_business_snapshot(uuid),
  ai_begin(), ai_finish(uuid, int, int, boolean), ai_admin_overview(), ai_set_quota(uuid, int) from public, anon;
revoke execute on function ai_business_snapshot(uuid), ai_used_this_month(uuid) from authenticated;
grant execute on function ai_can_use(uuid), ai_quota_status(), ai_begin(), ai_finish(uuid, int, int, boolean),
  ai_admin_overview(), ai_set_quota(uuid, int) to authenticated;
grant execute on function ai_can_use(uuid), ai_used_this_month(uuid), ai_quota_status(), ai_business_snapshot(uuid),
  ai_begin(), ai_finish(uuid, int, int, boolean), ai_admin_overview(), ai_set_quota(uuid, int) to service_role;
