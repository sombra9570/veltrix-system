-- Equipo de plataforma: función de contador y dos permisos independientes, de una sola acción cada uno
alter table public.platform_staff add column if not exists can_edit_knowledge boolean not null default false;
alter table public.platform_staff add column if not exists can_verify_knowledge boolean not null default false;

do $$ declare c text; begin
  for c in select conname from pg_constraint where conrelid = 'public.platform_staff'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%func%' loop
    execute format('alter table public.platform_staff drop constraint %I', c);
  end loop;
end $$;
alter table public.platform_staff add constraint platform_staff_func_check check (func in ('support','technical','billing','sales','accounting'));

create or replace function public.staff_can(p text) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select is_platform_admin() or exists (select 1 from platform_staff s where s.user_id = auth.uid() and s.is_active
    and case p when 'reply' then s.can_reply when 'assign' then s.can_assign when 'orgs' then s.can_see_orgs
               when 'street' then s.can_approve_street
               when 'kb_edit' then s.can_edit_knowledge when 'kb_verify' then s.can_verify_knowledge else false end);
$$;

create or replace function public.staff_list() returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not is_platform_admin() then raise exception 'PERM_DENIED'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('user_id', s.user_id, 'name', p.full_name, 'email', p.email, 'func', s.func,
      'can_reply', s.can_reply, 'can_assign', s.can_assign, 'can_see_orgs', s.can_see_orgs,
      'can_approve_street', s.can_approve_street, 'can_edit_knowledge', s.can_edit_knowledge,
      'can_verify_knowledge', s.can_verify_knowledge, 'is_active', s.is_active) order by p.full_name)
    from platform_staff s left join profiles p on p.id = s.user_id), '[]'::jsonb);
end $$;

drop function if exists public.staff_update(uuid, text, boolean, boolean, boolean, boolean, boolean);
create or replace function public.staff_update(p_user uuid, p_func text, p_reply boolean, p_assign boolean, p_orgs boolean, p_active boolean,
  p_street boolean default false, p_kb_edit boolean default null, p_kb_verify boolean default null) returns void
language plpgsql security definer set search_path to 'public' as $$
begin
  if not is_platform_admin() then raise exception 'PERM_DENIED'; end if;
  update platform_staff set func = p_func, can_reply = p_reply, can_assign = p_assign, can_see_orgs = p_orgs,
         can_approve_street = coalesce(p_street, false), is_active = p_active,
         can_edit_knowledge = coalesce(p_kb_edit, can_edit_knowledge), can_verify_knowledge = coalesce(p_kb_verify, can_verify_knowledge)
   where user_id = p_user;
  update profiles set is_active = p_active where id = p_user;
end $$;
revoke all on function public.staff_update(uuid, text, boolean, boolean, boolean, boolean, boolean, boolean, boolean) from public, anon;
grant execute on function public.staff_update(uuid, text, boolean, boolean, boolean, boolean, boolean, boolean, boolean) to authenticated;

-- Historial de cambios de la biblioteca: quién, qué y cuándo
create table if not exists public.ai_knowledge_log (
  id bigserial primary key,
  knowledge_id uuid not null references public.ai_knowledge(id) on delete cascade,
  action text not null check (action in ('created','edited','verified','retired','reopened')),
  by_user uuid default auth.uid(),
  by_name text,
  at timestamptz not null default now()
);
alter table public.ai_knowledge_log enable row level security;
revoke all on public.ai_knowledge_log from anon, authenticated;
create index if not exists ai_knowledge_log_k_idx on public.ai_knowledge_log (knowledge_id, at desc);

-- Guardar: el administrador y el equipo con permiso; verificar y retirar exigen su propio permiso
create or replace function public.admin_save_ai_knowledge(p_id uuid, p_kind text, p_country text, p_topic text, p_title text, p_summary text,
  p_source_name text, p_source_url text, p_license text, p_lang text, p_status text, p_verified_by text, p_area text default null)
 returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  v_id uuid; v_old text; v_status text := coalesce(p_status, 'draft');
  v_area text := coalesce(nullif(trim(p_area), ''), case p_kind when 'tax_rule' then 'impuestos' when 'veltrix_help' then 'veltrix' else 'operacion' end);
  v_name text; v_by text; v_verify boolean := staff_can('kb_verify'); v_action text;
begin
  if not (staff_can('kb_edit') or v_verify) then raise exception 'PERM_DENIED'; end if;
  select coalesce(nullif(trim(full_name), ''), 'Veltrix') into v_name from profiles where id = auth.uid();
  v_by := case when v_status = 'verified' then coalesce(v_name, nullif(trim(p_verified_by), '')) end;
  if p_id is not null then select status into v_old from ai_knowledge where id = p_id; end if;
  if not v_verify then
    if v_status in ('verified', 'retired') then raise exception 'PERM_DENIED'; end if;
    if v_old in ('verified', 'retired') then raise exception 'Una entrada verificada o retirada solo la modifica quien puede verificar'; end if;
  end if;
  if p_id is null then
    insert into ai_knowledge (kind, area, country_code, topic, title, summary, source_name, source_url, license, lang, status, verified_by, verified_at, created_by)
    values (p_kind, v_area, upper(nullif(trim(p_country), '')), trim(p_topic), trim(p_title), trim(p_summary), nullif(trim(p_source_name), ''), nullif(trim(p_source_url), ''),
            nullif(trim(p_license), ''), coalesce(nullif(trim(p_lang), ''), 'es'), v_status, v_by,
            case when v_status = 'verified' then current_date end, auth.uid())
    returning id into v_id;
    v_action := case v_status when 'verified' then 'verified' when 'retired' then 'retired' else 'created' end;
  else
    update ai_knowledge set kind = p_kind, area = v_area, country_code = upper(nullif(trim(p_country), '')), topic = trim(p_topic), title = trim(p_title), summary = trim(p_summary),
           source_name = nullif(trim(p_source_name), ''), source_url = nullif(trim(p_source_url), ''), license = nullif(trim(p_license), ''),
           lang = coalesce(nullif(trim(p_lang), ''), 'es'), status = v_status, verified_by = v_by,
           verified_at = case when v_status = 'verified' then current_date else null end, updated_at = now()
     where id = p_id returning id into v_id;
    if v_id is null then raise exception 'Entrada inexistente'; end if;
    v_action := case when v_status = 'verified' then 'verified' when v_status = 'retired' then 'retired'
                     when v_old in ('verified', 'retired') then 'reopened' else 'edited' end;
  end if;
  insert into ai_knowledge_log (knowledge_id, action, by_name) values (v_id, v_action, v_name);
  return v_id;
end $$;

create or replace function public.admin_list_ai_knowledge()
 returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not (staff_can('kb_edit') or staff_can('kb_verify')) then raise exception 'PERM_DENIED'; end if;
  return coalesce((select jsonb_agg(to_jsonb(k) - 'created_by' - 'search' order by k.updated_at desc) from ai_knowledge k), '[]'::jsonb);
end $$;

-- Qué puede hacer quien llama, para mostrar solo lo que le corresponde
create or replace function public.knowledge_my_access() returns jsonb
language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object('edit', staff_can('kb_edit'), 'verify', staff_can('kb_verify'));
$$;
revoke all on function public.knowledge_my_access() from public, anon;
grant execute on function public.knowledge_my_access() to authenticated;
