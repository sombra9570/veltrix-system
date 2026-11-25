do $$
declare f text;
begin
  foreach f in array array[
    'public.post_stock(uuid,uuid,uuid,numeric,stock_movement_type,numeric,text,uuid,text)',
    'public.apply_order_stock(uuid,uuid,uuid,text,integer)',
    'public._shift_expected_cash(uuid)',
    'public.chat_cleanup()',
    'public.assert_staff(uuid,uuid,app_role)',
    'public.default_warehouse(uuid)',
    'public.customer_rating(uuid)',
    'public.loan_policy(uuid)',
    'public.org_storage_mb(uuid)',
    'public.branch_today(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;

create or replace function public.guard_profile_org()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if current_user in ('authenticated', 'anon')
     and new.org_id is not null
     and (tg_op = 'INSERT' or new.org_id is distinct from old.org_id)
     and not exists (select 1 from memberships m where m.user_id = new.id and m.org_id = new.org_id and m.deleted_at is null)
     and not is_org_owner(new.org_id) then
    raise exception 'Un usuario no puede asignarse a una organización ajena';
  end if;
  return new;
end $$;
drop trigger if exists profiles_org_guard on public.profiles;
create trigger profiles_org_guard before insert or update of org_id on public.profiles
  for each row execute function public.guard_profile_org();

create or replace function public.reader_branches()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', b.id, 'name', b.name, 'company_id', c.id, 'company', c.legal_name, 'currency', c.base_currency,
           'company_wide', has_company_role(c.id, '{supervisor}')) order by c.legal_name, b.code), '[]'::jsonb)
    from branches b join companies c on c.id = b.company_id
   where b.deleted_at is null and b.is_active and c.deleted_at is null and branch_reader(b.id);
$$;
revoke all on function public.reader_branches() from public, anon;
grant execute on function public.reader_branches() to authenticated;

do $$
declare f text; def text;
begin
  foreach f in array array['public.report_summary(uuid,uuid,date,date)', 'public.sales_list(uuid,date,date,text)', 'public.sale_detail(uuid)'] loop
    def := pg_get_functiondef(f::regprocedure);
    if position('is_branch_manager(' in def) = 0 then raise exception 'patrón no encontrado en %', f; end if;
    execute replace(def, 'is_branch_manager(', 'branch_reader(');
  end loop;
end $$;
