-- =====================================================================
-- Veltrix · Mensajería del equipo
--   Avisos (toda la empresa, escriben dueño/supervisores) · canal por sucursal · directos
--   Texto + fotos comprimidas (bucket privado). Mensajes en vivo (Realtime con RLS).
--   Se borran solos según el plan (chat_retention_days).
-- =====================================================================

alter table plans add column if not exists chat_retention_days int;
update plans set chat_retention_days = 30  where code = 'starter';
update plans set chat_retention_days = 90  where code = 'pro';
update plans set chat_retention_days = 365 where code = 'enterprise';

create table if not exists chat_channels (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id),
  kind        text not null check (kind in ('announce','branch','direct')),
  branch_id   uuid references branches(id),
  created_at  timestamptz not null default now(),
  check ((kind = 'branch') = (branch_id is not null))
);
create unique index if not exists one_announce_per_org on chat_channels(org_id) where kind = 'announce';
create unique index if not exists one_channel_per_branch on chat_channels(branch_id) where kind = 'branch';

create table if not exists chat_members (     -- solo para mensajes directos
  channel_id  uuid not null references chat_channels(id) on delete cascade,
  user_id     uuid not null references profiles(id),
  primary key (channel_id, user_id)
);

create table if not exists chat_messages (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id),
  channel_id  uuid not null references chat_channels(id) on delete cascade,
  sender_id   uuid not null references profiles(id),
  body        text check (char_length(body) <= 2000),
  photo_path  text,
  client_id   uuid unique,                    -- reenviar no duplica
  created_at  timestamptz not null default now(),
  check (coalesce(trim(body), '') <> '' or photo_path is not null)
);
create index if not exists chat_messages_channel_time on chat_messages(channel_id, created_at desc);

create table if not exists chat_reads (
  channel_id   uuid not null references chat_channels(id) on delete cascade,
  user_id      uuid not null references profiles(id),
  last_read_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);

-- ---------- Quién lee y quién escribe ----------
create or replace function chat_org() returns uuid
language sql stable security definer set search_path = public as $$
  select org_id from profiles where id = auth.uid() and is_active;
$$;

create or replace function can_read_channel(p_channel uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from chat_channels c
     where c.id = p_channel and c.org_id = chat_org() and is_org_member(c.org_id)
       and case c.kind
             when 'announce' then true
             when 'branch'   then is_org_owner(c.org_id) or is_branch_member(c.branch_id)
             else exists (select 1 from chat_members m where m.channel_id = c.id and m.user_id = auth.uid())
           end);
$$;

create or replace function can_post_channel(p_channel uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select can_read_channel(p_channel) and exists (
    select 1 from chat_channels c where c.id = p_channel
       and (c.kind <> 'announce' or is_org_owner(c.org_id)
            or exists (select 1 from memberships m where m.user_id = auth.uid() and m.org_id = c.org_id
                         and m.role = 'supervisor' and m.is_active and m.deleted_at is null)));
$$;

alter table chat_channels enable row level security;
alter table chat_members  enable row level security;
alter table chat_messages enable row level security;
alter table chat_reads    enable row level security;
drop policy if exists chat_channels_read on chat_channels;
drop policy if exists chat_members_read on chat_members;
drop policy if exists chat_messages_read on chat_messages;
drop policy if exists chat_reads_read on chat_reads;
create policy chat_channels_read on chat_channels for select to authenticated using (can_read_channel(id));
create policy chat_members_read  on chat_members  for select to authenticated using (can_read_channel(channel_id));
create policy chat_messages_read on chat_messages for select to authenticated using (can_read_channel(channel_id));
create policy chat_reads_read    on chat_reads    for select to authenticated using (user_id = auth.uid());
-- escritura solo por funciones
grant select on chat_channels, chat_members, chat_messages, chat_reads to authenticated;

-- Mensajes en vivo
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'chat_messages') then
    execute 'alter publication supabase_realtime add table public.chat_messages';
  end if;
end $$;

-- ---------- Fotos privadas del chat ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-files', 'chat-files', false, 1048576, array['image/webp','image/jpeg','image/png'])
on conflict (id) do update set public = false, file_size_limit = 1048576,
  allowed_mime_types = array['image/webp','image/jpeg','image/png'];

