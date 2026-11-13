'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage, LanguageDropdown, RegionalStatusBar } from '../../language-selector';
import { useVeltrixAuth } from '../../auth-system';
import { rpc } from '../../../lib/supabase';

// Lo que devuelve la función platform_metrics() de la base de datos
type Stage = 'trial' | 'paying' | 'grace' | 'suspended';
type OrgRow = {
  org_id: string; name: string; email: string; plan: string; price_usd: number;
  stage: Stage; created_at: string; trial_ends_at: string | null; next_billing_date: string | null;
};
type Metrics = {
  generated_at: string;
  funnel: { total: number; trial: number; paying: number; grace: number; suspended: number };
  mrr_usd: number;
  conversion: { trials_finished: number; converted: number };
  churn_30d: number;
  trials_expiring: { org_id: string; name: string; email: string; plan: string; trial_ends_at: string; days_left: number }[];
  organizations: OrgRow[];
  growth: { month: string; new_orgs: number; revenue_usd: number }[];
};

type Filter = 'all' | Stage;

const STAGE_INFO: Record<Stage, { label: string; badge: string }> = {
  trial:     { label: '🧪 En prueba',  badge: 'bg-sky-500/10 text-sky-300 border-sky-500/30' },
  paying:    { label: '🟢 Pagando',    badge: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' },
  grace:     { label: '🟡 En gracia',  badge: 'bg-amber-500/10 text-amber-300 border-amber-500/30' },
  suspended: { label: '🔴 Suspendida', badge: 'bg-red-500/10 text-red-300 border-red-500/30' },
};

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const monthLabel = (ym: string) => MONTHS[Number(ym.slice(5, 7)) - 1] + ' ' + ym.slice(2, 4);
const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString('es-BO') : '—');

