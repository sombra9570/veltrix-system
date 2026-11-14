# Veltrix · Pendientes

Lista viva de lo que falta. Se actualiza cada vez que algo se termina o aparece algo nuevo.
Última revisión: 13 nov 2026.

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
- [ ] **Panel del supervisor** con sus propios permisos, deberes y aprobaciones (préstamos, reversos, límites)
- [ ] **Notificaciones push en vivo** (préstamo por aprobar, pago recibido, tarjeta en rojo) — requiere llaves VAPID en Vercel
- [ ] **Borrar o reprogramar cuotas** de un préstamo con permiso (hoy se puede anular el préstamo completo sin cobros)

### Cobros y legal
- [x] Conexión de pagos con Paddle (pago, avisos, cambio de plan, descuentos de fundador y referidos automáticos) — faltan las claves
- [x] Precios con "+ impuestos" y precio regional (Latinoamérica / internacional)
- [x] Páginas legales: Términos, Privacidad, Reembolsos (español oficial + inglés)
- [ ] Pantalla "Mi plan" para el dueño — hecha; probar con un pago real
- [ ] Venta de extras: usuarios, sucursales y almacenamiento extra (columnas ya existen, falta precio y pantalla)
- [ ] Paquetes de Veltrix IA con precio (cuando haya consumo real medido)
- [ ] Exportar datos del cliente al cancelar la cuenta

### App
- [ ] **APK Android** (TWA desde la app web + `/.well-known/assetlinks.json`)
- [x] Programa de referidos (30 días al invitado, 1 mes gratis al que invita cuando paga)
- [ ] Panel del **supervisor** (hoy usa pantallas del dueño)
- [ ] Pantallas del **almacenero** y del **contador** (roles existen, sin panel propio)
- [ ] Pagos a proveedores / cuentas por pagar
- [ ] Transferencias de stock entre sucursales (la función existe, falta pantalla)
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
Plan Piloto/Fundador · Inventario · Reportes · Editor de planes · Borrar empresas de prueba · Permisos por rol/usuario · Nueva portada · Mi plan y cobros (falta conectar claves) · Páginas legales
