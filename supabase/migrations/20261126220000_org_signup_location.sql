alter table public.organizations
  add column if not exists signup_country text,
  add column if not exists signup_city text;
comment on column public.organizations.signup_country is 'País (código ISO) detectado por la conexión al registrarse; solo para soporte y administración de la plataforma.';
comment on column public.organizations.signup_city is 'Ciudad aproximada detectada por la conexión al registrarse; solo para soporte y administración de la plataforma.';
