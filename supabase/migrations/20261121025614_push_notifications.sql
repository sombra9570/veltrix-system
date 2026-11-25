
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  org_id uuid not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  lang text not null default 'es',
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);
create index if not exists push_subscriptions_org_idx on public.push_subscriptions(org_id);

create table if not exists public.push_log (
  request_id uuid not null,
  event text not null,
  ref text not null,
  created_at timestamptz not null default now(),
  primary key (request_id, event, ref)
);
alter table public.push_log enable row level security;
create index if not exists push_log_created_idx on public.push_log(created_at);

create or replace function public.push_subscribe(p_endpoint text, p_p256dh text, p_auth text, p_lang text default 'es')
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_org uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_endpoint is null or p_endpoint !~ '^https://' or length(p_endpoint) > 1000
     or coalesce(length(p_p256dh), 0) not between 80 and 120 or coalesce(length(p_auth), 0) not between 16 and 40 then
    raise exception 'DATA_INVALID';
  end if;
  select m.org_id into v_org from memberships m where m.user_id = auth.uid() and m.is_active and m.deleted_at is null order by m.created_at limit 1;
  if v_org is null then raise exception 'PERM_DENIED'; end if;
  insert into push_subscriptions (user_id, org_id, endpoint, p256dh, auth, lang)
  values (auth.uid(), v_org, p_endpoint, p_p256dh, p_auth, left(coalesce(p_lang, 'es'), 5))
  on conflict (endpoint) do update set user_id = excluded.user_id, org_id = excluded.org_id, p256dh = excluded.p256dh, auth = excluded.auth, lang = excluded.lang;
  delete from push_subscriptions where user_id = auth.uid() and created_at < now() - interval '365 days';
end $$;

create or replace function public.push_unsubscribe(p_endpoint text)
returns void language sql security definer set search_path to 'public' as $$
  delete from push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
$$;

-- Solo la usa el servidor (service role): valida el evento, evita repetirlo y devuelve a quién avisar.
create or replace function public.push_claim(p_request uuid, p_event text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare r delivery_requests%rowtype; v_comp uuid; v_ref text; v_msg uuid; v_n int; m record; v_ok boolean; v_subs jsonb := '[]'::jsonb; s record;
begin
  select * into r from delivery_requests where id = p_request;
  if not found then return null; end if;
  if p_event = 'new' then
    if r.status <> 'pending' or r.created_at < now() - interval '10 minutes' then return null; end if;
    v_ref := 'new';
  elsif p_event = 'msg' then
    select id into v_msg from store_order_messages where request_id = r.id and from_customer and created_at > now() - interval '3 minutes' order by created_at desc limit 1;
    if v_msg is null then return null; end if;
    v_ref := v_msg::text;
  elsif p_event = 'assigned' then
    if r.assigned_to is null or r.assigned_at is null or r.assigned_at < now() - interval '5 minutes' or r.fulfilled_at is not null then return null; end if;
    v_ref := r.assigned_at::text;
  else
    return null;
  end if;
  insert into push_log (request_id, event, ref) values (r.id, p_event, v_ref) on conflict do nothing;
  get diagnostics v_n = row_count;
  if v_n = 0 then return null; end if;
  delete from push_log where created_at < now() - interval '2 days';
  select company_id into v_comp from branches where id = r.branch_id;

  for m in select distinct on (mm.user_id) mm.user_id, mm.role::text as role from memberships mm
            where mm.org_id = r.org_id and mm.is_active and mm.deleted_at is null order by mm.user_id, mm.created_at
  loop
    if p_event = 'assigned' then
      v_ok := (m.user_id = r.assigned_to);
    else
      perform set_config('request.jwt.claim.sub', m.user_id::text, true);
      v_ok := store_perm('store.orders', v_comp) or store_perm('store.assign', v_comp) or (p_event = 'msg' and r.assigned_to = m.user_id);
    end if;
    if v_ok then
      for s in select endpoint, p256dh, auth, lang from push_subscriptions where user_id = m.user_id loop
        v_subs := v_subs || jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth, 'lang', s.lang, 'role', m.role);
      end loop;
    end if;
  end loop;
  perform set_config('request.jwt.claim.sub', '', true);
  return jsonb_build_object('customer', r.customer_name, 'kind', r.kind, 'subs', v_subs);
end $$;

create or replace function public.push_drop(p_endpoint text)
returns void language sql security definer set search_path to 'public' as $$
  delete from push_subscriptions where endpoint = p_endpoint;
$$;

revoke all on function public.push_subscribe(text,text,text,text), public.push_unsubscribe(text), public.push_claim(uuid,text), public.push_drop(text) from public, anon, authenticated;
grant execute on function public.push_subscribe(text,text,text,text), public.push_unsubscribe(text) to authenticated;
grant execute on function public.push_claim(uuid,text), public.push_drop(text) to service_role;
