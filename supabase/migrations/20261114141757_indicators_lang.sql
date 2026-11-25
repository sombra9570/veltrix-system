create extension if not exists http with schema extensions;

create table if not exists fx_rates (
  day      date not null,
  currency char(3) not null,
  rate     numeric(24,8) not null check (rate > 0),
  source   text not null,
  primary key (day, currency)
);
alter table fx_rates enable row level security;

create table if not exists public_holidays (
  country    char(2) not null,
  day        date not null,
  local_name text not null,
  name       text,
  primary key (country, day, local_name)
);
alter table public_holidays enable row level security;

alter table branches add column if not exists lang text
  check (lang in ('es','en','pt','it','fr','de','zh','ja','ru','ar','ko','hi'));

create or replace function fx_sync() returns int
language plpgsql security definer set search_path = public, extensions as $$
declare r record; j jsonb; v_day date := (now() at time zone 'utc')::date; n int := 0; t text; v numeric;
begin
  begin
    select status, content into r from extensions.http_get('https://open.er-api.com/v6/latest/USD');
    if r.status = 200 then
      j := r.content::jsonb;
      if j->>'result' = 'success' then
        insert into fx_rates (day, currency, rate, source)
        select v_day, upper(k), x::numeric, 'open.er-api.com' from jsonb_each_text(j->'rates') as e(k, x)
         where length(k) = 3 and x::numeric > 0
        on conflict (day, currency) do update set rate = excluded.rate, source = excluded.source
          where fx_rates.source <> 'BCB';
        get diagnostics n = row_count;
      end if;
    end if;
  exception when others then null;
  end;
  begin
    select status, content into r from extensions.http_get('https://www.bcb.gob.bo/librerias/indicadores/otras/anteriores.php');
    if r.status = 200 then
      t := regexp_replace(regexp_replace(r.content, '<[^>]+>', ' ', 'g'), '(&nbsp;|\s)+', ' ', 'g');
      t := substr(t, position('Tipo de Cambio Oficial' in t), 300);
      v := replace(substring(t from 'USD ([0-9]+[.,][0-9]+)'), ',', '.')::numeric;
      if v between 1 and 1000 then
        insert into fx_rates (day, currency, rate, source) values (v_day, 'BOB', v, 'BCB')
        on conflict (day, currency) do update set rate = excluded.rate, source = excluded.source;
        n := n + 1;
      end if;
    end if;
  exception when others then null;
  end;
  delete from fx_rates where day < v_day - 120;
  return n;
end $$;

create or replace function holidays_sync(p_year int default extract(year from now())::int) returns int
language plpgsql security definer set search_path = public, extensions as $$
declare c text; r record; n int := 0; k int;
begin
  foreach c in array array['BO','US','MX','BR','CL','AR','CO','PE','ES','IT','FR','DE','RU','CN','JP','AE','EC','PY','UY','VE',
                           'GT','HN','SV','NI','CR','PA','DO','PR','CU','CA','GB','PT','IN','KR','SA'] loop
    begin
      select status, content into r from extensions.http_get(format('https://date.nager.at/api/v3/PublicHolidays/%s/%s', p_year, c));
      if r.status = 200 and left(ltrim(r.content), 1) = '[' then
        delete from public_holidays where country = c and extract(year from day) = p_year;
        insert into public_holidays (country, day, local_name, name)
        select distinct c, (h->>'date')::date, h->>'localName', h->>'name'
          from jsonb_array_elements(r.content::jsonb) h
         where coalesce((h->>'global')::boolean, true)
        on conflict do nothing;
        get diagnostics k = row_count; n := n + k;
      end if;
    exception when others then null;
    end;
  end loop;
  return n;
end $$;

create or replace function fx_board(p_currencies text[]) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'currency', c,
           'rate', (select rate from fx_rates where currency = c order by day desc limit 1),
           'day', (select day from fx_rates where currency = c order by day desc limit 1),
           'source', (select source from fx_rates where currency = c order by day desc limit 1),
           'prev', (select rate from fx_rates where currency = c order by day desc offset 1 limit 1),
           'series', (select coalesce(jsonb_agg(rate order by day), '[]'::jsonb)
                        from (select day, rate from fx_rates where currency = c order by day desc limit 14) s)
         ) order by ord), '[]'::jsonb)
    from unnest(p_currencies) with ordinality as u(c, ord);
$$;

create or replace function holidays_next(p_country text, p_limit int default 4) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('day', day, 'local_name', local_name, 'name', name) order by day), '[]'::jsonb)
    from (select day, local_name, name from public_holidays
           where country = upper(p_country) and day >= (now() at time zone 'utc')::date - 1
           order by day limit least(greatest(p_limit, 1), 10)) h;
$$;

create or replace function set_my_lang(p_lang text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_lang not in ('es','en','pt','it','fr','de','zh','ja','ru','ar','ko','hi') then raise exception 'LANG_INVALID'; end if;
  update profiles set preferred_lang = p_lang, updated_at = now() where id = auth.uid();
end $$;

create or replace function my_lang() returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select preferred_lang from profiles where id = auth.uid() and preferred_lang is not null),
    (select b.lang from memberships m join branches b on b.id = m.branch_id
      where m.user_id = auth.uid() and m.is_active and m.deleted_at is null and b.lang is not null
      order by m.created_at limit 1));
$$;

create or replace function set_branch_lang(p_branch uuid, p_lang text) returns void
language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  select org_id into v_org from branches where id = p_branch and deleted_at is null;
  if v_org is null or not is_org_owner(v_org) then raise exception 'Sin permiso'; end if;
  if p_lang is not null and p_lang not in ('es','en','pt','it','fr','de','zh','ja','ru','ar','ko','hi') then raise exception 'LANG_INVALID'; end if;
  update branches set lang = p_lang, updated_at = now() where id = p_branch;
end $$;

revoke execute on function fx_sync(), holidays_sync(int) from public, anon, authenticated;
revoke execute on function fx_board(text[]), holidays_next(text, int), set_my_lang(text), my_lang(), set_branch_lang(uuid, text) from public, anon;
grant execute on function fx_board(text[]), holidays_next(text, int), set_my_lang(text), my_lang(), set_branch_lang(uuid, text) to authenticated;

do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname in ('veltrix_fx_am', 'veltrix_fx_pm', 'veltrix_holidays');
  perform cron.schedule('veltrix_fx_am', '35 12 * * *', 'select public.fx_sync()');
  perform cron.schedule('veltrix_fx_pm', '35 21 * * *', 'select public.fx_sync()');
  perform cron.schedule('veltrix_holidays', '10 6 1 * *',
    'select public.holidays_sync(extract(year from now())::int); select public.holidays_sync(extract(year from now())::int + 1)');
end $$;
