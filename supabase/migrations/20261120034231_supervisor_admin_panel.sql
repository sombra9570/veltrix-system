do $$
declare d text; n text;
begin
  select pg_get_functiondef('public.has_perm(text,uuid)'::regprocedure) into d;
  n := replace(d, '    when is_branch_manager(p_branch) and p_key not like ''routes.%'' then true',
'    when exists (select 1 from memberships m where m.user_id = auth.uid() and m.branch_id = p_branch and m.role = ''supervisor'' and m.is_active and m.deleted_at is null and m.permissions ? p_key)
      then (select bool_or((m.permissions->>p_key)::boolean) from memberships m where m.user_id = auth.uid() and m.branch_id = p_branch and m.role = ''supervisor'' and m.is_active and m.deleted_at is null and m.permissions ? p_key)
    when is_branch_manager(p_branch) and p_key not like ''routes.%'' then true');
  if n = d then raise exception 'has_perm sin cambios'; end if;
  execute n;
end $$;

create or replace function public.owner_supervisors(p_org uuid)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select case when is_org_owner(p_org) or is_platform_admin() then coalesce((
    select jsonb_agg(jsonb_build_object('membership_id', m.id, 'user_id', m.user_id, 'name', coalesce(p.full_name, '—'),
      'branch_id', m.branch_id, 'permissions', m.permissions,
      'routes', coalesce((select jsonb_agg(r.id) from collection_routes r where r.supervisor_id = m.user_id and r.org_id = p_org and r.deleted_at is null), '[]'::jsonb))
      order by p.full_name)
      from memberships m left join profiles p on p.id = m.user_id
     where m.org_id = p_org and m.role = 'supervisor' and m.is_active and m.deleted_at is null), '[]'::jsonb) else '[]'::jsonb end;
$$;

create or replace function public.supervisor_set_permission(p_membership uuid, p_key text, p_value boolean)
returns void language plpgsql security definer set search_path to 'public' as $$
declare m memberships%rowtype;
begin
  select * into m from memberships where id = p_membership and role = 'supervisor' and deleted_at is null;
  if not found or not is_org_owner(m.org_id) then raise exception 'PERM_DENIED'; end if;
  if not (p_key = any(array['loans.customers','payments.record_installment','collector.delete_installments','loans.create','collector.delete_credits',
                            'payments.record_partial','collector.delete_customers','loans.interest','routes.liquidate','collector.expenses',
                            'collector.delete_expenses','routes.invest'])) then raise exception 'Permiso inexistente'; end if;
  update memberships set permissions = case when p_value is null then permissions - p_key else permissions || jsonb_build_object(p_key, p_value) end,
         updated_at = now() where id = p_membership;
end $$;

create or replace function public.supervisor_set_routes(p_membership uuid, p_routes uuid[])
returns void language plpgsql security definer set search_path to 'public' as $$
declare m memberships%rowtype;
begin
  select * into m from memberships where id = p_membership and role = 'supervisor' and deleted_at is null;
  if not found or not is_org_owner(m.org_id) then raise exception 'PERM_DENIED'; end if;
  update collection_routes set supervisor_id = null, updated_at = now()
   where org_id = m.org_id and supervisor_id = m.user_id and not (id = any(coalesce(p_routes, '{}')));
  update collection_routes set supervisor_id = m.user_id, updated_at = now()
   where org_id = m.org_id and id = any(coalesce(p_routes, '{}')) and deleted_at is null;
end $$;

create or replace function public.supervisor_reports_admin(p_org uuid)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select case when is_org_owner(p_org) or is_platform_admin() then coalesce((
    select jsonb_agg(jsonb_build_object('id', n.id, 'route', r.name, 'at', n.created_at, 'body', n.body, 'author_id', n.created_by,
      'author', (select full_name from profiles where id = n.created_by)) order by n.created_at desc)
      from (select * from route_notices where org_id = p_org and kind = 'report' order by created_at desc limit 100) n
      join collection_routes r on r.id = n.route_id), '[]'::jsonb) else '[]'::jsonb end;
$$;
