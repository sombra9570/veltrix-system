create or replace function public.perm_default(p_role text, p_key text)
 returns boolean language sql immutable set search_path to 'public' as $$
  select case
    when p_key in ('tables.remove_item', 'workshop.remove_line') then p_role = 'supervisor' or p_key = any(role_offered_keys(p_role))
    when p_role in ('cashier','storekeeper','accountant','director','secretary','waiter','kitchen','technician','delivery','reception')
         and p_key = any(perm_catalog()) then p_key = any(role_default_keys(p_role))
    else perm_default_base(p_role, p_key) end;
$$;
