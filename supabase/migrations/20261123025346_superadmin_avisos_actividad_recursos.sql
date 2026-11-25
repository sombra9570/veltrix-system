create table if not exists public.platform_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(title) between 1 and 120),
  body text not null check (length(body) between 1 and 1000),
  org_id uuid references public.organizations(id) on delete cascade,
  created_by uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create table if not exists public.announcement_reads (
  announcement_id uuid not null references public.platform_announcements(id) on delete cascade,
  user_id uuid not null,
  read_at timestamptz not null default now(),
  primary key (announcement_id, user_id)
);
alter table public.platform_announcements enable row level security;
alter table public.announcement_reads enable row level security;

create or replace function public.admin_announce(p_title text, p_body text, p_org uuid, p_days int)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v uuid;
begin
  if not is_platform_admin() then raise exception 'Solo el superadmin'; end if;
  insert into platform_announcements(title, body, org_id, created_by, expires_at)
  values (btrim(p_title), btrim(p_body), p_org, auth.uid(), now() + make_interval(days => greatest(1, least(coalesce(p_days,7), 90))))
  returning id into v;
  return v;
end $$;

create or replace function public.admin_announcements()
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not is_platform_admin() then raise exception 'Solo el superadmin'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id', a.id, 'title', a.title, 'body', a.body, 'org_id', a.org_id, 'org_name', o.name,
    'created_at', a.created_at, 'expires_at', a.expires_at, 'active', a.expires_at > now(),
    'reads', (select count(*) from announcement_reads r where r.announcement_id = a.id)) order by a.created_at desc)
    from platform_announcements a left join organizations o on o.id = a.org_id), '[]'::jsonb);
end $$;

create or replace function public.admin_announcement_delete(p_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not is_platform_admin() then raise exception 'Solo el superadmin'; end if;
  delete from platform_announcements where id = p_id;
end $$;

create or replace function public.my_announcements()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'title', a.title, 'body', a.body, 'created_at', a.created_at) order by a.created_at desc), '[]'::jsonb)
    from platform_announcements a
   where a.expires_at > now()
     and (a.org_id is null or a.org_id = (select org_id from profiles where id = auth.uid()))
     and not exists (select 1 from announcement_reads r where r.announcement_id = a.id and r.user_id = auth.uid());
$$;

create or replace function public.announcement_dismiss(p_id uuid)
returns void language sql security definer set search_path to 'public' as $$
  insert into announcement_reads(announcement_id, user_id) values (p_id, auth.uid()) on conflict do nothing;
$$;

-- Actividad de la plataforma: solo cambios de estructura (nunca ventas, clientes ni datos de negocio)
create or replace function public.admin_activity(p_limit int default 80)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not is_platform_admin() then raise exception 'Solo el superadmin'; end if;
  return coalesce((select jsonb_agg(x order by (x->>'at') desc) from (
    select jsonb_build_object(
      'at', l.created_at, 'org', o.name, 'table', l.table_name, 'action', l.action,
      'actor', coalesce(p.full_name, 'Sistema'),
      'changed', case when l.action = 'UPDATE' then coalesce((
          select jsonb_agg(k) from jsonb_object_keys(coalesce(l.new_data,'{}'::jsonb)) k
           where k not in ('updated_at','updated_by') and (l.old_data -> k) is distinct from (l.new_data -> k)), '[]'::jsonb) else '[]'::jsonb end,
      'what', coalesce(l.new_data->>'name', l.new_data->>'legal_name', l.new_data->>'module', l.old_data->>'name', l.old_data->>'legal_name')
    ) x
      from audit_log l
      left join organizations o on o.id = l.org_id
      left join profiles p on p.id = l.actor_id
     where l.table_name in ('organizations','companies','branches','memberships','org_modules')
        or l.action in ('set_role','add_team_role')
     order by l.created_at desc
     limit greatest(1, least(coalesce(p_limit,80), 300))) s), '[]'::jsonb);
end $$;

-- Uso de recursos por organización frente a su plan
create or replace function public.admin_org_usage()
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not is_platform_admin() then raise exception 'Solo el superadmin'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'org_id', o.id, 'name', o.name, 'plan', p.name,
      'users', l.used_users, 'max_users', l.max_users,
      'branches', l.used_branches, 'max_branches', l.max_branches,
      'companies', l.used_companies, 'max_companies', l.max_companies,
      'storage_mb', round(coalesce((select sum((so.metadata->>'size')::numeric) from storage.objects so where (storage.foldername(so.name))[1] = o.id::text),0) / 1048576.0, 2),
      'max_storage_mb', l.max_storage_mb,
      'ai_used', ai_used_this_month(o.id), 'ai_quota', o.ai_monthly_quota) order by o.name)
    from organizations o join plans p on p.id = o.plan_id
    cross join lateral org_limits(o.id) l
   where o.deleted_at is null), '[]'::jsonb);
end $$;

revoke all on function public.admin_announce(text,text,uuid,int), public.admin_announcements(), public.admin_announcement_delete(uuid), public.admin_activity(int), public.admin_org_usage(), public.my_announcements(), public.announcement_dismiss(uuid) from public, anon;
grant execute on function public.admin_announce(text,text,uuid,int), public.admin_announcements(), public.admin_announcement_delete(uuid), public.admin_activity(int), public.admin_org_usage(), public.my_announcements(), public.announcement_dismiss(uuid) to authenticated;
