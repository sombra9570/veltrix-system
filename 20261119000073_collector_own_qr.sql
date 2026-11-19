-- QR de pago propio de cada ruta (lo guarda el cobrador en Ajustes). Si no tiene, se usa el de la sucursal.
alter table public.collection_routes add column if not exists pay_qr_path text;
alter table public.collection_routes add column if not exists pay_qr_note text;

create or replace function public.collector_set_qr(p_route uuid, p_path text, p_note text default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare r record;
begin
  select * into r from collection_routes where id = p_route and collector_id = auth.uid() and deleted_at is null;
  if not found then raise exception 'Ruta no encontrada'; end if;
  if p_path is not null and p_path <> '' and split_part(p_path, '/', 1) <> r.org_id::text then raise exception 'Archivo no válido'; end if;
  update collection_routes set pay_qr_path = nullif(p_path, ''), pay_qr_note = nullif(trim(coalesce(p_note, '')), '') where id = p_route;
end $$;
revoke all on function public.collector_set_qr(uuid, text, text) from public, anon;
grant execute on function public.collector_set_qr(uuid, text, text) to authenticated;

do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.collector_day()'::regprocedure);
  n := replace(d, '''pay_qr'', (select b2.pay_qr_path from branches b2 where b2.id = r.branch_id),',
    '''pay_qr'', coalesce(r.pay_qr_path, (select b2.pay_qr_path from branches b2 where b2.id = r.branch_id)), ''branch_id'', r.branch_id, ''own_qr'', (r.pay_qr_path is not null),');
  n := replace(n, '''pay_qr_note'', (select b2.pay_qr_note from branches b2 where b2.id = r.branch_id),',
    '''pay_qr_note'', case when r.pay_qr_path is not null then r.pay_qr_note else (select b2.pay_qr_note from branches b2 where b2.id = r.branch_id) end,');
  if n = d then raise exception 'sin cambios'; end if;
  execute n;
end $$;
