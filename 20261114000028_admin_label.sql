-- "Dueño" pasa a llamarse "Administrador" en los mensajes visibles
do $$
declare f text; d text;
begin
  foreach f in array array['set_my_addons(uuid,int,int,int)', 'set_role_permission', 'set_user_permission'] loop
    for d in select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = split_part(f, '(', 1) loop
      execute replace(replace(d, 'dueño', 'administrador'), 'Dueño', 'Administrador');
    end loop;
  end loop;
end $$;
