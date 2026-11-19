-- Los módulos del nicho que el negocio eligió se permiten en cualquier plan (el plan limita cuántos nichos, no cuáles módulos del nicho).
create table if not exists public.niche_modules (category text not null, module text not null, primary key (category, module));
alter table public.niche_modules enable row level security;
drop policy if exists niche_modules_read on public.niche_modules;
create policy niche_modules_read on public.niche_modules for select to authenticated using (true);
insert into public.niche_modules (category, module) values
('agro','finance'),('agro','inventory'),('agro','purchasing'),('agro','retail'),('auto_parts','finance'),('auto_parts','inventory'),('auto_parts','purchasing'),('auto_parts','retail'),('bakery','finance'),('bakery','inventory'),('bakery','purchasing'),('bakery','retail'),('beauty','finance'),('beauty','retail'),('beauty','workshop'),('clothing','finance'),('clothing','inventory'),('clothing','purchasing'),('clothing','retail'),('collections','field_collection'),('collections','finance'),('credit_sales','field_collection'),('credit_sales','finance'),('credit_sales','inventory'),('credit_sales','retail'),('education','field_collection'),('education','finance'),('education','retail'),('fast_food','finance'),('fast_food','inventory'),('fast_food','purchasing'),('fast_food','restaurant'),('grocery','finance'),('grocery','inventory'),('grocery','purchasing'),('grocery','retail'),('gym','field_collection'),('gym','finance'),('gym','retail'),('hardware','finance'),('hardware','inventory'),('hardware','purchasing'),('hardware','retail'),('health','finance'),('health','retail'),('health','workshop'),('laundry','finance'),('laundry','retail'),('laundry','workshop'),('lodging','finance'),('lodging','restaurant'),('lodging','retail'),('mechanic','finance'),('mechanic','inventory'),('mechanic','purchasing'),('mechanic','workshop'),('microfinance','field_collection'),('microfinance','finance'),('pharmacy','finance'),('pharmacy','inventory'),('pharmacy','purchasing'),('pharmacy','retail'),('restaurant','finance'),('restaurant','inventory'),('restaurant','purchasing'),('restaurant','restaurant'),('stationery','finance'),('stationery','inventory'),('stationery','purchasing'),('stationery','retail'),('tech','finance'),('tech','inventory'),('tech','purchasing'),('tech','retail'),('tech_repair','finance'),('tech_repair','inventory'),('tech_repair','workshop'),('transport','distribution'),('transport','field_collection'),('transport','finance'),('wholesale','distribution'),('wholesale','field_collection'),('wholesale','finance'),('wholesale','inventory'),('wholesale','purchasing')
on conflict do nothing;

create or replace function public.check_module_allowed()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.enabled and not exists (
      select 1 from organizations o join plans p on p.id = o.plan_id
       where o.id = new.org_id
         and (coalesce((p.features->>'all_modules')::boolean, false) or p.features->'modules' ? new.module))
     and not exists (
      select 1 from companies c join niche_modules nm on nm.category = any(c.business_categories)
       where c.org_id = new.org_id and nm.module = new.module and c.deleted_at is null) then
    raise exception 'Tu plan no incluye el módulo %', new.module;
  end if;
  return new;
end $$;
