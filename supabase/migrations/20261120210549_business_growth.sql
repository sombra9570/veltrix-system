create or replace function public.business_growth(p_org uuid, p_gran text default 'day', p_n integer default 14)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  g text := case when p_gran in ('day','week','month') then p_gran else 'day' end;
  n int := least(greatest(coalesce(p_n, 14), 2), 60);
  tz text; today date; step interval; first_d date; res jsonb;
begin
  if not (is_org_owner(p_org) or is_platform_admin()) then return '[]'::jsonb; end if;
  select coalesce(min(b.timezone), 'UTC') into tz from branches b where b.org_id = p_org and b.deleted_at is null;
  today := (now() at time zone tz)::date;
  step := case g when 'day' then interval '1 day' when 'week' then interval '1 week' else interval '1 month' end;
  first_d := (date_trunc(g, today::timestamp) - (n - 1) * step)::date;
  with ev as (
    select 'sales' k, o.currency cur, (coalesce(o.confirmed_at, o.created_at) at time zone coalesce(b.timezone, tz))::date d, o.total_amount v
      from orders o left join branches b on b.id = o.branch_id
     where o.org_id = p_org and o.status = 'confirmed' and o.deleted_at is null and o.order_type <> 'loan'
    union all
    select 'orders', o.currency, (coalesce(o.confirmed_at, o.created_at) at time zone coalesce(b.timezone, tz))::date, 1
      from orders o left join branches b on b.id = o.branch_id
     where o.org_id = p_org and o.status = 'confirmed' and o.deleted_at is null and o.order_type <> 'loan'
    union all
    select 'collected', p.currency, (p.collected_at at time zone coalesce(b.timezone, tz))::date, p.amount
      from payments p left join branches b on b.id = p.branch_id where p.org_id = p_org
    union all
    select 'expenses', m.currency, (m.created_at at time zone coalesce(b.timezone, tz))::date, m.amount
      from cash_movements m left join branches b on b.id = m.branch_id where m.org_id = p_org and m.type = 'expense'
    union all
    select 'lent', m.currency, (m.created_at at time zone coalesce(b.timezone, tz))::date,
           case m.type when 'loan_disbursement' then m.amount else -m.amount end
      from cash_movements m left join branches b on b.id = m.branch_id where m.org_id = p_org and m.type in ('loan_disbursement','loan_return')
  ), cur as (select distinct cur from ev where cur is not null and d >= first_d),
  bk as (select (first_d + (i * step))::date as s from generate_series(0, n - 1) i),
  agg as (
    select cur, (date_trunc(g, d::timestamp))::date s, k, sum(v) v from ev where d >= first_d and cur is not null group by 1, 2, 3
  )
  select coalesce(jsonb_agg(jsonb_build_object('currency', c.cur, 'rows', (
    select jsonb_agg(jsonb_build_object('d', bk.s,
      'sales', coalesce((select v from agg a where a.cur = c.cur and a.s = bk.s and a.k = 'sales'), 0),
      'orders', coalesce((select v from agg a where a.cur = c.cur and a.s = bk.s and a.k = 'orders'), 0),
      'collected', coalesce((select v from agg a where a.cur = c.cur and a.s = bk.s and a.k = 'collected'), 0),
      'expenses', coalesce((select v from agg a where a.cur = c.cur and a.s = bk.s and a.k = 'expenses'), 0),
      'lent', coalesce((select v from agg a where a.cur = c.cur and a.s = bk.s and a.k = 'lent'), 0)) order by bk.s) from bk)
  ) order by c.cur), '[]'::jsonb) into res from cur c;
  return res;
end $$;
revoke all on function public.business_growth(uuid, text, integer) from public, anon;
grant execute on function public.business_growth(uuid, text, integer) to authenticated;
