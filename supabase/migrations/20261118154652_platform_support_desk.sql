create table if not exists platform_staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  func text not null default 'support' check (func in ('support','technical','billing','sales')),
  can_reply boolean not null default true,
  can_assign boolean not null default false,
  can_see_orgs boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table platform_staff enable row level security;
revoke all on platform_staff from anon, authenticated;

create or replace function is_platform_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select is_platform_admin() or exists (select 1 from platform_staff s where s.user_id = auth.uid() and s.is_active);
$$;
create or replace function staff_can(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select is_platform_admin() or exists (select 1 from platform_staff s where s.user_id = auth.uid() and s.is_active
    and case p when 'reply' then s.can_reply when 'assign' then s.can_assign when 'orgs' then s.can_see_orgs else false end);
$$;
revoke all on function is_platform_staff(), staff_can(text) from public, anon;
grant execute on function is_platform_staff(), staff_can(text) to authenticated;

create table if not exists support_tickets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  opened_by uuid not null default auth.uid(),
  subject text not null check (length(btrim(subject)) between 1 and 160),
  status text not null default 'open' check (status in ('open','answered','closed')),
  priority text not null default 'normal' check (priority in ('low','normal','high')),
  assigned_to uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);
create index if not exists support_tickets_idx on support_tickets(status, updated_at desc);
create index if not exists support_tickets_org_idx on support_tickets(org_id, updated_at desc);
create table if not exists support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references support_tickets(id) on delete cascade,
  sender_id uuid not null default auth.uid(),
  sender_kind text not null check (sender_kind in ('customer','staff')),
  body text not null check (length(btrim(body)) between 1 and 4000),
  internal boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists support_messages_idx on support_messages(ticket_id, created_at);
create table if not exists platform_messages (
  id uuid primary key default gen_random_uuid(),
  from_id uuid not null default auth.uid(),
  to_id uuid not null,
  body text not null check (length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists platform_messages_idx on platform_messages(from_id, to_id, created_at desc);
alter table support_tickets enable row level security;
alter table support_messages enable row level security;
alter table platform_messages enable row level security;
revoke all on support_tickets, support_messages, platform_messages from anon, authenticated;

create or replace function support_open(p_org uuid, p_subject text, p_body text, p_priority text default 'normal') returns uuid
language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if not is_org_owner(p_org) then raise exception 'PERM_DENIED'; end if;
  if (select count(*) from support_tickets where org_id = p_org and status <> 'closed') >= 10 then raise exception 'TICKETS_LIMIT'; end if;
  insert into support_tickets(org_id, subject, priority) values (p_org, btrim(p_subject), coalesce(nullif(p_priority,''),'normal')) returning id into v;
  insert into support_messages(ticket_id, sender_kind, body) values (v, 'customer', btrim(p_body));
  return v;
end $$;

create or replace function support_my_tickets(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_org_owner(p_org) then raise exception 'PERM_DENIED'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'subject', t.subject, 'status', t.status, 'updated_at', t.updated_at,
      'last', (select left(m.body, 120) from support_messages m where m.ticket_id = t.id and not m.internal order by m.created_at desc limit 1)) order by t.updated_at desc)
    from support_tickets t where t.org_id = p_org), '[]'::jsonb);
end $$;

create or replace function support_thread(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t support_tickets%rowtype; staff boolean := is_platform_staff(); see boolean := staff_can('orgs');
begin
  select * into t from support_tickets where id = p_id;
  if not found then raise exception 'Ticket no encontrado'; end if;
  if not (staff or is_org_owner(t.org_id)) then raise exception 'PERM_DENIED'; end if;
  return jsonb_build_object(
    'ticket', jsonb_build_object('id', t.id, 'subject', t.subject, 'status', t.status, 'priority', t.priority, 'created_at', t.created_at,
        'assigned_to', t.assigned_to, 'assigned_name', (select full_name from profiles where id = t.assigned_to),
        'org', case when staff and see then (select o.name from organizations o where o.id = t.org_id) end,
        'plan', case when staff and see then (select p.name from organizations o join plans p on p.id = o.plan_id where o.id = t.org_id) end,
        'opener', (select full_name from profiles where id = t.opened_by)),
    'messages', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'kind', m.sender_kind, 'body', m.body, 'internal', m.internal,
        'at', m.created_at, 'by', (select full_name from profiles where id = m.sender_id)) order by m.created_at)
        from support_messages m where m.ticket_id = t.id and (staff or not m.internal)), '[]'::jsonb));
end $$;

