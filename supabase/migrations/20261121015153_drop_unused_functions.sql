do $m$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p
            where p.pronamespace = 'public'::regnamespace
              and p.proname in ('my_approval_requests','public_delivery_info','public_delivery_order','set_branch_stock','set_member_custom_role','set_member_limit')
  loop
    execute 'drop function ' || r.sig;
  end loop;
end $m$;
