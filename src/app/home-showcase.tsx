'use client';
import { useEffect, useState } from 'react';
import { useLanguage } from './language-selector';
import { useT } from './i18n';
import type { DictKey } from './i18n/es';

// Vista previa de la portada: el mismo panel con la forma de cada grupo de rubros.
// Los rubros que comparten funciones se agrupan (comercio, gastronomía, taller y servicios, calle y créditos).
// Los montos están en USD y se muestran en la moneda del visitante.
type Niche = 'retail' | 'food' | 'service' | 'field';
type View = 'panel' | 'store' | 'cash' | 'tables' | 'menu' | 'orders' | 'route';
const NICHES: Niche[] = ['retail', 'food', 'service', 'field'];
const ICON: Record<Niche, string> = { retail: '🛍️', food: '🍽️', service: '🔧', field: '🛵' };
const VIEWS: Record<Niche, View[]> = {
  retail: ['panel', 'store', 'cash'],
  food: ['panel', 'tables', 'menu'],
  service: ['panel', 'orders', 'cash'],
  field: ['panel', 'route', 'cash'],
};
const VIEW_LABEL: Record<View, DictKey> = {
  panel: 'home.sh.v.panel', store: 'home.sh.v.store', cash: 'home.sc.tab.cash', tables: 'home.sh.v.tables',
  menu: 'home.sh.v.menu', orders: 'home.sh.v.orders', route: 'home.sh.v.route',
};
// Cada grupo: tarjetas (clave, valor, variación), curva de 12 meses y medidores de rendimiento
type Kpi = { k: DictKey; v: string; d?: string; warn?: boolean };
const CURVE: Record<Niche, number[]> = {
  retail: [32, 35, 34, 41, 44, 43, 50, 56, 54, 63, 69, 78],
  food: [48, 50, 53, 52, 58, 61, 60, 66, 70, 69, 75, 82],
  service: [20, 24, 23, 28, 31, 35, 34, 40, 46, 45, 52, 58],
  field: [26, 29, 33, 32, 38, 42, 47, 46, 53, 58, 63, 70],
};
const GAUGES: Record<Niche, [string, number][]> = {
  retail: [['goal', 78], ['stock', 92], ['repeat', 64]],
  food: [['goal', 71], ['service', 94], ['stock', 88]],
  service: [['goal', 66], ['service', 91], ['repeat', 72]],
  field: [['goal', 83], ['collect', 96], ['repeat', 70]],
};

function Gauge({ v, label }: { v: number; label: string }) {
  const r = 22; const len = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center text-center">
      <svg viewBox="0 0 56 56" className="h-14 w-14 -rotate-90" aria-hidden>
        <circle cx="28" cy="28" r={r} fill="none" strokeWidth="6" className="stroke-slate-200 dark:stroke-slate-800" />
        <circle cx="28" cy="28" r={r} fill="none" strokeWidth="6" strokeLinecap="round" strokeDasharray={`${(len * v) / 100} ${len}`} className="stroke-blue-600" />
      </svg>
      <p className="-mt-9 mb-3 text-[11px] font-extrabold">{v}%</p>
      <p className="text-[10px] font-semibold leading-tight text-slate-500">{label}</p>
    </div>
  );
}

function Curve({ pts }: { pts: number[] }) {
  const w = 300; const h = 84; const max = Math.max(...pts); const min = Math.min(...pts) * 0.8;
  const xy = pts.map((p, i) => [(i / (pts.length - 1)) * w, h - 6 - ((p - min) / (max - min)) * (h - 14)] as const);
  const line = xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const last = xy[xy.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-24 w-full text-blue-600" preserveAspectRatio="none" aria-hidden>
      <polygon points={`0,${h} ${line} ${w},${h}`} fill="currentColor" opacity="0.12" />
      <polyline points={line} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={last[0]} cy={last[1]} r="3.5" fill="currentColor" />
    </svg>
  );
}

