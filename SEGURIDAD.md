# Veltrix · Mapa de seguridad

Regla: antes de iniciar sesión solo se ve lo que la portada, el registro y la tienda pública necesitan.
Después de iniciar sesión, cada rol ve solo lo suyo; lo que no le corresponde queda oculto en el menú **y** bloqueado en el servidor.
Revisión: 18 nov 2026.

## 1. Visible SIN iniciar sesión (a propósito)

| Qué | Para qué |
|---|---|
| Páginas `/`, `/ingresar`, `/registro`, `/restablecer`, `/terminos`, `/privacidad`, `/reembolsos`, `/pagar` | Portada, entrada, registro, legales y enlace de pago |
| `/tienda/[slug]` + función `public_store` | Tienda pública de cada negocio (solo lo que el negocio publicó) |
| Funciones `public_plans`, `public_addons` | Precios en la portada |
| Función `referral_valid` | Comprobar un código de invitación al registrarse |
| `perm_catalog`, `perm_default` | Listas fijas sin datos de clientes |
| Tabla `plans` (solo lectura) | Planes en la portada |
| Carpeta de fotos `store-images` (pública) | Fotos de productos de la tienda pública |
| `/api/fx/bob`, `/api/geo` | Tipo de cambio y país del visitante (sin datos privados) |

Todo lo demás exige sesión.

## 2. Solo con sesión, y el servidor revisa quién eres

- **Tablas**: todas tienen reglas por fila (RLS). Ninguna tabla se puede leer sin sesión.
- **17 tablas internas** (préstamos, cajas de ruta, comprobantes de pago, uso de IA, etc.) no tienen ninguna regla de lectura directa:
  solo se usan a través de funciones que revisan permisos. Es lo correcto.
- **Vistas** (saldos, stock, comisiones): todas corren con los permisos de quien consulta (`security_invoker`).
- **Funciones**: cada una revisa por dentro el rol (administrador, gerente, almacenero, cobrador…) y el permiso delegado.
- **Carpetas privadas**: `customer-files` (documentos de clientes), `chat-files`, `billing-proofs`, `inventory-files`.
- **Rutas del servidor** (`/api/workers`, `/api/workers/password`, `/api/email`, `/api/ai`, `/api/billing/*`): exigen sesión y
  verifican administrador o superadmin. El aviso de Paddle exige firma válida. La clave secreta de Supabase solo vive en Vercel.

## 3. Menú por rol

- Administrador: el menú se filtra por los rubros activos de su empresa (`module`), lo demás no aparece.
- Cada trabajador: menú propio en `src/app/dashboard/role-nav.ts`; un rol propio suma solo las pantallas de los roles que cubre.
- Aunque alguien escriba a mano la dirección de una pantalla ajena, el servidor no le entrega datos.

## 4. Cambios de esta revisión

- [x] `set_owner_roles`, `bootstrap_company`, `enforce_plan_roles`: ya no se pueden llamar sin sesión.
- [ ] `set_branch_stock`: revisar el permiso **antes** de crear el almacén por defecto (hoy lo crea y recién después revisa).
- [ ] `guard_profile_org` (control interno): quitar acceso sin sesión.
- [ ] `perm_catalog`: fijar `search_path` (aviso menor de Supabase).
- [ ] Supabase → Authentication: activar "protección de contraseñas filtradas" (lo hace el dueño en el panel).

## 5. Riesgo bajo aceptado

- `customer_open_balance` / `installment_paid`: cualquier usuario con sesión podría pedir el saldo de una cuota o cliente si conoce
  su identificador interno (UUID de 36 caracteres, imposible de adivinar). Se usan en las vistas de saldos, por eso siguen abiertas
  a usuarios con sesión.
- `billing_transfer_info`: los datos bancarios de Veltrix para pagar la suscripción los ve cualquier usuario con sesión.
