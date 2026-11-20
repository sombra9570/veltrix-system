# Veltrix · Pendientes

Lista viva de lo que falta. Se actualiza cada vez que algo se termina o aparece algo nuevo.
Última revisión: 19 nov 2026.

## A. Necesitan que intervenga el dueño (claves, cuentas, DNS, pagos)

- [ ] **Resend**: crear cuenta y verificar el dominio veltrixsystem.app (región sa-east-1)
- [ ] **Porkbun**: registros DNS de Resend + reenvío de hola@veltrixsystem.app al Gmail de Veltrix
- [ ] **Vercel**: variables `RESEND_API_KEY`, `EMAIL_FROM` ("Veltrix <hola@veltrixsystem.app>"), `EMAIL_REPLY_TO`
- [ ] **Supabase SMTP propio** (smtp.resend.com, puerto 465, usuario `resend`) → después: plantillas de correo de acceso en español con la marca
- [ ] **Anthropic**: cuenta, crédito y `ANTHROPIC_API_KEY` en Vercel (enciende Veltrix IA)
- [ ] **Supabase**: activar protección de contraseñas filtradas
- [ ] **Vercel Pro** antes del primer cliente que pague (Hobby no permite uso comercial)
- [ ] **Paddle** (Merchant of Record): cuenta y verificación (primero en modo sandbox para probar)
      - Catálogo: producto "Veltrix" con 6 precios mensuales (Starter, Pro, Enterprise × Latinoamérica e internacional)
      - Extras: producto "Extras Veltrix" con 6 precios mensuales por unidad: usuario 3/4, sucursal 10/15,
        +5 GB 3/4 USD (Latinoamérica/internacional). Si cambias precios en el panel, cámbialos también aquí
      - Descuentos: fundador 50 % recurrente 12 meses; referidos 15 %, 20 % y 30 % de UN solo cobro
      - Checkout → "Default payment link": `https://veltrixsystem.app/pagar`
      - Notificaciones → destino `https://veltrixsystem.app/api/billing/webhook` con eventos subscription.* y
        transaction.completed / transaction.payment_failed
- [ ] **Vercel**: `PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET`, `PADDLE_ENV` (sandbox al probar), `PADDLE_PRICES`,
      `PADDLE_FOUNDER_DISCOUNTS`, `PADDLE_REFERRAL_DISCOUNTS`, `PADDLE_ADDON_PRICES`, `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`,
      `SUPABASE_SERVICE_ROLE_KEY` (solo en Vercel)
- [ ] **Abogado**: revisar Términos, Privacidad y Reembolsos (borrador publicado en la web)
- [ ] **Contador en línea** en Bolivia (empresa formal, NIT, cómo declarar los pagos del Merchant of Record)
- [ ] **Google Play**: cuenta de desarrollador (25 USD, pago único) para el APK

## B. Construcción pendiente
- [x] **Panel del supervisor**: rutas y cajas, cobrado/prestado por día, cierres, inversión y aprobación de préstamos según permisos
- [ ] **Notificaciones push en vivo** (préstamo por aprobar, pago recibido, tarjeta en rojo) — requiere llaves VAPID en Vercel
- [x] **Reprogramar cuotas** pendientes con permiso (anular préstamo sin cobros ya existía)
- [x] **Comprobante por WhatsApp** al cobrar en calle (botón con el recibo listo; versión automática requiere API de WhatsApp Business, de pago)
- [x] **GPS en cada cobro** + recorrido del día con mapa (supervisor y administrador)
- [x] Comprobante por WhatsApp también en caja (POS) y en taller (taller: estado de la orden al cliente)
- [x] Orden de despacho: vendedor → caja → almacenero ve qué entregar (migración 054)
- [x] Taller: fotos de recepción, firma del cliente y estado por WhatsApp (migración 057)
- [x] QR del negocio en pantalla al cobrar + foto del comprobante (migración 057; QR Simple dinámico requiere convenio bancario)
- [x] Delivery: efectivo del repartidor (modo ninguno / solo envío / todo), recepción en caja con turno abierto, encargos y mensajería, mapa con calles y satélite (migración 060, foto del estado vivo)
- [x] Equipo: editar rol/sucursal de un trabajador (`set_member_role`) y roles propios con los roles que cubren, según el plan
- [x] Menú del dueño agrupado: Hoy / Vender y cobrar / Mi negocio / Reportes / Equipo / Cuenta
- [x] Mapa MapTiler (`NEXT_PUBLIC_MAPTILER_KEY` en Vercel). OJO: el plan gratis de MapTiler es solo no comercial → pasar a Flex (25 USD/mes) cuando cobre el primer cliente
- [ ] Menú y pantalla de inicio claros para cada rol (repartidor, caja, mesero, cocina): 3–4 opciones; hace falta crear cuentas de prueba de repartidor y caja
- [ ] Delivery: QR de pago para el cliente, asignar pedido a un repartidor concreto y ver su posición en vivo
- [ ] Restaurante, etapa 3: stock y disponibilidad de platos y bebidas
- [ ] Prueba piloto Enterprise y estado de solo lectura "pendiente de pago" al terminar la prueba
- [ ] Limitar `admin_purge_org` a pedidos del cliente (no se borran datos de clientes sin su consentimiento; solo los mensajes del chat se borran solos)
- [ ] Migraciones aplicadas por MCP sin archivo en el repo (permissions_phase1/2, custom_roles, plan_custom_roles_v2, roles_*, delivery_zones_orders, etc.): volcar su estado como se hizo en la 060
- [ ] Demo pública que se reinicia cada noche (no usar las cuentas de auditoría)
- [ ] Sección de seguridad y 4 rubros en la portada; más roles en la vitrina; video de 60–120 s
- [ ] Reporte consolidado de todas las empresas en una moneda (USD u otra) con tipo de cambio del día — ADICIONAL: se mantiene la vista por empresa y por sucursal en su moneda
- [x] Cuentas financieras: banco/caja general/billetera en Inventario → Proveedores (migración 053)
- [ ] Copias de seguridad diarias garantizadas al pasar a Supabase Pro (recién ahí prometerlas)

