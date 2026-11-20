# Kit de marca y reglas visuales de Veltrix

Ver en vivo: `/marca` (no aparece en buscadores).

## Colores
Marca `blue-600` (hover `blue-500`, fuerte `blue-700`) · Éxito `emerald-600` · Aviso `amber-500` · Peligro `red-600` · Neutros `slate`. Modo claro y oscuro siempre en pareja (`dark:`).
## Letra
Geist (con Arial de respaldo). Título de página `ui.title` (20 → 24 px, extrabold) · sección `text-lg font-extrabold` · texto `text-sm` · apoyo `text-xs` (mínimo 12 px, nada de `text-[10px]/[11px]`).
## Piezas (usar siempre estas)
- `Card` (`dashboard/shell`): `rounded-2xl`, relleno `p-4` en celular y `p-5` en pantalla grande.
- Botones: `ui.btnPrimary`, `ui.btnGhost`, `ui.btnOk`, `ui.btnDanger` (alto mínimo 44 px en celular).
- `PageTitle`, `Pill` (ok, warn, error, info, neutral), `Loading`, `Empty` (`dashboard/kit`).
## Esquinas, espacios y ancho
Tarjetas `rounded-2xl` · campos y botones `rounded-xl` · píldoras `rounded-full`. Entre bloques `space-y-4`, dentro de listas `space-y-2`. Contenido `max-w-5xl`, formularios `max-w-xl`.
## Equipos modestos y pantallas distintas
Sin desenfoques ni sombras pesadas; sin animación si el equipo pide menos movimiento; campos de 16 px en celular; contenido que nunca se desborda a los lados; se prueba desde 320 px de ancho.
