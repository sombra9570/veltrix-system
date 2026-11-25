# Migraciones de la base de datos

`supabase/migrations/` es el registro completo y ordenado de todo lo aplicado en Supabase (166 migraciones, generado desde
`supabase_migrations.schema_migrations`). Es la fuente de verdad: reconstruir la base = aplicar estos archivos en orden de nombre.

Los archivos `0001`–`0005` de la carpeta raíz (`20261112000001_core.sql` … `20261113000005_business_categories.sql`) son anteriores al
registro de Supabase y siguen siendo necesarios como punto de partida. Los demás `.sql` de la raíz son copias antiguas de lo que ya
está en esta carpeta; se conservan sin cambios.

Regla: toda migración nueva se aplica en Supabase y se guarda aquí con el mismo nombre y versión que le asigne Supabase.
