do $m$
declare d text; n text;
begin
  d := pg_get_functiondef('public.sup_finish(uuid)'::regprocedure);
  n := replace(d, E'  update collection_routes set locked_by = null, locked_at = null where id = r.id;\n', '');
  if n = d then raise exception 'finish unchanged'; end if;
  execute n;
  d := pg_get_functiondef('public.sup_set_lock(uuid,boolean)'::regprocedure);
  n := replace(d, E'end $function$', E'  insert into route_notices (org_id, route_id, kind, body, created_by)\n  values (r.org_id, r.id, case when p_lock then ''lock'' else ''unlock'' end,\n          case when p_lock then ''Su ruta fue bloqueada por el supervisor: solo puede consultar hasta que la desbloquee.'' else ''Su ruta fue desbloqueada: ya puede trabajar con normalidad.'' end, auth.uid());\nend $function$');
  if n = d then raise exception 'lock unchanged'; end if;
  execute n;
end $m$;
