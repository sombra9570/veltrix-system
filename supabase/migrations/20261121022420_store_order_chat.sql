alter table public.delivery_requests add column if not exists contact_pref text not null default 'chat' check (contact_pref in ('chat','whatsapp'));

create table if not exists public.store_order_messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.delivery_requests(id) on delete cascade,
  org_id uuid not null,
  from_customer boolean not null,
  sender_id uuid references auth.users(id),
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists store_order_messages_req_idx on public.store_order_messages (request_id, created_at);
alter table public.store_order_messages enable row level security;
revoke all on public.store_order_messages from anon, authenticated;

create or replace function public.live_ping_msg() returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    perform realtime.send('{}'::jsonb, 'ping', 'org:' || new.org_id::text || ':delivery', false);
    perform realtime.send('{}'::jsonb, 'ping', 'req:' || new.request_id::text, false);
  exception when others then null;
  end;
  return null;
end $$;
revoke all on function public.live_ping_msg() from public, anon, authenticated;
drop trigger if exists live_store_order_messages on public.store_order_messages;
create trigger live_store_order_messages after insert on public.store_order_messages for each row execute function public.live_ping_msg();

-- Cliente (anónimo): solo conoce el id de su pedido
create or replace function public.public_order_chat(p_request uuid) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r delivery_requests%rowtype; s stores%rowtype;
begin
  select * into r from delivery_requests where id = p_request;
  if not found then return null; end if;
  select st.* into s from stores st join branches b on b.company_id = st.company_id where b.id = r.branch_id limit 1;
  return jsonb_build_object(
    'open', (r.status in ('pending','accepted') and r.fulfilled_at is null and r.created_at > now() - interval '7 days'),
    'contact_pref', r.contact_pref, 'store_name', s.name, 'store_whatsapp', s.whatsapp,
    'messages', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'mine', m.from_customer, 'body', m.body, 'at', m.created_at) order by m.created_at), '[]'::jsonb)
                   from store_order_messages m where m.request_id = r.id));
end $$;

create or replace function public.public_order_say(p_request uuid, p_body text) returns void language plpgsql security definer set search_path = public as $$
declare r delivery_requests%rowtype; v_body text := left(trim(coalesce(p_body, '')), 500);
begin
  select * into r from delivery_requests where id = p_request;
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
  if v_body = '' then raise exception 'DATA_INVALID'; end if;
  if not (r.status in ('pending','accepted') and r.fulfilled_at is null and r.created_at > now() - interval '7 days') then raise exception 'CHAT_CLOSED'; end if;
  if (select count(*) from store_order_messages where request_id = r.id and from_customer) >= 40
     or (select count(*) from store_order_messages where request_id = r.id and from_customer and created_at > now() - interval '1 minute') >= 6 then
    raise exception 'TOO_MANY_REQUESTS';
  end if;
  insert into store_order_messages (request_id, org_id, from_customer, body) values (r.id, r.org_id, true, v_body);
end $$;

create or replace function public.public_order_set_contact(p_request uuid, p_pref text) returns void language plpgsql security definer set search_path = public as $$
begin
  if p_pref not in ('chat','whatsapp') then raise exception 'DATA_INVALID'; end if;
  update delivery_requests set contact_pref = p_pref where id = p_request and status in ('pending','accepted') and fulfilled_at is null;
end $$;

-- Equipo: mismo permiso que la bandeja, o ser quien recibió el pedido delegado
create or replace function public._store_order_staff_ok(p_request uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from delivery_requests r join branches b on b.id = r.branch_id
                  where r.id = p_request and (r.assigned_to = auth.uid() or store_perm('store.orders', b.company_id) or store_perm('store.assign', b.company_id)));
$$;

create or replace function public.store_order_chat(p_request uuid) returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not _store_order_staff_ok(p_request) then raise exception 'PERM_DENIED'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'mine', not m.from_customer, 'body', m.body, 'at', m.created_at,
            'who', case when m.from_customer then null else (select coalesce(full_name, email) from profiles where id = m.sender_id) end) order by m.created_at), '[]'::jsonb)
            from store_order_messages m where m.request_id = p_request);
end $$;

create or replace function public.store_order_say(p_request uuid, p_body text) returns void language plpgsql security definer set search_path = public as $$
declare r delivery_requests%rowtype; v_body text := left(trim(coalesce(p_body, '')), 500);
begin
  if not _store_order_staff_ok(p_request) then raise exception 'PERM_DENIED'; end if;
  select * into r from delivery_requests where id = p_request;
  if v_body = '' then raise exception 'DATA_INVALID'; end if;
  if r.status = 'rejected' or r.fulfilled_at is not null then raise exception 'CHAT_CLOSED'; end if;
  insert into store_order_messages (request_id, org_id, from_customer, sender_id, body) values (r.id, r.org_id, false, auth.uid(), v_body);
end $$;

revoke all on function public.public_order_chat(uuid), public.public_order_say(uuid,text), public.public_order_set_contact(uuid,text) from public;
grant execute on function public.public_order_chat(uuid), public.public_order_say(uuid,text), public.public_order_set_contact(uuid,text) to anon, authenticated;
revoke all on function public._store_order_staff_ok(uuid), public.store_order_chat(uuid), public.store_order_say(uuid,text) from public, anon;
grant execute on function public._store_order_staff_ok(uuid), public.store_order_chat(uuid), public.store_order_say(uuid,text) to authenticated;

-- La bandeja indica preferencia de contacto y si el último mensaje es del cliente
do $m$
declare d text;
begin
  d := pg_get_functiondef('public.store_orders(uuid)'::regprocedure);
  d := replace(d, '''reject_reason'', r.reject_reason,', '''reject_reason'', r.reject_reason, ''contact_pref'', r.contact_pref,
               ''chat_n'', (select count(*) from store_order_messages m where m.request_id = r.id),
               ''chat_waiting'', coalesce((select m.from_customer from store_order_messages m where m.request_id = r.id order by m.created_at desc limit 1), false),');
  execute d;
end $m$;
