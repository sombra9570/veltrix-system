
do $$
declare d text;
begin
  d := pg_get_functiondef('public.perm_default'::regproc);
  if d not like '%products.create%' then
    d := replace(d, 'when p_key = ''inv.photo''', 'when p_key in (''products.create'', ''products.edit'', ''products.price'', ''products.delete'', ''inv.receive'', ''inv.adjust'', ''inv.purchase'', ''inv.transfer'') then p_role in (''supervisor'', ''storekeeper'')' || chr(10) || '              when p_key = ''inv.photo''');
    execute d;
  end if;
end $$;
