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

## Hecho
Panel del dueño · Caja · POS · Clientes y crédito · Cobrador offline · Restaurante · Taller ·
Tienda online · Mensajes del equipo · Ayuda · Veltrix IA (falta la clave) · Ventas · Caja del dueño ·
Plan Piloto/Fundador · Inventario · Reportes · Editor de planes · Borrar empresas de prueba · Permisos por rol/usuario · Nueva portada · Mi plan y cobros (falta conectar claves) · Páginas legales · Panel supervisor · Préstamos en calle y caja de ruta · Demo Dfg coorp cargada · Roles filtrados por módulos
