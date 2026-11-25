create or replace function branch_reader(p_branch uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_branch_manager(p_branch) or has_branch_role(p_branch, '{accountant,director,secretary}');
$$;

create or replace function my_org_role_in(p_org uuid, p_roles app_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships m where m.user_id = auth.uid() and m.org_id = p_org
    and m.is_active and m.deleted_at is null and m.role = any(p_roles));
$$;
revoke all on function my_org_role_in(uuid, app_role[]) from public, anon;
grant execute on function my_org_role_in(uuid, app_role[]) to authenticated;

create or replace function role_plan_ok(p_org uuid, p_roles app_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select not (coalesce(p_roles,'{}') && array['director','secretary']::app_role[])
      or exists (select 1 from organizations o join plans p on p.id = o.plan_id where o.id = p_org and p.code in ('pro','enterprise','enterprise_plus'));
$$;
revoke all on function role_plan_ok(uuid, app_role[]) from public, anon, authenticated;

create or replace function enforce_plan_roles() returns trigger
language plpgsql security definer set search_path = public as $$
declare lim int; tot int; used int; ex app_role[];
begin
  if new.role = 'owner' or new.deleted_at is not null then return new; end if;
  select p.max_roles, p.max_total_roles into lim, tot from organizations o join plans p on p.id = o.plan_id where o.id = new.org_id;
  select coalesce(array_agg(x), '{}') into ex from (select new.role x union select unnest(cr.also_roles) from custom_roles cr where cr.id = new.custom_role_id and cr.deleted_at is null) q;
  if not role_plan_ok(new.org_id, ex) then raise exception 'ROLE_NOT_IN_PLAN'; end if;
  if not role_module_ok(new.org_id, ex) then raise exception 'ROLE_NOT_IN_NICHE'; end if;
  used := org_roles_used(new.org_id, new.id, ex, '{}');
  if lim is not null and used > lim then raise exception 'PLAN_ROLES_LIMIT:%', lim; end if;
  if tot is not null and org_roles_used(new.org_id, new.id, ex, null) + 1 > tot then raise exception 'PLAN_TOTAL_ROLES_LIMIT:%', tot; end if;
  return new;
end $$;

create or replace function custom_role_guard() returns trigger
language plpgsql as $$
begin
  if new.base_role in ('director','secretary') or coalesce(new.also_roles,'{}') && array['director','secretary']::app_role[] then
    raise exception 'ROLE_NOT_COMBINABLE';
  end if;
  return new;
end $$;
drop trigger if exists trg_custom_role_guard on custom_roles;
create trigger trg_custom_role_guard before insert or update on custom_roles for each row execute function custom_role_guard();

create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  kind text not null default 'free' check (kind in ('approvals','period','minutes','free')),
  title text not null check (length(btrim(title)) between 1 and 160),
  body text not null default '' check (length(body) <= 20000),
  data jsonb not null default '{}'::jsonb,
  period_from date, period_to date,
  target text not null default 'admin' check (target in ('admin','board')),
  status text not null default 'draft' check (status in ('draft','submitted','approved','observed')),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  reviewed_by uuid, reviewed_at timestamptz, review_note text
);
create index if not exists reports_org_idx on reports(org_id, created_at desc);
alter table reports enable row level security;
revoke all on reports from anon, authenticated;

create or replace function report_save(p_org uuid, p_id uuid, p_kind text, p_title text, p_body text, p_from date, p_to date, p_target text, p_data jsonb, p_submit boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare v uuid; r reports%rowtype;
begin
  if not (is_org_owner(p_org) or my_org_role_in(p_org, '{secretary}')) then raise exception 'PERM_DENIED'; end if;
  if p_id is null then
    insert into reports(org_id, kind, title, body, data, period_from, period_to, target, status, submitted_at)
    values (p_org, p_kind, btrim(p_title), coalesce(p_body,''), coalesce(p_data,'{}'), p_from, p_to, p_target,
            case when p_submit then 'submitted' else 'draft' end, case when p_submit then now() end) returning id into v;
  else
    select * into r from reports where id = p_id and org_id = p_org;
    if not found then raise exception 'Informe no encontrado'; end if;
    if r.status in ('submitted','approved') then raise exception 'REPORT_LOCKED'; end if;
    if r.created_by <> auth.uid() and not is_org_owner(p_org) then raise exception 'PERM_DENIED'; end if;
    update reports set kind = p_kind, title = btrim(p_title), body = coalesce(p_body,''), data = coalesce(p_data,'{}'),
           period_from = p_from, period_to = p_to, target = p_target,
           status = case when p_submit then 'submitted' else 'draft' end,
           submitted_at = case when p_submit then now() else submitted_at end,
           review_note = case when p_submit then null else review_note end
     where id = p_id returning id into v;
  end if;
  insert into audit_log(org_id, table_name, row_id, action, actor_id, new_data)
    values (p_org, 'reports', v, case when p_id is null then 'create' else 'update' end, auth.uid(),
            jsonb_build_object('title', btrim(p_title), 'target', p_target, 'submit', p_submit));
  return v;
end $$;
grant execute on function report_save(uuid,uuid,text,text,text,date,date,text,jsonb,boolean) to authenticated;

create or replace function reports_list(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v jsonb; owner_ boolean := is_org_owner(p_org);
begin
  if not (owner_ or my_org_role_in(p_org, '{secretary,director}')) then raise exception 'PERM_DENIED'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'kind', r.kind, 'title', r.title, 'body', r.body, 'data', r.data,
           'from', r.period_from, 'to', r.period_to, 'target', r.target, 'status', r.status, 'created_at', r.created_at,
           'submitted_at', r.submitted_at, 'reviewed_at', r.reviewed_at, 'note', r.review_note,
           'author', (select full_name from profiles where id = r.created_by),
           'mine', r.created_by = auth.uid()) order by r.created_at desc), '[]'::jsonb) into v
    from reports r where r.org_id = p_org and (
      (owner_ and r.status <> 'draft')
      or r.created_by = auth.uid()
      or (my_org_role_in(p_org, '{director}') and r.target = 'board' and r.status <> 'draft'));
  return v;
