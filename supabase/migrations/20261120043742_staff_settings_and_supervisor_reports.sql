alter table profiles add column if not exists pay_qr_path text, add column if not exists pay_qr_note text;

create or replace function my_settings() returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object('name', p.full_name, 'phone', p.phone, 'email', p.email, 'pay_qr', p.pay_qr_path, 'pay_qr_note', p.pay_qr_note,
    'org_id', (select m.org_id from memberships m where m.user_id = auth.uid() and m.is_active and m.deleted_at is null and m.branch_id is not null limit 1),
    'branch_id', (select m.branch_id from memberships m where m.user_id = auth.uid() and m.is_active and m.deleted_at is null and m.branch_id is not null limit 1))
  from profiles p where p.id = auth.uid();
$$;

create or replace function set_my_settings(p_name text, p_phone text, p_qr_path text, p_qr_note text) returns void language plpgsql security definer set search_path to 'public' as $$
declare ok boolean;
begin
  if auth.uid() is null then raise exception 'PERM_DENIED'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Indique el nombre'; end if;
  if coalesce(p_qr_path, '') <> '' then
    select exists (select 1 from memberships m where m.user_id = auth.uid() and m.is_active and m.deleted_at is null
                    and split_part(p_qr_path, '/', 1) = m.org_id::text and split_part(p_qr_path, '/', 2) = m.branch_id::text) into ok;
    if not ok then raise exception 'Ruta inválida'; end if;
  end if;
  update profiles set full_name = trim(p_name), phone = nullif(trim(coalesce(p_phone, '')), ''),
         pay_qr_path = nullif(p_qr_path, ''), pay_qr_note = nullif(left(trim(coalesce(p_qr_note, '')), 120), ''), updated_at = now()
   where id = auth.uid();
end $$;

create or replace function sup_reports() returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object(
    'sent', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'at', n.created_at, 'route', r.name, 'body', n.body) order by n.created_at desc)
                        from (select * from route_notices where kind = 'report' and created_by = auth.uid() order by created_at desc limit 60) n
                        join collection_routes r on r.id = n.route_id), '[]'::jsonb),
    'received', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'at', n.created_at, 'route', r.name, 'body', n.body, 'kind', n.kind) order by n.created_at desc)
                        from (select x.* from route_notices x join collection_routes rr on rr.id = x.route_id
                               where rr.supervisor_id = auth.uid() and x.kind in ('message', 'report') and x.created_by is distinct from auth.uid()
                               order by x.created_at desc limit 60) n
                        join collection_routes r on r.id = n.route_id), '[]'::jsonb));
$$;
revoke all on function my_settings(), set_my_settings(text,text,text,text), sup_reports() from public, anon;
grant execute on function my_settings(), set_my_settings(text,text,text,text), sup_reports() to authenticated;
