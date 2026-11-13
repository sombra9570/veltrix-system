'use client';
import Link from 'next/link';
import { useVeltrixAuth, homeForRole } from './auth-system';
import { useLanguage } from './language-selector';
import { BUSINESS_KINDS, categoriesForKind } from './business-catalog';
import { SiteHeader, SiteFooter, ui } from './site-header';

const FEATURES = [
  { icon: '🧾', title: 'Ventas y punto de venta', desc: 'Cobra en mostrador, en mesa o a domicilio. Contado, crédito, QR o efectivo.' },
  { icon: '💵', title: 'Caja con arqueo ciego', desc: 'El cajero declara lo que contó sin ver lo esperado. Cuadres sin trampas.' },
  { icon: '🛵', title: 'Créditos y cobranza en calle', desc: 'Rutas para cobradores, cobro sin internet y rendición diaria al cajero.' },
  { icon: '📦', title: 'Inventario y compras', desc: 'Stock por almacén, costo promedio, proveedores y alertas de faltantes.' },
  { icon: '🍽️', title: 'Restaurante y talleres', desc: 'Mesas, cocina y cuenta dividida. Órdenes de trabajo para talleres y servicios.' },
  { icon: '📊', title: 'Reportes por sucursal', desc: 'Ganancias, deudas y comisiones de todas tus sucursales en un solo panel.' },
];

const PLANS = [
  { name: 'Starter', usd: 35, desc: 'Para un negocio que empieza', items: ['Punto de venta', 'Inventario', '1 sucursal'] },
  { name: 'Pro', usd: 60, desc: 'Para negocios en crecimiento', items: ['Todo lo de Starter', 'Compras y finanzas', 'Créditos y cobranza en calle'], best: true },
  { name: 'Enterprise', usd: 199, desc: 'Para empresas con varias sucursales', items: ['Todos los módulos', 'Sucursales ilimitadas', 'Soporte prioritario'] },
];

export default function HomePage() {
  const { loaded, session } = useVeltrixAuth();
  const { formatMoney } = useLanguage();

  return (
    <main className="flex min-h-screen flex-col">
      <SiteHeader showAuthButtons={!(loaded && session)} />

      {/* PORTADA */}
      <section className="mx-auto w-full max-w-6xl px-4 pt-16 pb-12 text-center">
        <span className="rounded-full border border-blue-300 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300">
          Control financiero para tu negocio
        </span>
        <h1 className="mx-auto mt-5 max-w-3xl text-4xl font-extrabold tracking-tight md:text-5xl">
          Ventas, caja, inventario y cobranza{' '}
          <span className="text-blue-600 dark:text-blue-500">en un solo lugar</span>
        </h1>
        <p className={`mx-auto mt-4 max-w-2xl text-base ${ui.muted}`}>
          Para tiendas, distribuidoras, restaurantes, talleres y negocios de préstamos.
          Cada trabajador ve solo lo suyo y tú controlas todo.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {loaded && session ? (
            <Link href={homeForRole(session.role)} className={`${ui.btnPrimary} px-7 py-3`}>Ir a mi panel →</Link>
          ) : (
            <>
              <Link href="/registro" className={`${ui.btnPrimary} px-7 py-3`}>Probar 14 días gratis</Link>
              <Link href="/ingresar" className={`${ui.btnGhost} px-7 py-3`}>Ya tengo cuenta</Link>
            </>
          )}
        </div>
        <p className={`mt-3 text-xs ${ui.muted}`}>Sin tarjeta · Cancela cuando quieras</p>
      </section>

      {/* PARA QUÉ NEGOCIOS */}
      <section className="mx-auto w-full max-w-6xl px-4 py-10">
        <h2 className="text-center text-2xl font-extrabold">Hecho para tu tipo de negocio</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {BUSINESS_KINDS.filter((k) => k.id !== 'mixed').map((k) => (
            <div key={k.id} className={`rounded-2xl p-5 ${ui.card}`}>
              <p className="text-lg font-bold">{k.icon} {k.label}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {categoriesForKind(k.id).map((c) => (
                  <span key={c.id} className="rounded-full border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300">
                    {c.icon} {c.label}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className={`mt-3 text-center text-xs ${ui.muted}`}>¿Vendes productos y además das servicios? Elige “Mixto” al registrarte.</p>
      </section>

      {/* FUNCIONES */}
      <section className="mx-auto w-full max-w-6xl px-4 py-10">
        <h2 className="text-center text-2xl font-extrabold">Todo lo que necesitas para controlar tu dinero</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className={`rounded-2xl p-5 ${ui.card}`}>
              <p className="text-2xl">{f.icon}</p>
              <p className="mt-2 font-bold">{f.title}</p>
              <p className={`mt-1 text-sm ${ui.muted}`}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* PLANES */}
      <section className="mx-auto w-full max-w-6xl px-4 py-10">
        <h2 className="text-center text-2xl font-extrabold">Planes</h2>
        <p className={`mt-1 text-center text-sm ${ui.muted}`}>Empieza con 14 días gratis con todo incluido. Después eliges tu plan.</p>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {PLANS.map((p) => (
            <div
              key={p.name}
              className={`relative rounded-2xl p-6 ${ui.card} ${p.best ? 'ring-2 ring-blue-500' : ''}`}
            >
              {p.best && (
                <span className="absolute -top-3 left-6 rounded-full bg-blue-600 px-3 py-0.5 text-[11px] font-bold text-white">
                  Más elegido
                </span>
              )}
              <p className="text-lg font-bold">{p.name}</p>
              <p className={`text-xs ${ui.muted}`}>{p.desc}</p>
              <p className="mt-4 text-3xl font-extrabold">
                {formatMoney(p.usd)}
                <span className={`text-sm font-semibold ${ui.muted}`}> / mes</span>
              </p>
              <ul className="mt-4 space-y-1.5 text-sm">
                {p.items.map((i) => (
                  <li key={i}>✓ {i}</li>
                ))}
              </ul>
              <Link href="/registro" className={`${p.best ? ui.btnPrimary : ui.btnGhost} mt-6 w-full`}>
                Empezar gratis
              </Link>
            </div>
          ))}
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
