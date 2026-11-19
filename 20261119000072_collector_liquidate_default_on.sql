-- Liquidar aparece por defecto para el cobrador; el administrador puede desactivarlo en Permisos.
create or replace function public.perm_default(p_role text, p_key text)
 returns boolean language sql immutable set search_path to 'public'
as $function$
  select case when p_key = 'cash.see_expected' then false
              when p_key = 'routes.liquidate' then p_role in ('supervisor', 'collector')
              when p_key in ('loans.interest', 'loans.cancel', 'loans.reschedule', 'routes.invest', 'routes.approve_loans', 'collector.portfolio')
                then p_role = 'supervisor'
              else true end;
$function$;
