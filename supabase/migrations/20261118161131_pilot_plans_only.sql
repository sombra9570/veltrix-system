create or replace function create_organization(p_org_name text, p_billing_email text, p_plan_code text, p_full_name text, p_legal_name text, p_country character, p_currency character, p_tax_id text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_plan uuid;
begin
  if auth.uid() is null then raise exception 'Debe iniciar sesión'; end if;
  if exists (select 1 from profiles where id = auth.uid() and org_id is not null) then
    raise exception 'Este usuario ya pertenece a una organización';
  end if;
  -- El piloto de 14 días corre solo en los planes chicos; los grandes se contratan después
  if p_plan_code not in ('basic','starter','pro') then raise exception 'El piloto solo está disponible en Básico, Startup o Empresa'; end if;
  select id into v_plan from plans where code = p_plan_code and is_active;
  if v_plan is null then raise exception 'Plan inexistente'; end if;

  insert into organizations (name, billing_email, plan_id, trial_ends_at, next_billing_date)
  values (p_org_name, p_billing_email, v_plan, now() + interval '14 days', (current_date + 14))
  returning id into v_org;

  insert into profiles (id, org_id, full_name) values (auth.uid(), v_org, p_full_name)
  on conflict (id) do update set org_id = excluded.org_id, full_name = excluded.full_name;

  insert into memberships (org_id, user_id, role, created_by) values (v_org, auth.uid(), 'owner', auth.uid());
  insert into companies (org_id, legal_name, tax_id, country_code, base_currency, created_by)
  values (v_org, p_legal_name, p_tax_id, p_country, p_currency, auth.uid());
  return v_org;
end $$;
