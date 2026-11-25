-- El servidor de la app (service_role) conserva acceso a todas las funciones
grant execute on all functions in schema public to service_role;
alter default privileges in schema public grant execute on functions to service_role;
