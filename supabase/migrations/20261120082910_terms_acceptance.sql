alter table organizations add column if not exists accepted_terms_at timestamptz, add column if not exists terms_version text;

create or replace function public.accept_terms(p_version text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_org uuid;
begin
  select m.org_id into v_org from memberships m where m.user_id = auth.uid() and m.role = 'owner' and m.deleted_at is null limit 1;
  if v_org is null then raise exception 'Solo el administrador acepta los términos'; end if;
  if p_version is null or length(p_version) > 20 then raise exception 'Versión inválida'; end if;
  update organizations set accepted_terms_at = now(), terms_version = p_version, updated_at = now() where id = v_org and accepted_terms_at is null;
end $$;
revoke all on function public.accept_terms(text) from public, anon;
grant execute on function public.accept_terms(text) to authenticated;