-- Ruta: {org_id}/{channel_id}/archivo
create or replace function can_access_chat_file(p_name text, p_write boolean) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare v_channel uuid;
begin
  begin v_channel := split_part(p_name, '/', 2)::uuid; exception when others then return false; end;
  if split_part(p_name, '/', 1) <> coalesce(chat_org()::text, '-') then return false; end if;
  return case when p_write then can_post_channel(v_channel) else can_read_channel(v_channel) end;
end $$;

drop policy if exists chat_files_read on storage.objects;
drop policy if exists chat_files_insert on storage.objects;
create policy chat_files_read on storage.objects for select to authenticated
  using (bucket_id = 'chat-files' and public.can_access_chat_file(name, false));
create policy chat_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-files' and public.can_access_chat_file(name, true) and public.storage_has_room(name));

-- ---------- Funciones del chat ----------
-- Lista de conversaciones (crea Avisos y los canales de sucursal la primera vez)
create or replace function chat_channels_list() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_org uuid := chat_org(); b record;
begin
  if v_org is null or not is_org_member(v_org) then raise exception 'Sin permiso'; end if;
  insert into chat_channels (org_id, kind) values (v_org, 'announce') on conflict do nothing;
  for b in select id from branches where org_id = v_org and deleted_at is null and is_active loop
    insert into chat_channels (org_id, kind, branch_id) values (v_org, 'branch', b.id) on conflict do nothing;
  end loop;

  return (
    select coalesce(jsonb_agg(x order by (x->>'kind') = 'announce' desc, x->>'last_at' desc nulls last, x->>'name'), '[]'::jsonb) from (
      select jsonb_build_object(
        'id', c.id, 'kind', c.kind,
        'name', case c.kind
                  when 'branch' then (select name from branches where id = c.branch_id)
                  when 'direct' then (select p.full_name from chat_members m join profiles p on p.id = m.user_id
                                        where m.channel_id = c.id and m.user_id <> auth.uid() limit 1)
                end,
        'can_post', can_post_channel(c.id),
        'last_at', (select max(created_at) from chat_messages where channel_id = c.id),
        'last', (select coalesce(nullif(body, ''), '📷') from chat_messages where channel_id = c.id order by created_at desc limit 1),
        'unread', (select count(*) from chat_messages mm
                    where mm.channel_id = c.id and mm.sender_id <> auth.uid()
                      and mm.created_at > coalesce((select last_read_at from chat_reads r where r.channel_id = c.id and r.user_id = auth.uid()), '-infinity'))
      ) as x
        from chat_channels c where c.org_id = v_org and can_read_channel(c.id)) t);
end $$;

-- Personas de la empresa para escribir en privado
create or replace function chat_people() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name, 'roles', r.roles) order by p.full_name), '[]'::jsonb)
    from profiles p
    join lateral (select array_agg(distinct m.role::text) as roles from memberships m
                   where m.user_id = p.id and m.is_active and m.deleted_at is null) r on true
   where p.org_id = chat_org() and p.is_active and p.id <> auth.uid() and r.roles is not null;
$$;

