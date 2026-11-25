
create or replace function public.owner_of_branch(p_branch uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from branches b where b.id = p_branch and is_org_owner(b.org_id));
$$;
revoke all on function public.owner_of_branch(uuid) from public, anon;
grant execute on function public.owner_of_branch(uuid) to authenticated;

alter policy shifts_insert on public.register_shifts
  with check (cashier_id = (select auth.uid())
              and (has_branch_role(branch_id, '{cashier}'::app_role[]) or owner_of_branch(branch_id))
              and status = 'open'::shift_status and expected_cash is null and declared_cash is null and difference is null
              and org_writable(org_id));

do $$
declare d text;
begin
  d := pg_get_functiondef('public.validate_shift_staff'::regproc);
  d := replace(d, E'  perform assert_staff(new.cashier_id, new.branch_id, ''cashier'');',
    E'  if not exists (select 1 from memberships m where m.user_id = new.cashier_id and m.role = ''owner'' and m.is_active and m.deleted_at is null\n                   and m.org_id = (select b.org_id from branches b where b.id = new.branch_id)) then\n    perform assert_staff(new.cashier_id, new.branch_id, ''cashier'');\n  end if;');
  execute d;
  d := pg_get_functiondef('public.cashier_home'::regproc);
  d := replace(d, 'and has_branch_role(r.branch_id, ''{cashier}'')', 'and (has_branch_role(r.branch_id, ''{cashier}'') or owner_of_branch(r.branch_id))');
  execute d;
end $$;