end $$;
grant execute on function reports_list(uuid) to authenticated;

create or replace function report_review(p_id uuid, p_approve boolean, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare r reports%rowtype;
begin
  select * into r from reports where id = p_id;
  if not found then raise exception 'Informe no encontrado'; end if;
  if not (is_org_owner(r.org_id) or (r.target = 'board' and my_org_role_in(r.org_id, '{director}'))) then raise exception 'PERM_DENIED'; end if;
  if r.status <> 'submitted' then raise exception 'REPORT_NOT_PENDING'; end if;
  update reports set status = case when p_approve then 'approved' else 'observed' end, reviewed_by = auth.uid(), reviewed_at = now(), review_note = nullif(btrim(coalesce(p_note,'')),'')
   where id = p_id;
  insert into audit_log(org_id, table_name, row_id, action, actor_id, new_data)
    values (r.org_id, 'reports', p_id, 'review', auth.uid(), jsonb_build_object('approve', p_approve));
end $$;
grant execute on function report_review(uuid,boolean,text) to authenticated;

create or replace function approvals_summary(p_org uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not (is_org_owner(p_org) or my_org_role_in(p_org, '{secretary,director}')) then raise exception 'PERM_DENIED'; end if;
  return jsonb_build_object(
    'by_status', coalesce((select jsonb_agg(jsonb_build_object('status', s, 'n', n, 'amount', a)) from (
        select status s, count(*) n, coalesce(sum(amount),0) a from approval_requests
         where org_id = p_org and requested_at::date between p_from and p_to group by status) x), '[]'::jsonb),
    'by_kind', coalesce((select jsonb_agg(jsonb_build_object('kind', k, 'n', n, 'amount', a)) from (
        select kind k, count(*) n, coalesce(sum(amount),0) a from approval_requests
         where org_id = p_org and requested_at::date between p_from and p_to group by kind) y), '[]'::jsonb),
    'items', coalesce((select jsonb_agg(jsonb_build_object('kind', a.kind, 'amount', a.amount, 'reason', a.reason, 'status', a.status,
                'at', a.requested_at, 'by', pr.full_name, 'branch', b.name, 'note', a.decision_note) order by a.requested_at desc)
        from (select * from approval_requests where org_id = p_org and requested_at::date between p_from and p_to order by requested_at desc limit 200) a
        join branches b on b.id = a.branch_id left join profiles pr on pr.id = a.requested_by), '[]'::jsonb));
end $$;
grant execute on function approvals_summary(uuid,date,date) to authenticated;