create or replace function chat_open_direct(p_user uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_org uuid := chat_org(); v_id uuid;
begin
  if v_org is null or p_user = auth.uid() then raise exception 'Sin permiso'; end if;
  if not exists (select 1 from profiles where id = p_user and org_id = v_org and is_active) then raise exception 'Persona inexistente'; end if;
  select c.id into v_id from chat_channels c
   where c.org_id = v_org and c.kind = 'direct'
     and exists (select 1 from chat_members where channel_id = c.id and user_id = auth.uid())
     and exists (select 1 from chat_members where channel_id = c.id and user_id = p_user);
  if v_id is null then
    insert into chat_channels (org_id, kind) values (v_org, 'direct') returning id into v_id;
    insert into chat_members (channel_id, user_id) values (v_id, auth.uid()), (v_id, p_user);
  end if;
  return v_id;
end $$;

create or replace function chat_history(p_channel uuid, p_before timestamptz default null, p_limit int default 50)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not can_read_channel(p_channel) then raise exception 'Sin permiso'; end if;
  return (
    select coalesce(jsonb_agg(x order by (x->>'at')::timestamptz), '[]'::jsonb) from (
      select jsonb_build_object('id', m.id, 'at', m.created_at, 'body', m.body, 'photo', m.photo_path,
                                'sender_id', m.sender_id, 'sender', p.full_name, 'client_id', m.client_id) as x
        from chat_messages m join profiles p on p.id = m.sender_id
       where m.channel_id = p_channel and (p_before is null or m.created_at < p_before)
       order by m.created_at desc limit least(greatest(coalesce(p_limit, 50), 1), 100)) t);
end $$;

create or replace function chat_send(p_channel uuid, p_body text, p_photo_path text default null, p_client_id uuid default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_org uuid := chat_org();
begin
  if p_client_id is not null then
    select id into v_id from chat_messages where client_id = p_client_id;
    if v_id is not null then return v_id; end if;
  end if;
  if not can_post_channel(p_channel) then raise exception 'Sin permiso'; end if;
  if not org_writable(v_org) then raise exception 'Cuenta suspendida: solo lectura'; end if;
  if p_photo_path is not null and (split_part(p_photo_path, '/', 1) <> v_org::text or split_part(p_photo_path, '/', 2) <> p_channel::text) then
    raise exception 'Ruta inválida';
  end if;
  insert into chat_messages (org_id, channel_id, sender_id, body, photo_path, client_id)
  values (v_org, p_channel, auth.uid(), nullif(left(trim(coalesce(p_body, '')), 2000), ''), p_photo_path, p_client_id)
  returning id into v_id;
  insert into chat_reads (channel_id, user_id, last_read_at) values (p_channel, auth.uid(), now())
  on conflict (channel_id, user_id) do update set last_read_at = now();
  return v_id;
end $$;

create or replace function chat_mark_read(p_channel uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not can_read_channel(p_channel) then return; end if;
  insert into chat_reads (channel_id, user_id, last_read_at) values (p_channel, auth.uid(), now())
  on conflict (channel_id, user_id) do update set last_read_at = now();
end $$;

create or replace function chat_unread_total() returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from chat_messages mm join chat_channels c on c.id = mm.channel_id
   where c.org_id = chat_org() and mm.sender_id <> auth.uid() and can_read_channel(c.id)
     and mm.created_at > coalesce((select last_read_at from chat_reads r where r.channel_id = c.id and r.user_id = auth.uid()), now() - interval '30 days');
$$;

-- Limpieza según el plan (la llama el cron diario)
create or replace function chat_cleanup() returns void
language sql security definer set search_path = public as $$
  delete from chat_messages m
   using organizations o join plans p on p.id = o.plan_id
   where m.org_id = o.id and m.created_at < now() - make_interval(days => coalesce(p.chat_retention_days, 30));
$$;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'veltrix-chat-cleanup';
    perform cron.schedule('veltrix-chat-cleanup', '17 4 * * *', 'select public.chat_cleanup()');
  end if;
end $$;

revoke execute on function chat_org(), can_read_channel(uuid), can_post_channel(uuid), can_access_chat_file(text, boolean),
  chat_channels_list(), chat_people(), chat_open_direct(uuid), chat_history(uuid, timestamptz, int),
  chat_send(uuid, text, text, uuid), chat_mark_read(uuid), chat_unread_total(), chat_cleanup() from public, anon;
grant execute on function chat_org(), can_read_channel(uuid), can_post_channel(uuid), can_access_chat_file(text, boolean),
  chat_channels_list(), chat_people(), chat_open_direct(uuid), chat_history(uuid, timestamptz, int),
  chat_send(uuid, text, text, uuid), chat_mark_read(uuid), chat_unread_total() to authenticated;
grant execute on function chat_org(), can_read_channel(uuid), can_post_channel(uuid), can_access_chat_file(text, boolean),
  chat_channels_list(), chat_people(), chat_open_direct(uuid), chat_history(uuid, timestamptz, int),
  chat_send(uuid, text, text, uuid), chat_mark_read(uuid), chat_unread_total(), chat_cleanup() to service_role;
