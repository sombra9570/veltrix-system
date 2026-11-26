create or replace function public.knowledge_my_access() returns jsonb
language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object('edit', staff_can('kb_edit'), 'verify', staff_can('kb_verify'),
    'func', (select s.func from platform_staff s where s.user_id = auth.uid() and s.is_active),
    'admin', is_platform_admin());
$$;
