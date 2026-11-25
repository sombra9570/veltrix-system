create table if not exists public.support_leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  full_name text not null,
  phone text not null,
  email text not null,
  place text not null,
  note text,
  answers jsonb not null default '{}'::jsonb,
  status text not null default 'new' check (status in ('new','contacted','closed')),
  handled_by uuid,
  handled_at timestamptz
);
alter table public.support_leads enable row level security;

create table if not exists public.platform_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('lead','company','support_msg')),
  ref_id uuid,
  title text not null,
  detail text,
  read_at timestamptz,
  read_by uuid
);
alter table public.platform_events enable row level security;
create index if not exists platform_events_unread on public.platform_events (created_at desc) where read_at is null;

-- Quien está en el equipo de la plataforma ve la bandeja; nadie más
create or replace function public.public_submit_lead(p_name text, p_phone text, p_email text, p_place text, p_note text, p_answers jsonb)
returns void language plpgsql security definer set search_path to 'public' as $$
declare n text := btrim(coalesce(p_name,'')); ph text := btrim(coalesce(p_phone,'')); em text := lower(btrim(coalesce(p_email,''))); pl text := btrim(coalesce(p_place,''));
begin
  if length(n) < 3 or length(n) > 120 then raise exception 'LEAD_NAME'; end if;
  if ph !~ '^[0-9+() .-]{6,25}$' then raise exception 'LEAD_PHONE'; end if;
  if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(em) > 160 then raise exception 'LEAD_EMAIL'; end if;
  if length(pl) < 2 or length(pl) > 160 then raise exception 'LEAD_PLACE'; end if;
  -- Freno contra abuso: máximo 3 solicitudes por hora con el mismo correo o celular
  if (select count(*) from support_leads where created_at > now() - interval '1 hour' and (email = em or phone = ph)) >= 3 then raise exception 'LEAD_LIMIT'; end if;
  insert into support_leads(full_name, phone, email, place, note, answers)
  values (n, ph, em, pl, nullif(left(btrim(coalesce(p_note,'')), 1000), ''), coalesce(p_answers, '{}'::jsonb));
end $$;
grant execute on function public.public_submit_lead(text,text,text,text,text,jsonb) to anon, authenticated;

create or replace function public.platform_leads_list(p_status text default null)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not is_platform_staff() then raise exception 'PERM_DENIED'; end if;
  return coalesce((select jsonb_agg(to_jsonb(l) order by l.created_at desc) from (
    select id, created_at, full_name, phone, email, place, note, answers, status, handled_at
      from support_leads where p_status is null or status = p_status order by created_at desc limit 200) l), '[]'::jsonb);
end $$;

create or replace function public.platform_lead_set(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not is_platform_staff() then raise exception 'PERM_DENIED'; end if;
  if p_status not in ('new','contacted','closed') then raise exception 'BAD_STATUS'; end if;
  update support_leads set status = p_status, handled_by = auth.uid(), handled_at = now() where id = p_id;
  if p_status <> 'new' then
    update platform_events set read_at = coalesce(read_at, now()), read_by = coalesce(read_by, auth.uid()) where kind = 'lead' and ref_id = p_id;
  end if;
end $$;

create or replace function public.platform_events_list()
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not is_platform_staff() then raise exception 'PERM_DENIED'; end if;
  return jsonb_build_object(
    'unread', (select count(*) from platform_events where read_at is null),
    'items', coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at desc) from (
      select id, created_at, kind, ref_id, title, detail, read_at from platform_events order by created_at desc limit 40) e), '[]'::jsonb));
end $$;

create or replace function public.platform_events_read(p_id uuid default null)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not is_platform_staff() then raise exception 'PERM_DENIED'; end if;
  update platform_events set read_at = now(), read_by = auth.uid() where read_at is null and (p_id is null or id = p_id);
end $$;

-- Eventos automáticos
create or replace function public.ev_lead() returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  insert into platform_events(kind, ref_id, title, detail) values ('lead', new.id, new.full_name, new.place || ' · ' || new.phone);
  perform realtime.send('{}'::jsonb, 'ping', 'plat:inbox', false);
  return null;
end $$;
drop trigger if exists ev_lead on public.support_leads;
create trigger ev_lead after insert on public.support_leads for each row execute function public.ev_lead();

create or replace function public.ev_company() returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  insert into platform_events(kind, ref_id, title, detail) values ('company', new.id, new.name, null);
  perform realtime.send('{}'::jsonb, 'ping', 'plat:inbox', false);
  return null;
end $$;
drop trigger if exists ev_company on public.organizations;
create trigger ev_company after insert on public.organizations for each row execute function public.ev_company();

create or replace function public.ev_support_msg() returns trigger language plpgsql security definer set search_path to 'public' as $$
declare s text;
begin
  if new.sender_kind <> 'customer' or new.internal then return null; end if;
  select subject into s from support_tickets where id = new.ticket_id;
  insert into platform_events(kind, ref_id, title, detail) values ('support_msg', new.ticket_id, coalesce(s, 'Mensaje de un cliente'), left(new.body, 140));
  perform realtime.send('{}'::jsonb, 'ping', 'plat:inbox', false);
  return null;
end $$;
drop trigger if exists ev_support_msg on public.support_messages;
create trigger ev_support_msg after insert on public.support_messages for each row execute function public.ev_support_msg();
