create table if not exists public.ai_knowledge_gaps (
  topic text not null,
  country_code text not null default '',
  times int not null default 1,
  first_asked_at timestamptz not null default now(),
  last_asked_at timestamptz not null default now(),
  primary key (topic, country_code)
);
alter table public.ai_knowledge_gaps enable row level security;

create or replace function public.ai_log_knowledge_gap(p_topic text, p_countries text[] default '{}')
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_t text := left(lower(trim(coalesce(p_topic, ''))), 80); c text;
begin
  if auth.uid() is null or char_length(v_t) < 3 then return; end if;
  for c in select distinct upper(left(x, 2)) from unnest(case when cardinality(coalesce(p_countries, '{}')) = 0 then array[''] else p_countries end) x loop
    insert into ai_knowledge_gaps (topic, country_code) values (v_t, c)
    on conflict (topic, country_code) do update set times = ai_knowledge_gaps.times + 1, last_asked_at = now();
  end loop;
end $$;
revoke all on function public.ai_log_knowledge_gap(text, text[]) from public, anon;
grant execute on function public.ai_log_knowledge_gap(text, text[]) to authenticated;

create or replace function public.admin_list_ai_knowledge_gaps()
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not (staff_can('kb_edit') or staff_can('kb_verify')) then raise exception 'PERM_DENIED'; end if;
  return coalesce((select jsonb_agg(to_jsonb(g) order by g.times desc, g.last_asked_at desc) from (select * from ai_knowledge_gaps order by times desc, last_asked_at desc limit 200) g), '[]'::jsonb);
end $$;
revoke all on function public.admin_list_ai_knowledge_gaps() from public, anon;
grant execute on function public.admin_list_ai_knowledge_gaps() to authenticated;