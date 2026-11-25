alter table public.stores add column if not exists theme text not null default 'ocean' check (theme ~ '^[a-z]{2,12}$'),
  add column if not exists admin_bg text not null default 'none' check (admin_bg ~ '^[a-z]{2,12}$');

create or replace function public.set_store_look(p_company uuid, p_theme text, p_admin_bg text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not store_perm('store.edit_info', p_company) then raise exception 'PERM_DENIED'; end if;
  if coalesce(p_theme,'') !~ '^[a-z]{2,12}$' or coalesce(p_admin_bg,'') !~ '^[a-z]{2,12}$' then raise exception 'Valor inválido'; end if;
  update stores set theme = p_theme, admin_bg = p_admin_bg, updated_at = now() where company_id = p_company;
  if not found then raise exception 'Tienda inexistente'; end if;
end $$;
revoke all on function public.set_store_look(uuid,text,text) from public, anon;
grant execute on function public.set_store_look(uuid,text,text) to authenticated;

do $m$
declare d text;
begin
  d := pg_get_functiondef('public.public_store(text)'::regprocedure);
  d := replace(d, '''logo'', s.logo_path,', '''logo'', s.logo_path, ''theme'', s.theme,');
  execute d;
end $m$;
