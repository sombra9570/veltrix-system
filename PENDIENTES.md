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
- [ ] **Merchant of Record** (Lemon Squeezy o Paddle): cuenta y verificación de identidad
- [ ] **Contador en línea** en Bolivia (empresa formal, NIT, cómo declarar los pagos del Merchant of Record)
- [ ] **Google Play**: cuenta de desarrollador (25 USD, pago único) para el APK

## B. Construcción pendiente

### Cobros y legal
- [ ] Conexión de pagos con el Merchant of Record (checkout + webhooks: activar, renovar y suspender solos)
- [ ] Página de precios pública con "+ impuestos"
- [ ] Páginas legales en 12 idiomas: Términos, Privacidad, Reembolsos (las exige el Merchant of Record)
- [ ] Venta de extras: usuarios, sucursales y almacenamiento extra (columnas ya existen, falta precio y pantalla)
- [ ] Paquetes de Veltrix IA con precio (cuando haya consumo real medido)
- [ ] Exportar datos del cliente al cancelar la cuenta

### App
- [ ] **APK Android** (TWA desde la app web + `/.well-known/assetlinks.json`)
- [ ] Programa de referidos ("invita un negocio, gana 1 mes")
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
Plan Piloto/Fundador · Inventario · Reportes