create or replace function support_reply(p_id uuid, p_body text, p_internal boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare t support_tickets%rowtype;
begin
  select * into t from support_tickets where id = p_id;
  if not found then raise exception 'Ticket no encontrado'; end if;
  if is_platform_staff() then
    if not staff_can('reply') then raise exception 'PERM_DENIED'; end if;
    insert into support_messages(ticket_id, sender_kind, body, internal) values (p_id, 'staff', btrim(p_body), coalesce(p_internal,false));
    if not coalesce(p_internal,false) then update support_tickets set status = 'answered', updated_at = now(), closed_at = null where id = p_id; end if;
  elsif is_org_owner(t.org_id) then
    insert into support_messages(ticket_id, sender_kind, body, internal) values (p_id, 'customer', btrim(p_body), false);
    update support_tickets set status = 'open', updated_at = now(), closed_at = null where id = p_id;
  else raise exception 'PERM_DENIED'; end if;
end $$;

create or replace function support_inbox(p_status text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare see boolean := staff_can('orgs');
begin
  if not is_platform_staff() then raise exception 'PERM_DENIED'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'subject', t.subject, 'status', t.status, 'priority', t.priority,
      'updated_at', t.updated_at, 'assigned_to', t.assigned_to, 'assigned_name', (select full_name from profiles where id = t.assigned_to),
      'org', case when see then o.name end, 'plan', case when see then p.name end, 'mine', t.assigned_to = auth.uid()) order by (t.status = 'closed'), t.updated_at desc)
    from support_tickets t join organizations o on o.id = t.org_id join plans p on p.id = o.plan_id
   where p_status is null or t.status = p_status), '[]'::jsonb);
end $$;

create or replace function support_set(p_id uuid, p_status text default null, p_assign uuid default null, p_unassign boolean default false) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_staff() then raise exception 'PERM_DENIED'; end if;
  if p_status is not null then
    if not staff_can('reply') then raise exception 'PERM_DENIED'; end if;
    if p_status not in ('open','answered','closed') then raise exception 'Estado inválido'; end if;
    update support_tickets set status = p_status, updated_at = now(), closed_at = case when p_status = 'closed' then now() end where id = p_id;
  end if;
  if p_assign is not null or p_unassign then
    if not staff_can('assign') then raise exception 'PERM_DENIED'; end if;
    update support_tickets set assigned_to = case when p_unassign then null else p_assign end, updated_at = now() where id = p_id;
  end if;
end $$;

create or replace function staff_list() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'PERM_DENIED'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('user_id', s.user_id, 'name', p.full_name, 'email', p.email, 'func', s.func,
      'can_reply', s.can_reply, 'can_assign', s.can_assign, 'can_see_orgs', s.can_see_orgs, 'is_active', s.is_active) order by p.full_name)
    from platform_staff s left join profiles p on p.id = s.user_id), '[]'::jsonb);
end $$;

create or replace function staff_update(p_user uuid, p_func text, p_reply boolean, p_assign boolean, p_orgs boolean, p_active boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'PERM_DENIED'; end if;
  update platform_staff set func = p_func, can_reply = p_reply, can_assign = p_assign, can_see_orgs = p_orgs, is_active = p_active where user_id = p_user;
  update profiles set is_active = p_active where id = p_user;
end $$;

create or replace function platform_chat_contacts() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_platform_staff() then raise exception 'PERM_DENIED'; end if;
  if is_platform_admin() then
    return coalesce((select jsonb_agg(jsonb_build_object('id', s.user_id, 'name', p.full_name, 'func', s.func,
        'unread', (select count(*) from platform_messages m where m.from_id = s.user_id and m.to_id = auth.uid() and m.created_at > coalesce((select max(created_at) from platform_messages x where x.from_id = auth.uid() and x.to_id = s.user_id), 'epoch')))
        order by p.full_name) from platform_staff s join profiles p on p.id = s.user_id where s.is_active), '[]'::jsonb);
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', a.user_id, 'name', coalesce(p.full_name, 'Veltrix'), 'func', 'admin', 'unread', 0)) from platform_admins a left join profiles p on p.id = a.user_id), '[]'::jsonb);
end $$;

create or replace function platform_chat_list(p_with uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_platform_staff() then raise exception 'PERM_DENIED'; end if;
  if not ((is_platform_admin() and exists (select 1 from platform_staff where user_id = p_with))
       or (not is_platform_admin() and exists (select 1 from platform_admins where user_id = p_with))) then raise exception 'PERM_DENIED'; end if;
  return coalesce((select jsonb_agg(x order by x->>'at') from (
    select jsonb_build_object('id', m.id, 'mine', m.from_id = auth.uid(), 'body', m.body, 'at', m.created_at) x
      from platform_messages m
     where (m.from_id = auth.uid() and m.to_id = p_with) or (m.from_id = p_with and m.to_id = auth.uid())
     order by m.created_at desc limit 100) q), '[]'::jsonb);
end $$;

create or replace function platform_chat_send(p_to uuid, p_body text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_staff() then raise exception 'PERM_DENIED'; end if;
  if not ((is_platform_admin() and exists (select 1 from platform_staff where user_id = p_to))
       or (not is_platform_admin() and exists (select 1 from platform_admins where user_id = p_to))) then raise exception 'PERM_DENIED'; end if;
  insert into platform_messages(to_id, body) values (p_to, btrim(p_body));
end $$;

grant execute on function support_open(uuid,text,text,text), support_my_tickets(uuid), support_thread(uuid), support_reply(uuid,text,boolean),
  support_inbox(text), support_set(uuid,text,uuid,boolean), staff_list(), staff_update(uuid,text,boolean,boolean,boolean,boolean),
  platform_chat_contacts(), platform_chat_list(uuid), platform_chat_send(uuid,text) to authenticated;
