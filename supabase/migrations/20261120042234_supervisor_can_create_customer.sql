do $m$
declare d text; n text;
begin
  d := pg_get_functiondef('public.collector_save_customer(uuid,text,text,text,text,text,numeric,numeric,text,text,text,numeric,numeric)'::regprocedure);
  n := replace(d, 'r.collector_id = auth.uid() or is_branch_manager', 'r.collector_id = auth.uid() or r.supervisor_id = auth.uid() or is_branch_manager');
  if n = d then raise exception 'save_customer unchanged'; end if;
  execute n;
  d := pg_get_functiondef('public.collector_set_customer_files(uuid,text,text,text,text,boolean)'::regprocedure);
  n := replace(d, 'r.collector_id = auth.uid() and r.is_active', '(r.collector_id = auth.uid() or r.supervisor_id = auth.uid()) and r.is_active');
  if n = d then raise exception 'files unchanged'; end if;
  execute n;
end $m$;
