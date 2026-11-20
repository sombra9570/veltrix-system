# Auditoría visual de pantallas (20 nov 2026)

Solo lectura: no se cambió ninguna pantalla. Alcance: 95 páginas y 154 componentes del panel.

## Lo que ya está bien
- Un solo `ui` (tarjeta, campo, etiqueta, botón principal y secundario) y un `Card` compartido (210 usos).
- Títulos casi iguales: 32 de 40 usan `text-xl font-extrabold sm:text-2xl`.
- Hoja inferior (`Sheet`) compartida: celular = panel inferior, pantalla grande = ventana centrada.
- Textos de "cargando" y "vacío" salen de i18n (82 y 26 usos).

## Inconsistencias medidas
| Tema | Hallazgo |
|---|---|
| Tarjetas | 210 con `Card` y unas 99 armadas a mano con `rounded-xl border…`; solo 7 archivos usan `ui.card` |
| Esquinas | rounded-xl 188, rounded-lg 92, rounded-2xl 24, rounded-3xl 4 (sin regla) |
| Botones | 109 `ui.btnPrimary`, pero 56 `bg-blue-600` a mano en 25 archivos; verdes/rojos/ámbar sueltos |
| Títulos | 5 variantes distintas de h1 (tamaños y pesos) |
| Ancho del contenido | `max-w-*` en 15 sitios con 4 anchos distintos; el resto sin tope |
| Separación vertical | `space-y-1/2/3/4/5` mezclados (75 / 52 / 40 / 26) |
| Etiquetas de estado | 6 combinaciones distintas de píldora (padding y tamaño) |
| Texto muy chico | 103 usos de `text-[10px]/[11px]` (difícil de leer en celular) |
| Zonas táctiles | 25 usos de `h-7/h-8/h-9` (botones chicos para dedo) |
| Cargando | texto "espera" en 82 sitios; solo 5 con spinner/esqueleto |
| Tablas | solo 3 pantallas con `<table`; el resto usa tarjetas (bien para celular) |

## Reglas propuestas (a aprobar)
1. **Esquinas:** tarjetas `rounded-2xl`, campos y botones `rounded-xl`, píldoras `rounded-full`. Nada de `rounded-lg` en tarjetas.
2. **Tarjeta:** siempre `Card` (nunca `div` a mano). Un solo relleno interno: `p-4` en celular, `p-5` en pantalla grande.
3. **Botones:** `ui.btnPrimary` / `ui.btnGhost` y dos más nuevos en `ui`: `btnDanger` (rojo) y `btnOk` (verde). Alto mínimo 44 px en celular.
4. **Título de página:** un componente `PageTitle` (título + subtítulo + acción a la derecha).
5. **Ancho:** contenedor de contenido `max-w-5xl` en computador; formularios `max-w-xl`.
6. **Separación:** `space-y-4` entre bloques; `space-y-2` dentro de una lista.
7. **Estado:** un solo componente `Pill` con 5 tonos (ok, aviso, error, info, neutro).
8. **Texto:** mínimo 12 px (`text-xs`); fuera `text-[10px]` y `text-[11px]`.
9. **Cargando y vacío:** componentes `Loading` (esqueleto) y `Empty` (icono + texto + acción).

## Orden de aplicación sugerido
1. Crear los componentes base (`PageTitle`, `Pill`, `Loading`, `Empty`, botones nuevos).
2. Cobrador y supervisor (celular, calle).
3. Administrador (computador).
4. Caja, mesas, cocina, delivery.
5. Resto de roles y pantallas públicas (registro, tienda, mesa).
Cada paso es un envío aparte, con revisión del tipado y del despliegue.