function BarChart({
  data, color, format,
}: { data: { label: string; value: number }[]; color: string; format: (n: number) => string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex items-end gap-1.5 h-40 pt-4">
      {data.map((d) => (
        <div key={d.label} className="flex-1 flex flex-col items-center justify-end h-full gap-1 group">
          <span className="text-[10px] text-slate-400 opacity-0 group-hover:opacity-100 transition">
            {format(d.value)}
          </span>
          <div
            className={`w-full rounded-t-md ${color} transition-all`}
            style={{ height: `${Math.max(d.value > 0 ? 4 : 1, (d.value / max) * 100)}%`, opacity: d.value > 0 ? 1 : 0.25 }}
            title={`${d.label}: ${format(d.value)}`}
          />
          <span className="text-[10px] text-slate-500 whitespace-nowrap">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

export default function GlobalCoreAdminPage() {
  const router = useRouter();
  const { t, formatMoney } = useLanguage();
  const { loaded, session, logout } = useVeltrixAuth();
  const [m, setM] = useState<Metrics | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    if (loaded && (!session || session.role !== 'superadmin')) router.replace('/');
  }, [loaded, session, router]);

  const refresh = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      setM(await rpc<Metrics>('platform_metrics'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las métricas');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (loaded && session?.role === 'superadmin') refresh();
  }, [loaded, session, refresh]);

  if (!loaded || !session || session.role !== 'superadmin') {
    return <div className="min-h-dvh bg-slate-950" />;
  }

  const f = m?.funnel ?? { total: 0, trial: 0, paying: 0, grace: 0, suspended: 0 };
  const conv = m?.conversion ?? { trials_finished: 0, converted: 0 };
  const convPct = conv.trials_finished > 0 ? Math.round((conv.converted / conv.trials_finished) * 100) : null;
  const orgs = (m?.organizations ?? []).filter((o) => filter === 'all' || o.stage === filter);
  const growth = m?.growth ?? [];

  const cards: { key: Filter; label: string; value: number; on: string; text: string }[] = [
    { key: 'all',       label: 'Organizaciones',  value: f.total,     on: 'bg-blue-950/40 border-blue-500',       text: 'text-white' },
    { key: 'trial',     label: '🧪 En prueba',     value: f.trial,     on: 'bg-sky-950/40 border-sky-500',         text: 'text-sky-300' },
    { key: 'paying',    label: '🟢 Pagando',       value: f.paying,    on: 'bg-emerald-950/40 border-emerald-500', text: 'text-emerald-300' },
    { key: 'grace',     label: '🟡 En gracia',     value: f.grace,     on: 'bg-amber-950/40 border-amber-500',     text: 'text-amber-300' },
    { key: 'suspended', label: '🔴 Suspendidas',   value: f.suspended, on: 'bg-red-950/40 border-red-500',         text: 'text-red-300' },
  ];

  return (
    <main className="min-h-dvh bg-slate-950 text-white px-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(1.5rem+env(safe-area-inset-bottom))] md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-slate-800 pb-6 gap-4">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-purple-400 bg-purple-500/10 px-3 py-1 rounded-full border border-purple-500/20">
              🛡️ Veltrix Core Control · Superadmin
            </span>
            <h1 className="text-3xl font-bold mt-3">
              {t.globalConsole} <span className="text-blue-500">Veltrix Enterprise</span>
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Suscripciones, pruebas y crecimiento. Los datos internos de cada empresa son privados.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <LanguageDropdown />
            <div className="bg-slate-900 border border-slate-800 px-5 py-3 rounded-xl">
              <p className="text-[11px] text-slate-400">Ingreso mensual (MRR)</p>
              <p className="text-lg font-bold text-emerald-400">{formatMoney(m?.mrr_usd ?? 0)}</p>
            </div>
            <button
              onClick={refresh}
              disabled={busy}
              className="bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold px-4 py-2.5 rounded-lg cursor-pointer disabled:opacity-50"
            >
              {busy ? 'Actualizando…' : '↻ Actualizar'}
            </button>
            <button
              onClick={logout}
              className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs font-semibold px-4 py-2.5 rounded-lg cursor-pointer"
            >
              Cerrar sesión
            </button>
          </div>
        </header>

        <RegionalStatusBar />

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-3 rounded-xl text-xs font-semibold">
            ⚠️ {error}
          </div>
        )}

        {/* EMBUDO DE EMPRESAS */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {cards.map((c) => (
            <button
              key={c.key}
              onClick={() => setFilter(c.key)}
              className={`p-4 rounded-xl border text-left transition cursor-pointer ${
                filter === c.key ? c.on : 'bg-slate-900/50 border-slate-800 hover:border-slate-600'
              }`}
            >
              <p className="text-xs text-slate-400 font-semibold">{c.label}</p>
              <p className={`text-2xl font-extrabold mt-1 ${c.text}`}>{c.value}</p>
            </button>
          ))}
        </div>

        {/* CONVERSIÓN Y BAJAS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="p-4 rounded-xl border bg-slate-900/50 border-slate-800">
            <p className="text-xs text-slate-400 font-semibold">Conversión de prueba a pago</p>
            <p className="text-2xl font-extrabold mt-1 text-white">{convPct === null ? '—' : `${convPct}%`}</p>
            <p className="text-[11px] text-slate-500 mt-1">
              {conv.converted} de {conv.trials_finished} pruebas terminadas pagaron
            </p>
          </div>
          <div className="p-4 rounded-xl border bg-slate-900/50 border-slate-800">
            <p className="text-xs text-slate-400 font-semibold">Bajas últimos 30 días</p>
            <p className="text-2xl font-extrabold mt-1 text-red-300">{m?.churn_30d ?? 0}</p>
            <p className="text-[11px] text-slate-500 mt-1">Empresas suspendidas por falta de pago</p>
          </div>
          <div className="p-4 rounded-xl border bg-slate-900/50 border-slate-800">
            <p className="text-xs text-slate-400 font-semibold">Pruebas activas</p>
            <p className="text-2xl font-extrabold mt-1 text-sky-300">{f.trial}</p>
            <p className="text-[11px] text-slate-500 mt-1">14 días gratis desde que se registran</p>
          </div>
        </div>

        {/* CRECIMIENTO */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <section className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
            <h2 className="text-sm font-bold">📈 Empresas nuevas por mes</h2>
            <p className="text-[11px] text-slate-500">Últimos 12 meses</p>
            <BarChart
              data={growth.map((g) => ({ label: monthLabel(g.month), value: g.new_orgs }))}
              color="bg-blue-500"
              format={(n) => String(n)}
            />
          </section>
          <section className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
            <h2 className="text-sm font-bold">💰 Ingresos cobrados por mes</h2>
            <p className="text-[11px] text-slate-500">Pagos de suscripción confirmados</p>
            <BarChart
              data={growth.map((g) => ({ label: monthLabel(g.month), value: Number(g.revenue_usd) }))}
              color="bg-emerald-500"
              format={(n) => formatMoney(n)}
            />
          </section>
        </div>

        {/* PRUEBAS POR VENCER */}
        <section className="bg-slate-900/60 border border-sky-900/50 rounded-2xl p-5 space-y-3">
          <div>
            <h2 className="text-sm font-bold">⏰ Pruebas por vencer</h2>
            <p className="text-[11px] text-slate-500">Escríbeles antes de que termine su prueba para convertirlos en clientes.</p>
          </div>
          {(m?.trials_expiring ?? []).length === 0 ? (
            <p className="text-xs text-slate-500">No hay empresas en prueba por ahora.</p>
          ) : (
            <div className="space-y-2">
              {m!.trials_expiring.map((x) => (
                <div key={x.org_id} className="flex flex-wrap items-center justify-between gap-2 bg-slate-950/70 border border-slate-800 rounded-xl px-4 py-3 text-xs">
                  <div>
                    <p className="font-bold text-sm">{x.name}</p>
                    <p className="text-slate-400">{x.email} · Plan {x.plan}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`px-2.5 py-1 rounded-full font-bold border ${
                      x.days_left <= 3 ? 'bg-red-500/10 text-red-300 border-red-500/30' : 'bg-sky-500/10 text-sky-300 border-sky-500/30'
                    }`}>
                      {x.days_left === 0 ? 'Vence hoy' : `${x.days_left} día${x.days_left === 1 ? '' : 's'}`}
                    </span>
                    <a
                      href={`mailto:${x.email}?subject=${encodeURIComponent('Tu prueba de Veltrix')}`}
                      className="bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 font-bold px-3 py-1.5 rounded-lg"
                    >
                      ✉️ Escribir
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* LISTA DE ORGANIZACIONES */}
        <section className="space-y-3">
          <h2 className="text-sm font-bold">
            🏢 {filter === 'all' ? 'Todas las organizaciones' : STAGE_INFO[filter].label} ({orgs.length})
          </h2>
          {orgs.length === 0 && (
            <p className="text-xs text-slate-500 bg-slate-900/50 border border-slate-800 rounded-xl p-4">
              {busy ? 'Cargando…' : 'Todavía no hay empresas aquí. Cuando alguien se registre en veltrixsystem.app aparecerá en esta lista.'}
            </p>
          )}
          {orgs.map((o) => (
            <div key={o.org_id} className="p-4 rounded-xl border bg-slate-900/70 border-slate-800 flex flex-col md:flex-row justify-between gap-3">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-bold">{o.name}</h3>
                  <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold border ${STAGE_INFO[o.stage].badge}`}>
                    {STAGE_INFO[o.stage].label}
                  </span>
                </div>
                <p className="text-xs text-slate-400">{o.email} · Plan {o.plan}</p>
                <p className="text-[11px] text-slate-500">
                  Registrada: {fmtDate(o.created_at)}
                  {o.trial_ends_at && ` · Prueba hasta: ${fmtDate(o.trial_ends_at)}`}
                  {` · Próximo cobro: ${fmtDate(o.next_billing_date)}`}
                </p>
              </div>
              <div className="text-right self-end md:self-center">
                <p className="text-[11px] text-slate-400">Mensualidad</p>
                <p className="text-lg font-bold text-emerald-400">{formatMoney(Number(o.price_usd))}</p>
              </div>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
