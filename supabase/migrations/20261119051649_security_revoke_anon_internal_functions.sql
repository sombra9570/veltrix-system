do $$
declare r record;
begin
  -- Funciones internas: solo usuarios con sesión (authenticated) y el servidor
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('approvals_summary','enforce_worker_slots','platform_chat_contacts','platform_chat_list',
                         'platform_chat_send','report_review','report_save','reports_list','staff_list','staff_update',
                         'support_inbox','support_my_tickets','support_open','support_reply','support_set','support_thread')
  loop
    execute format('revoke all on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
  end loop;
  -- search_path fijo en funciones que lo tenían variable
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in ('assert_staff','role_module_ok','custom_role_guard')
  loop
    execute format('alter function %s set search_path = public', r.sig);
  end loop;
end $$;