### Cobros y legal
- [x] Conexión de pagos con Paddle (pago, avisos, cambio de plan, descuentos de fundador y referidos automáticos) — faltan las claves
- [x] Precios con "+ impuestos" y precio regional (Latinoamérica / internacional)
- [x] Páginas legales: Términos, Privacidad, Reembolsos (español oficial + inglés)
- [ ] Pantalla "Mi plan" para el dueño — hecha; probar con un pago real
- [ ] Venta de extras: usuarios, sucursales y almacenamiento extra (columnas ya existen, falta precio y pantalla)
- [ ] Paquetes de Veltrix IA con precio (cuando haya consumo real medido)
- [x] Exportar datos del cliente (.zip con CSV en Mi plan)

### App
- [ ] **APK Android** (TWA desde la app web + `/.well-known/assetlinks.json`)
- [x] Programa de referidos (30 días al invitado, 1 mes gratis al que invita cuando paga)
- [x] Pantallas del **almacenero** y del **contador**
- [x] Pagos a proveedores: saldo por compra y botón Pagar (total o parcial) (migración 053)
- [x] Traspasos entre sucursales: pestaña Traspasar en Inventario, varios productos a la vez (migración 053)
- [ ] Página de ajustes de módulos del dueño (activar/desactivar rubros)
- [ ] Consola superadmin: estilo claro/oscuro y traducción
- [ ] Insignia de mensajes no leídos: mejoras
- [ ] Borrar fotos del chat al vencer la retención
- [ ] Facturación electrónica de Bolivia (Impuestos Nacionales) — evaluar

### Pruebas en el mundo real
- [ ] Cobrador sin internet en un celular real, en la calle
- [ ] Tienda online pública en vivo (compartir link, pedido por WhatsApp)
- [ ] Veltrix IA respondiendo (cuando esté la clave)
- [ ] Pilotos: accesorios de celular, restaurante, cobradores de calle

## C. Ventas y marketing
- [ ] Guion de venta en persona + respuestas a objeciones
- [ ] Mensajes de WhatsApp y publicaciones para redes (12 idiomas)
- [ ] Guiones de videos cortos (cobro offline, cierre de caja a ciegas)
- [ ] Caso de éxito con números reales de los pilotos

