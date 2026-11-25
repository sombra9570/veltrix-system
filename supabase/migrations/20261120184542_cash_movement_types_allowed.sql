create or replace function public.cash_movement_types() returns text[]
language plpgsql stable security definer set search_path to 'public' as $$
declare b uuid;
begin
  select branch_id into b from register_shifts where cashier_id = auth.uid() and status = 'open' limit 1;
  if b is null then return '{}'; end if;
  return array(select t from (values ('expense','cash.expense'),('withdrawal','cash.withdraw'),('deposit','cash.deposit'),('change_fund','cash.change_fund')) v(t,k) where has_perm(k, b));
end $$;
revoke all on function public.cash_movement_types() from public, anon;
grant execute on function public.cash_movement_types() to authenticated;
