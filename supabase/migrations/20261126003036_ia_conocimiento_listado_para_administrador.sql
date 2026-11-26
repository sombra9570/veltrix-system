-- Listado de la biblioteca de conocimiento de Veltrix IA para el administrador de la plataforma (la tabla no es legible directamente)
create or replace function public.admin_list_ai_knowledge()
 returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not is_platform_admin() then raise exception 'Sin permiso'; end if;
  return coalesce((select jsonb_agg(to_jsonb(k) - 'created_by' order by k.updated_at desc) from ai_knowledge k), '[]'::jsonb);
end $$;
revoke all on function public.admin_list_ai_knowledge() from public, anon;
grant execute on function public.admin_list_ai_knowledge() to authenticated;
