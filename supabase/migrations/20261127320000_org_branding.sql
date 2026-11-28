-- Nombre y logo de la empresa: los edita el administrador (dueño) y los ve todo el personal arriba en el panel
alter table organizations add column if not exists logo_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('org-logos', 'org-logos', true, 1048576, array['image/webp','image/jpeg','image/png'])
on conflict (id) do nothing;

create or replace function public.can_write_org_logo(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select split_part(p_name, '/', 1) ~ '^[0-9a-f-]{36}$' and public.is_org_owner(split_part(p_name, '/', 1)::uuid);
$$;

drop policy if exists org_logos_insert on storage.objects;
drop policy if exists org_logos_update on storage.objects;
drop policy if exists org_logos_delete on storage.objects;
create policy org_logos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'org-logos' and public.can_write_org_logo(name));
create policy org_logos_update on storage.objects for update to authenticated
  using (bucket_id = 'org-logos' and public.can_write_org_logo(name))
  with check (bucket_id = 'org-logos' and public.can_write_org_logo(name));
create policy org_logos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'org-logos' and public.can_write_org_logo(name));

create or replace function public.set_org_branding(p_org uuid, p_name text, p_logo text, p_clear boolean default false)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_org_owner(p_org) then raise exception 'forbidden'; end if;
  if p_name is not null and length(btrim(p_name)) between 1 and 80 then
    update organizations set name = btrim(p_name) where id = p_org;
  end if;
  if p_clear then update organizations set logo_path = null where id = p_org;
  elsif p_logo is not null then update organizations set logo_path = p_logo where id = p_org; end if;
end $$;

create or replace function public.org_branding(p_org uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when public.is_org_member(p_org) then
    (select jsonb_build_object('name', o.name, 'logo', o.logo_path) from organizations o where o.id = p_org) end;
$$;
grant execute on function public.set_org_branding(uuid, text, text, boolean), public.org_branding(uuid) to authenticated;
