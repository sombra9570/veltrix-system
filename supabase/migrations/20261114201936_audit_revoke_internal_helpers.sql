-- Auditoría 2026-11-14: funciones internas sin verificación de rol/empresa que
-- cualquier usuario con sesión podía llamar por /rest/v1/rpc. Solo las usan otras
-- funciones SECURITY DEFINER, disparadores o pg_cron, que siguen funcionando.
-- Reversible con: grant execute on function ... to authenticated;
revoke execute on function public.apply_order_stock(uuid, uuid, uuid, text, integer) from public, anon, authenticated;
revoke execute on function public.chat_cleanup() from public, anon, authenticated;
revoke execute on function public._shift_expected_cash(uuid) from public, anon, authenticated;
revoke execute on function public.assert_staff(uuid, uuid, public.app_role) from public, anon, authenticated;
revoke execute on function public.customer_overdue(uuid) from public, anon, authenticated;
revoke execute on function public.customer_rating(uuid) from public, anon, authenticated;
revoke execute on function public.loan_policy(uuid) from public, anon, authenticated;
