create or replace function public.mark_street_org() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  if new.business_categories is not null and cardinality(new.business_categories) > 0
     and not exists (select 1 from unnest(new.business_categories) c where c not in ('collections','microfinance')) then
    -- solo cuentas recién creadas: las existentes no se modifican
    update organizations set street_collectors = 1
     where id = new.org_id and street_collectors is null and created_at > now() - interval '1 day';
  end if;
  return new;
end $$;
drop trigger if exists trg_mark_street_org on public.companies;
create trigger trg_mark_street_org after insert or update of business_categories on public.companies for each row execute function public.mark_street_org();
