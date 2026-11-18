-- 055 · Funciones del administrador sin acceso para visitantes sin sesión (aplicada 18 nov 2026)
revoke execute on function public.set_owner_roles(uuid, app_role[]) from anon, public;
revoke execute on function public.bootstrap_company(uuid) from anon, public;
revoke execute on function public.bootstrap_company(uuid, text[]) from anon, public;
revoke execute on function public.enforce_plan_roles() from anon, public;
grant execute on function public.set_owner_roles(uuid, app_role[]) to authenticated;
grant execute on function public.bootstrap_company(uuid) to authenticated;
grant execute on function public.bootstrap_company(uuid, text[]) to authenticated;
