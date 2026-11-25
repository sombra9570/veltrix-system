alter policy custom_roles_read on public.custom_roles using (
  deleted_at is null and (
    is_org_owner(org_id) or exists (
      select 1 from memberships m
       where m.user_id = (select auth.uid()) and m.org_id = custom_roles.org_id and m.is_active and m.deleted_at is null)));
