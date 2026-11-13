-- Veltrix: el service_role (solo servidor) puede ejecutar todas las funciones públicas.
grant execute on all functions in schema public to service_role;
alter default privileges in schema public grant execute on functions to service_role;
