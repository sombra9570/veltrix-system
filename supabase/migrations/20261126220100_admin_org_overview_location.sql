create or replace function public.admin_org_overview()
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v jsonb;
begin
  if not is_platform_admin() then raise exception 'Solo el superadmin'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'org_id', o.id,
    'signup_country', o.signup_country,
    'signup_city', o.signup_city,
    'companies', coalesce((select jsonb_agg(jsonb_build_object(
        'name', c.legal_name, 'type', c.business_type, 'cats', coalesce(c.business_categories,'{}'),
        'branches', coalesce((select jsonb_agg(b.name order by b.created_at) from branches b where b.company_id=c.id and b.deleted_at is null),'[]'::jsonb))
        order by c.created_at) from companies c where c.org_id=o.id and c.deleted_at is null),'[]'::jsonb),
    'modules', coalesce((select jsonb_agg(m.module order by m.module) from org_modules m where m.org_id=o.id and m.enabled),'[]'::jsonb),
    'roles', coalesce((select jsonb_object_agg(r.role, r.n) from (select mm.role::text role, count(distinct mm.user_id) n from memberships mm where mm.org_id=o.id and mm.deleted_at is null and coalesce(mm.is_active,true) group by mm.role) r),'{}'::jsonb),
    'users', (select count(distinct mm.user_id) from memberships mm where mm.org_id=o.id and mm.deleted_at is null and coalesce(mm.is_active,true)),
    'limits', (select jsonb_build_object('companies',p.max_companies,'branches',p.max_branches,'users',p.max_users) from plans p where p.id=o.plan_id)
  ) order by o.created_at desc),'[]'::jsonb) into v
  from organizations o where o.deleted_at is null;
  return v;
end $$;
revoke all on function public.admin_org_overview() from public, anon;
grant execute on function public.admin_org_overview() to authenticated;
