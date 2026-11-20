'use client';
// Kit de piezas visuales de Veltrix: título de página, estado (píldora), cargando y vacío.
// Usar siempre estas piezas en vez de armarlas a mano. Reglas completas en BRAND_KIT.md.
import { ui } from '../site-header';

/** Título de página: título + subtítulo opcional + acción a la derecha (baja a otra línea en celulares angostos) */
export function PageTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <h1 className={`break-words ${ui.title}`}>{title}</h1>
        {subtitle && <p className={`mt-0.5 ${ui.subtitle}`}>{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export type Tone = 'ok' | 'warn' | 'error' | 'info' | 'neutral';

const TONES: Record<Tone, string> = {
  ok: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  warn: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  error: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300',
  info: 'bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300',
  neutral: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

/** Etiqueta de estado. Un solo tamaño, cinco tonos. */
export function Pill({ tone = 'neutral', children }: { tone?: Tone; children: React.ReactNode }) {
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold ${TONES[tone]}`}>{children}</span>;
}

/** Esqueleto de carga: liviano (sin sombras ni desenfoque) y sin animación si el equipo pide menos movimiento */
export function Loading({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2" role="status" aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-14 animate-pulse rounded-2xl bg-slate-200 motion-reduce:animate-none dark:bg-slate-800" style={{ opacity: 1 - i * 0.18 }} />
      ))}
    </div>
  );
}

/** Pantalla o lista vacía: icono + texto + acción opcional */
export function Empty({ icon = '📭', title, hint, action }: { icon?: string; title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className={`rounded-2xl p-6 text-center ${ui.card}`}>
      <p className="text-3xl" aria-hidden>{icon}</p>
      <p className="mt-2 text-sm font-bold">{title}</p>
      {hint && <p className={`mt-1 text-xs ${ui.muted}`}>{hint}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