## Auditoría de calidad y costos (19 nov 2026)
- Hecho: funciones internas cerradas para usuarios sin sesión (mig. 062); índices en tablas de más movimiento (mig. 063); delivery con límite de efectivo, asignación y reporte (mig. 061).
- Costos fijos antes del primer cliente que paga: Supabase Pro (~$25/mes, servidor siempre encendido), Vercel Pro ($20/usuario/mes; el plan gratis es solo no comercial y se pausa al pasar límites), MapTiler Flex (~$25/mes). Activar aviso de gasto máximo en Vercel y Supabase. Verificar en qué plan está hoy cada uno.
- Revisado y correcto: las 28 tablas con RLS sin políticas solo se tocan por funciones o por el servidor (intencional); admin_purge_org exige superadmin, nombre exacto y no permite borrar la propia organización.
- Estado de planes: Supabase, Vercel y MapTiler están en gratis. Pasar Supabase y Vercel a Pro (~$45/mes, con copias de seguridad) el día que arranque el primer piloto real.
- Dinero revisado (19 nov): 10 verificaciones de consistencia sin fallas en los datos actuales; corregido riesgo de doble cobro simultáneo sobre una cuota (mig. 064). Cierre de ruta, corte de caja y cobro durante cierre de turno bloqueados contra dobles ejecuciones (mig. 065). Reversos: un pago solo se reversa una vez (índice único + verificaciones, mig. 066); anular venta no choca con cobros; pago a proveedor sin monto nulo. Dinero: auditoría de funciones terminada.
- Sin internet (19 nov): los cobros/visitas/gastos que el servidor rechaza ya no se borran: quedan en "rechazados" con el motivo para reintentar o descartar; los cortes por tiempo/señal lenta se reintentan en vez de descartarse (la detección ya no confunde montos 502/503/504 con caídas). Mesas: el envío a cocina no se duplica al reintentar (mig. 067; la tabla table_send_batches crece un registro por envío: limpiar los de más de 7 días cuando haya volumen). Pedidos públicos (QR de mesa y tienda) no se duplican con doble toque (mig. 068). Cocina/delivery con señal lenta revisado. Prueba de carga (19 nov, datos sintéticos 200x revertidos: ~4.800 pedidos, 42.000 cuotas, 14.000 pagos): resumen del dueño 14 ms, mis ventas 30 días 25 ms, caja 4 ms, listado de clientes 568 ms, conteo de pedidos con seguridad por fila 398 ms. Listado de clientes rehecho en una sola pasada (mig. 069): 574 -> 18 ms con resultado idéntico. La política de lectura de pedidos queda como está (la app usa funciones optimizadas).
- Por revisar: ~95 índices de llaves foráneas restantes (tablas pequeñas), política custom_roles_read (rendimiento), logs de base de datos, pruebas de carga con muchos usuarios, consistencia código/BD y textos sin traducir.

## Hecho
Panel del dueño · Caja · POS · Clientes y crédito · Cobrador offline · Restaurante · Taller ·
Tienda online · Mensajes del equipo · Ayuda · Veltrix IA (falta la clave) · Ventas · Caja del dueño ·
Plan Piloto/Fundador · Inventario · Reportes · Editor de planes · Borrar empresas de prueba · Permisos por rol/usuario · Nueva portada · Mi plan y cobros (falta conectar claves) · Páginas legales · Panel supervisor · Préstamos en calle y caja de ruta · Demo Dfg coorp cargada · Roles filtrados por módulos
- Auditoría BD (19 nov, cierre): 62 índices de claves foráneas simples agregados y política custom_roles_read optimizada (mig. 070). Quedan sin índice 36 FK compuestas (org+empresa+sucursal), solo afectan al borrar sucursales. Logs de Postgres de 24 h: sin errores reales (solo mis pruebas). Advertencias de seguridad restantes son de diseño: funciones públicas (QR, tienda, planes) y RPC con permisos internos. 15 tablas con 2 políticas de lectura (lectura+escritura) se pueden unir cuando haya volumen.

## Panel del cobrador de calle (rehecho, 19 nov)
- Encabezado fijo: nombre/ruta, antena (verde sincronizado / amarillo sin internet / rojo pendiente; al tocarla sube), menú, atrás, cerrar sesión.
- Pantalla principal con resumen (inversión, caja anterior/actual, cobrado y prestado día/semana, gastos, cartera si hay permiso) y botones: cercanos (100 m), lista, pendientes, cliente nuevo, crédito nuevo, gastos, ajustes, liquidar.
- Migración 071 (columnas de garante, avisos de ruta, permisos collector.portfolio y collector.settings).
- Falta: verificar en pantalla con una "Ruta prueba" asignada a Diego; interfaz del administrador para enviar avisos (RPC admin_route_notice ya existe); push real.

## Panel del administrador de cobranza (hecho, falta probar con datos)
- Menú: "Rutas de cobro" desplegable con rutas activas; pantalla de ruta con Lista de clientes, Clientes en mapa, Información, Liquidar y Ajustes (permisos por ruta, migración 075).
- Reportes: liquidaciones anteriores + reportes del supervisor (RPC supervisor_report existe; falta el botón de enviar en el panel del supervisor).
- Permisos: sin topes, vendedor, contador ni excepciones por persona; cajero = "Liquidador" (permisos por definir).
- Pendiente: probar con 3 clientes de prueba (diario/semanal/mensual), panel del supervisor con inicio y barra integrada, bloque Supervisor en Permisos.

## Lecturas y avisos (20 nov)
- Sin consultas por reloj: `useSync` ahora es solo manual (al abrir, ↻ y al volver la señal). Mesas, cocina, delivery, despacho, aprobaciones, mensajes y pedidos públicos se actualizan por aviso en vivo (Realtime, migración 086: triggers `live_ping*` → temas `org:<org>:<tipo>`, `req:<id>`, `plat:<user>`). Respaldo lento de 90 s solo en pedidos públicos en curso.
- Cobrador: reconciliación con el servidor cada 100 acciones (antes 25).
- Fotos de tienda/carta: miniatura (~15 KB, archivo `-t`) para listas; la grande al tocar. Las fotos antiguas se completan solas la primera vez que el dueño abre Tienda; mientras tanto la lista usa la grande.
- Pantallas del administrador de cobranza (ruta, préstamos): tras una acción solo se vuelve a leer lo que cambió.
- Falta: fotos de clientes/garantes (bucket privado) con miniatura; auditar el resto de pantallas del dueño.