export function HomeShowcase() {
  const { t } = useT();
  const { formatMoney } = useLanguage();
  const [niche, setNiche] = useState<Niche>('retail');
  const [view, setView] = useState<View>('panel');
  const [auto, setAuto] = useState(true);
  const m = (usd: number) => formatMoney(usd).replace(/\s*\(\$[\d.,]+\)$/, '').replace(/ USD$/, '').replace(/[.,]\d{2}$/, '');

  useEffect(() => {
    if (!auto) return;
    const id = setInterval(() => { setNiche((x) => NICHES[(NICHES.indexOf(x) + 1) % NICHES.length]); setView('panel'); }, 7000);
    return () => clearInterval(id);
  }, [auto]);

  const pickNiche = (x: Niche) => { setAuto(false); setNiche(x); setView('panel'); };
  const pickView = (x: View) => { setAuto(false); setView(x); };
  const card = 'rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900';
  const lbl = 'text-[10px] font-semibold uppercase tracking-wide text-slate-500';

  const KPIS: Record<Niche, Kpi[]> = {
    retail: [{ k: 'home.sc.salesToday', v: m(1398), d: '+8 %' }, { k: 'home.sh.k.online', v: '14', d: '+3' }, { k: 'home.sh.k.ticket', v: m(38) }, { k: 'home.sh.k.growth', v: '+18 %', d: '12 m' }],
    food: [{ k: 'home.sc.salesToday', v: m(2150), d: '+11 %' }, { k: 'home.sh.k.tables', v: '9/14' }, { k: 'home.sh.k.prep', v: '12 min' }, { k: 'home.sh.k.ticket', v: m(17), d: '+4 %' }],
    service: [{ k: 'home.sc.salesToday', v: m(980), d: '+6 %' }, { k: 'home.sh.k.jobs', v: '17' }, { k: 'home.sh.k.done', v: '6', d: '+2' }, { k: 'home.sh.k.ticket', v: m(120) }],
    field: [{ k: 'home.sc.collectedToday', v: m(2650), d: '+12 %' }, { k: 'home.sc.salesToday', v: m(1398), d: '+8 %' }, { k: 'home.sc.portfolio', v: m(59300) }, { k: 'home.sc.overdue', v: '4,2 %', warn: true }],
  };
  const emoji = ['👕', '👟', '👜', '🧢', '🧥', '👖'];
  const dishes = ['🍔', '🍕', '🥗', '🍜'];
  const toast = niche === 'retail' ? `${t('home.sh.store.new')} · +${m(52)}` : niche === 'food' ? `${t('home.sh.table', { n: 7 })} · ${t('home.sh.st.new')}` : niche === 'service' ? `${t('home.sh.job', { n: 103 })} · ${t('home.sh.st.ready')}` : `${t('home.sc.toast1', { n: 3 })} · +${m(35)}`;

  return (
    <div className="relative mx-auto w-full min-w-0 max-w-xl lg:max-w-none">
      {/* Avisos flotantes: lo que pasa en vivo */}
      <div className="absolute -top-4 end-3 z-10 hidden rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-bold shadow-lg sm:block dark:border-emerald-500/30 dark:bg-slate-900">
        <span className="text-emerald-600 dark:text-emerald-400">● </span>{toast}
      </div>
      {niche === 'field' && (
        <div className="absolute -bottom-4 start-3 z-10 hidden rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs font-bold shadow-lg sm:block dark:border-amber-500/30 dark:bg-slate-900">
          ⏰ {t('home.sc.toast2', { n: 12 })}
        </div>
      )}

      <div className="w-full min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-2xl dark:border-slate-800 dark:bg-slate-950">
        {/* Barra de ventana */}
        <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400" /><span className="h-2.5 w-2.5 rounded-full bg-amber-400" /><span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          <span className="ms-2 truncate rounded-md bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500 dark:bg-slate-800">veltrixsystem.app</span>
        </div>
        {/* Grupos de rubros */}
        <div className="grid grid-cols-4 gap-1 border-b border-slate-200 bg-white p-1.5 sm:gap-1.5 sm:px-2 dark:border-slate-800 dark:bg-slate-900" role="tablist">
          {NICHES.map((x) => (
            <button key={x} type="button" role="tab" aria-selected={niche === x} onClick={() => pickNiche(x)}
              className={`min-w-0 cursor-pointer rounded-lg px-1 py-1.5 text-center sm:px-3 sm:text-start ${niche === x ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:text-slate-900 dark:bg-slate-800 dark:text-slate-300 dark:hover:text-white'}`}>
              <span className="block text-base leading-none sm:hidden">{ICON[x]}</span><span className="mt-0.5 block text-[10px] font-bold leading-tight sm:mt-0 sm:text-xs"><span className="hidden sm:inline">{ICON[x]} </span>{t(`home.sh.${x}`)}</span>
              <span className={`hidden text-[10px] sm:block ${niche === x ? 'opacity-80' : 'text-slate-500'}`}>{t(`home.sh.${x}.d`)}</span>
            </button>
          ))}
        </div>
        {/* Pantallas del grupo */}
        <div className="grid grid-cols-3 border-b border-slate-200 bg-white px-1 pt-1 sm:px-2 sm:pt-2 dark:border-slate-800 dark:bg-slate-900" role="tablist">
          {VIEWS[niche].map((x) => (
            <button key={x} type="button" role="tab" aria-selected={view === x} onClick={() => pickView(x)}
              className={`min-w-0 cursor-pointer truncate rounded-t-lg px-1 py-1.5 text-[11px] font-bold sm:px-3 sm:text-xs ${view === x ? 'border-b-2 border-blue-600 text-blue-600 dark:text-blue-400' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}>
              {t(VIEW_LABEL[x])}
            </button>
          ))}
        </div>

        <div className="min-h-[21rem] p-2.5 sm:min-h-[24rem] sm:p-4">
          {view === 'panel' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {KPIS[niche].map((c) => (
                  <div key={c.k} className={card}>
                    <p className={lbl}>{t(c.k)}</p>
                    <p className={`mt-1 whitespace-nowrap text-sm font-extrabold sm:text-lg ${c.warn ? 'text-amber-600 dark:text-amber-400' : ''}`}>{c.v}</p>
                    {c.d && <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">▲ {c.d}</p>}
                  </div>
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr]">
                <div className={card}>
                  <p className={lbl}>{t('home.sh.growth')}</p>
                  <Curve pts={CURVE[niche]} />
                </div>
                <div className={card}>
                  <p className={lbl}>{t('home.sh.perf')}</p>
                  <div className="mt-2 grid grid-cols-3 gap-1">
                    {GAUGES[niche].map(([g, v]) => <Gauge key={g} v={v} label={t(`home.sh.g.${g}` as DictKey)} />)}
                  </div>
                </div>
              </div>
            </div>
          )}

          {view === 'store' && (
            <div className="space-y-3">
              <div className={`${card} flex items-center justify-between`}>
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold">🛍️ veltrixsystem.app/tienda/…</p>
                  <p className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">● {t('home.sh.store.open')}</p>
                </div>
                <span className="rounded-full bg-blue-600 px-3 py-1 text-[11px] font-bold text-white">🛒 3</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {emoji.map((e, i) => (
                  <div key={e} className={`${card} text-center`}>
                    <p className="text-3xl">{e}</p>
                    <p className="mt-1 truncate text-[11px] font-semibold">{t('home.sh.item', { n: i + 1 })}</p>
                    <p className="text-xs font-extrabold">{m(18 + i * 7)}</p>
                    <p className="mt-1 rounded-md bg-blue-50 py-0.5 text-[10px] font-bold text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">+ {t('home.sh.store.add')}</p>
                  </div>
                ))}
              </div>
              <p className="rounded-lg bg-emerald-50 px-2 py-1.5 text-[11px] font-bold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">🔔 {t('home.sh.store.new')} · {m(52)}</p>
            </div>
          )}

          {view === 'tables' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className={card}>
                <p className={lbl}>🍽️ {t('home.sh.v.tables')}</p>
                <div className="mt-2 grid grid-cols-4 gap-1.5">
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                    <span key={n} className={`rounded-lg py-2 text-center text-xs font-extrabold ${[2, 4, 5, 7, 8, 10, 11, 12].includes(n) ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}>{n}</span>
                  ))}
                </div>
              </div>
              <div className={`${card} space-y-1.5`}>
                <p className={lbl}>👨‍🍳 {t('home.sh.kitchen')}</p>
                {([[7, 'new'], [4, 'cooking'], [2, 'ready']] as const).map(([n, st]) => (
                  <div key={n} className="flex items-center justify-between rounded-lg border border-slate-200 px-2.5 py-2 text-xs dark:border-slate-800">
                    <span className="font-bold">{t('home.sh.table', { n })}</span>
                    <span className={`font-bold ${st === 'ready' ? 'text-emerald-600 dark:text-emerald-400' : st === 'cooking' ? 'text-amber-600 dark:text-amber-400' : 'text-blue-600 dark:text-blue-400'}`}>{t(`home.sh.st.${st}`)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {view === 'menu' && (
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <ul className="space-y-1.5">
                {dishes.map((e, i) => (
                  <li key={e} className={`${card} flex items-center justify-between`}>
                    <span className="text-xs font-bold">{e} {t('home.sh.item', { n: i + 1 })}</span>
                    <span className="text-sm font-extrabold">{m(7 + i * 3)}</span>
                  </li>
                ))}
              </ul>
              <div className={`${card} flex flex-col items-center justify-center gap-2 text-center`}>
                <div className="grid h-20 w-20 grid-cols-5 gap-0.5 rounded-md bg-white p-1.5 dark:bg-slate-100" aria-hidden>
                  {Array.from({ length: 25 }, (_, i) => <span key={i} className={[0,1,2,4,5,6,10,12,14,18,20,22,23,24,8,16].includes(i) ? 'rounded-[1px] bg-slate-900' : ''} />)}
                </div>
                <p className="max-w-[9rem] text-[11px] font-bold">{t('home.sh.menu.qr')}</p>
              </div>
            </div>
          )}

          {view === 'orders' && (
            <ul className="space-y-2">
              {([[101, 'diag', 25, 120], [102, 'work', 65, 340], [103, 'ready', 100, 85]] as const).map(([n, st, p, v]) => (
                <li key={n} className={card}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold">🔧 {t('home.sh.job', { n })}</span>
                    <span className="font-extrabold">{m(v)}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                    <div className={`h-full rounded-full ${st === 'ready' ? 'bg-emerald-500' : 'bg-blue-600'}`} style={{ width: `${p}%` }} />
                  </div>
                  <p className={`mt-1 text-[10px] font-semibold ${st === 'ready' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500'}`}>{t(`home.sh.st.${st}`)}</p>
                </li>
              ))}
            </ul>
          )}

          {view === 'route' && (
            <div className="grid gap-3 sm:grid-cols-[1fr_1.3fr]">
              <div className="space-y-2">
                <div className="rounded-xl bg-blue-600 p-3 text-white">
                  <p className="text-[11px] opacity-80">{t('home.sc.routeN', { n: 1 })} · {t('home.mock.collected')}</p>
                  <p className="text-2xl font-extrabold">{m(820)}</p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/25"><div className="h-full w-[83%] rounded-full bg-white" /></div>
                  <p className="mt-1 text-[11px] opacity-90">{t('home.sc.progress', { done: 38, total: 46 })}</p>
                </div>
                <div className={card}>
                  <p className={lbl}>{t('home.mock.offline')}</p>
                  <p className="mt-1 text-xs text-slate-500">{t('home.sc.offlineHint')}</p>
                </div>
              </div>
              <ul className="space-y-1.5">
                {([[14, 25, 'paid', '8/24'], [15, 18, 'paid', '12/20'], [16, 40, 'partial', '5/12'], [17, 30, 'late', '9/24'], [18, 22, 'pending', '3/10'], [19, 35, 'pending', '15/24']] as const).map(([n, v, st, q]) => (
                  <li key={n} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
                    <div className="min-w-0">
                      <p className="text-xs font-bold">{t('home.mock.client', { n })} <span className="font-normal text-slate-500">· {t('home.sc.installment', { q })}</span></p>
                      <p className={`text-[10px] font-semibold ${st === 'paid' ? 'text-emerald-600 dark:text-emerald-400' : st === 'partial' ? 'text-blue-600 dark:text-blue-400' : st === 'late' ? 'text-red-600 dark:text-red-400' : 'text-slate-500'}`}>
                        {st === 'paid' ? t('home.mock.paid') : st === 'partial' ? t('home.sc.partial') : st === 'late' ? t('home.sc.late', { days: 3 }) : t('home.mock.pending')}
                      </p>
                    </div>
                    <span className={`text-sm font-extrabold ${st === 'paid' ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>{m(v)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {view === 'cash' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className={card}>
                <p className={lbl}>{t('home.sc.closeTitle')} · {t('home.sc.branchN', { n: 1 })}</p>
                <ul className="mt-2 space-y-1.5 text-xs">
                  {([['opening', 100], ['cashSales', 612], ['collections', 820], ['expenses', -45]] as const).map(([k, v]) => (
                    <li key={k} className="flex justify-between"><span>{t(`home.sc.${k}`)}</span><span className={`font-bold ${v < 0 ? 'text-red-600 dark:text-red-400' : ''}`}>{v < 0 ? '−' : ''}{m(Math.abs(v))}</span></li>
                  ))}
                  <li className="flex justify-between text-slate-500"><span>{t('home.sc.qr')}</span><span className="font-bold">{m(389)}</span></li>
                </ul>
              </div>
              <div className={`${card} space-y-2`}>
                <div className="flex justify-between text-xs"><span>{t('home.sc.expected')}</span><span className="font-extrabold">{m(1487)}</span></div>
                <div className="flex justify-between text-xs"><span>{t('home.sc.counted')}</span><span className="font-extrabold">{m(1487)}</span></div>
                <div className="flex justify-between border-t border-slate-200 pt-2 text-sm dark:border-slate-800"><span className="font-bold">{t('home.sc.diff')}</span><span className="font-extrabold text-emerald-600 dark:text-emerald-400">{m(0)}</span></div>
                <p className="rounded-lg bg-emerald-50 px-2 py-1.5 text-[11px] font-bold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">{t('home.sc.approved')}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
