'use client';
import { ui } from '../site-header';
import { Card } from '../dashboard/shell';
import { PageTitle, Pill, Loading, Empty } from '../dashboard/kit';

const SWATCHES: [string, string, string][] = [
  ['Marca', 'bg-blue-600', 'Botones principales, enlaces, selección'],
  ['Marca fuerte', 'bg-blue-700', 'Al pasar el cursor, títulos de marca'],
  ['Éxito', 'bg-emerald-600', 'Cobrado, pagado, completado'],
  ['Aviso', 'bg-amber-500', 'Pendiente, por vencer'],
  ['Peligro', 'bg-red-600', 'Eliminar, vencido, error'],
  ['Texto', 'bg-slate-900', 'Texto principal (modo claro)'],
  ['Texto suave', 'bg-slate-500', 'Ayudas y subtítulos'],
  ['Fondo oscuro', 'bg-slate-950', 'Fondo del modo oscuro'],
];

export default function BrandKit() {
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <PageTitle title="Kit de marca Veltrix" subtitle="Colores, letra y piezas que se usan en todas las pantallas." />

      <section className="space-y-3">
        <h2 className="text-lg font-extrabold">Colores</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {SWATCHES.map(([name, cls, use]) => (
            <div key={name} className={`rounded-2xl p-3 ${ui.card}`}>
              <div className={`h-12 rounded-xl ${cls}`} />
              <p className="mt-2 text-sm font-bold">{name}</p>
              <p className={`text-xs ${ui.muted}`}>{use}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-extrabold">Letra</h2>
        <Card>
          <p className="text-2xl font-extrabold sm:text-3xl">Título grande · Geist extrabold</p>
          <p className="mt-2 text-xl font-extrabold sm:text-2xl">Título de página</p>
          <p className="mt-2 text-lg font-extrabold">Título de sección</p>
          <p className="mt-2 text-sm">Texto normal de lectura (14 px). Es el tamaño base de las pantallas.</p>
          <p className={`mt-2 text-xs ${ui.muted}`}>Texto de apoyo (12 px). Es el más pequeño permitido.</p>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-extrabold">Botones</h2>
        <Card>
          <div className="flex flex-wrap gap-2">
            <button className={ui.btnPrimary}>Principal</button>
            <button className={ui.btnGhost}>Secundario</button>
            <button className={ui.btnOk}>Confirmar</button>
            <button className={ui.btnDanger}>Eliminar</button>
          </div>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-extrabold">Estados</h2>
        <Card>
          <div className="flex flex-wrap gap-2">
            <Pill tone="ok">Pagado</Pill><Pill tone="warn">Pendiente</Pill><Pill tone="error">Vencido</Pill>
            <Pill tone="info">En ruta</Pill><Pill tone="neutral">Archivado</Pill>
          </div>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-extrabold">Cargando y vacío</h2>
        <Loading rows={2} />
        <Empty icon="🧾" title="Todavía no hay ventas" hint="Cuando registres la primera, aparecerá aquí." action={<button className={ui.btnPrimary}>Nueva venta</button>} />
      </section>
    </main>
  );
}