## Registro como test y avisos al superadmin (20 nov, migración 087)
- Registro por preguntas (qué vende → cuántos negocios → sucursales → rubro por grupos compatibles → equipo → detalles → resumen → cuenta), "No estoy seguro" en cada pregunta; 3 o más dudas = formulario de ayuda (tabla `support_leads`) en vez de crear empresa. 12 idiomas.
- Superadmin/servicio al cliente: campanita (solicitudes, empresas nuevas, mensajes de clientes) y pestaña "Solicitudes".
- Falta: push real con la app cerrada, correo de respaldo (Resend gratis: verificar dominio en Porkbun), separar de verdad varios negocios en un mismo administrador.

## Aceptación de términos y aviso de IA (20 nov, migración 088)
- Registro: casilla obligatoria "Acepto Términos y Privacidad"; al crear la empresa se llama `accept_terms('2026-11')` y queda `organizations.accepted_terms_at` + `terms_version`.
- Panel IA: aviso "verifica las cifras con tu contador" en los 12 idiomas.
- Falta: textos legales con precios reales ($12/$25/$49/$129/$235) y revisión de abogado (Bolivia y Colombia, Ley 1581).

## Referidos solo con descuento y tope de extras (20 nov, migración 089)
- Premios por invitado que paga: 15 %, 20 %, 30 % y del 4.º en adelante 30 % otra vez. Se quitaron los usuarios de regalo.
- Usuarios extra comprables por plan: Startup 1, Empresa 3, Enterprise 5, Enterprise Plus 25 (antes 15). Básico no tiene.
- Precio del extra = precio del plan / límite + 2 USD (se ajusta solo al cambiar precios de planes).
- Pendiente de decidir: nuevos precios de planes (propuesta: $13/$25/$55/$145/$265 local) y textos legales.

## Precios nuevos aplicados (20 nov)
- Planes (local / global USD): Básico 13/24, Startup 25/49, Empresa 55/95, Enterprise 145/275, Enterprise Plus 265/485 (E+ ahora con todos los módulos).
- Extras: fórmula precio del plan ÷ límite + 2 USD; storage +5 GB 3/4. Términos (es/en): SIN precios fijos; dicen que pueden variar por términos y costos de operación, con aviso de 15 días y derecho a cancelar. Chat por plan: 15/30/90/120/365 días (Básico/Startup/Empresa/Enterprise/Plus).
- Paddle: todavía no vinculado, nada que cambiar allá. Textos legales solo existen en es y en; falta traducirlos a los otros 10 idiomas (después de la revisión del abogado).
- Falta: IA (clave de Claude o Gemini, cupo por plan) y revisión de abogado.

## Kit de marca (20 nov)
- Paso 1 hecho: `BRAND_KIT.md`, página `/marca`, piezas `dashboard/kit.tsx` (PageTitle, Pill, Loading, Empty), botones `btnDanger`/`btnOk`/alto 44 px, `Card` p-4/p-5, tokens de color y sin animación si el equipo lo pide.
- Siguiente: aplicar por grupos (cobrador/supervisor → administrador → caja/mesas/cocina/delivery → resto), reemplazando tarjetas y botones a mano, subiendo texto de 10-11 px a 12 px y probando desde 320 px.

## Info de ruta del cobrador (2026-11-20)
- Quitado "Información de ruta" del menú lateral (queda la tarjeta de la pantalla principal).
- Página rehecha: cifras del período abierto (desde el último cierre/liquidación), botones Diario/Semanal, listas desplegables de clientes con pagos y de préstamos/créditos.
- Semanal = todo lo que paga cada más de 3 días (incluye quincenal/mensual). Pendiente si se quiere separar.
- Cobrado/prestado/comisión cambian con el botón; caja anterior, inversión y gastos son de toda la ruta.
- Sin verificar en pantalla.

## Cliente nuevo: datos obligatorios (2026-11-20)
- Obligatorios: nombre completo, CI, celular, dirección, ubicación GPS y casilla de autorización; fotos según los permisos existentes de la ruta ("Crédito sin foto del cliente" / "sin fotos del carnet"; apagados = obligatorias). No deja guardar hasta completar.
- El servidor exige CI/celular/dirección/GPS; la autorización y las fotos se validan solo en la pantalla (las fotos se suben después de crear al cliente).
- Sin verificar en pantalla.
