-- Negocio del cliente (a qué se dedica): columna, se envía en las filas del cobrador y se guarda al crear el cliente.
alter table public.customers add column if not exists business text;

do $$
declare src text; src2 text; fn text;
begin
  foreach fn in array array['collector_customer_row','collector_day'] loop
    select pg_get_functiondef(p.oid) into src from pg_proc p where p.pronamespace='public'::regnamespace and p.proname=fn;
    src2 := replace(src, '''tax_id'', c.tax_id,', '''tax_id'', c.tax_id, ''business'', c.business,');
    if src2 = src then raise exception '%', fn; end if;
    execute src2;
  end loop;

  select pg_get_functiondef('public.collector_save_customer(uuid,text,text,text,text,text,numeric,numeric,text,text,text,numeric,numeric,uuid)'::regprocedure) into src;
  src2 := replace(src, 'p_offline_uuid uuid DEFAULT NULL::uuid)', 'p_offline_uuid uuid DEFAULT NULL::uuid, p_business text DEFAULT NULL::text)');
  src2 := replace(src2, 'guarantor_name, guarantor_phone, guarantor_address, guarantor_lat, guarantor_lng)', 'guarantor_name, guarantor_phone, guarantor_address, guarantor_lat, guarantor_lng, business)');
  src2 := replace(src2, 'nullif(trim(coalesce(p_g_address, '''')), ''''), p_g_lat, p_g_lng)', 'nullif(trim(coalesce(p_g_address, '''')), ''''), p_g_lat, p_g_lng, nullif(trim(coalesce(p_business, '''')), ''''))');
  if src2 = src or position('p_business, ''''' in src2) = 0 or position(', business)' in src2) = 0 then raise exception 'save_customer'; end if;
  drop function public.collector_save_customer(uuid,text,text,text,text,text,numeric,numeric,text,text,text,numeric,numeric,uuid);
  execute src2;
end $$;
revoke all on function public.collector_save_customer(uuid,text,text,text,text,text,numeric,numeric,text,text,text,numeric,numeric,uuid,text) from public, anon;
grant execute on function public.collector_save_customer(uuid,text,text,text,text,text,numeric,numeric,text,text,text,numeric,numeric,uuid,text) to authenticated;
