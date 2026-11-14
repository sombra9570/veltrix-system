-- 043: endurecimiento tras la auditoría de código
-- 1) Funciones internas (solo las llaman otras funciones o triggers) ya no se pueden invocar desde la API.
--    post_stock / apply_order_stock no validaban permisos: cualquier usuario autenticado podía mover stock ajeno.
-- 2) Un usuario no puede apuntar su perfil a una organización de la que no es miembro
--    (varias funciones toman la organización del perfil).

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

-- Disparador de quien llama (no SECURITY DEFINER): current_user = 'authenticated' solo en escrituras directas
-- desde la app; dentro de las funciones del sistema current_user es el dueño y no se bloquea.
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
