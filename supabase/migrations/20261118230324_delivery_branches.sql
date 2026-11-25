create or replace function delivery_branches() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'company', c.legal_name, 'currency', c.base_currency,
           'enabled', b.delivery_enabled) order by c.legal_name, b.code), '[]'::jsonb)
    from branches b join companies c on c.id = b.company_id
   where b.deleted_at is null and b.is_active and c.deleted_at is null
     and (can_serve_tables(b.id) or has_branch_role(b.id, '{delivery}'));
$$;
revoke all on function delivery_branches() from public;
grant execute on function delivery_branches() to authenticated;
