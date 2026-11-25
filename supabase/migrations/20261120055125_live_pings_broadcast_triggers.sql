create or replace function public.live_ping() returns trigger
language plpgsql security definer set search_path to 'public'
as $$
declare r record; k text;
begin
  r := case when tg_op = 'DELETE' then old else new end;
  begin
    foreach k in array string_to_array(tg_argv[0], ',') loop
      perform realtime.send('{}'::jsonb, 'ping', 'org:' || r.org_id::text || ':' || k, false);
    end loop;
    if tg_argv[0] = 'req' then
      perform realtime.send(jsonb_build_object('s', r.status), 'ping', 'req:' || r.id::text, false);
    end if;
  exception when others then null; -- un aviso perdido nunca debe frenar una venta o un pedido
  end;
  return null;
end $$;

create or replace function public.live_ping_req() returns trigger
language plpgsql security definer set search_path to 'public'
as $$
begin
  begin
    perform realtime.send('{}'::jsonb, 'ping', 'org:' || new.org_id::text || ':' || tg_argv[0], false);
    perform realtime.send('{}'::jsonb, 'ping', 'req:' || new.id::text, false);
  exception when others then null;
  end;
  return null;
end $$;

create or replace function public.live_ping_plat() returns trigger
language plpgsql security definer set search_path to 'public'
as $$
begin
  begin perform realtime.send('{}'::jsonb, 'ping', 'plat:' || new.to_id::text, false);
  exception when others then null; end;
  return null;
end $$;

drop trigger if exists live_orders on public.orders;
create trigger live_orders after insert or update on public.orders
  for each row execute function public.live_ping('tables,delivery,dispatch');
drop trigger if exists live_order_items on public.order_items;
create trigger live_order_items after insert or update or delete on public.order_items
  for each row execute function public.live_ping('tables');
drop trigger if exists live_table_requests on public.table_requests;
create trigger live_table_requests after insert or update on public.table_requests
  for each row execute function public.live_ping_req('tables');
drop trigger if exists live_delivery_requests on public.delivery_requests;
create trigger live_delivery_requests after insert or update on public.delivery_requests
  for each row execute function public.live_ping_req('delivery');
drop trigger if exists live_approvals on public.approval_requests;
create trigger live_approvals after insert or update on public.approval_requests
  for each row execute function public.live_ping('approvals');
drop trigger if exists live_chat on public.chat_messages;
create trigger live_chat after insert on public.chat_messages
  for each row execute function public.live_ping('chat');
drop trigger if exists live_plat on public.platform_messages;
create trigger live_plat after insert on public.platform_messages
  for each row execute function public.live_ping_plat();
