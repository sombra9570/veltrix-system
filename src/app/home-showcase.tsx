'use client';
import { useEffect, useState } from 'react';
import { useLanguage } from './language-selector';
import { useT } from './i18n';
import type { DictKey } from './i18n/es';

// Vista previa de la portada: reproduce las pantallas reales de cada grupo de rubros y de sus roles, con las cifras de un día normal de operación.
// Los textos salen de las mismas claves que usa la aplicación. Los montos están en USD y se muestran en la moneda del visitante.
// Las cifras de cada grupo salen de una sola fuente (DAY / ROUTES), así que el panel, la caja y las listas siempre cuadran entre sí.
type Niche = 'retail' | 'food' | 'service' | 'field';
type Plain = Exclude<Niche, 'field'>;
type View = 'panel' | 'pos' | 'cash' | 'stock' | 'store' | 'ia' | 'tables' | 'kitchen' | 'menu' | 'orders' | 'route' | 'fund' | 'sup' | 'flow';
type Gran = 'day' | 'week' | 'month';
type Period = 'day' | 'week';
const NICHES: Niche[] = ['retail', 'food', 'service', 'field'];
const ICON: Record<Niche, string> = { retail: '🛍️', food: '🍽️', service: '🔧', field: '🛵' };
// Pantallas de cada grupo, en el orden del flujo: administrador, rol de atención, caja y control
const VIEWS: Record<Niche, View[]> = {
  retail: ['panel', 'pos', 'cash', 'stock', 'store', 'ia', 'flow'],
  food: ['panel', 'tables', 'kitchen', 'cash', 'menu', 'store', 'ia', 'flow'],
  service: ['panel', 'orders', 'cash', 'ia', 'flow'],
  field: ['panel', 'route', 'fund', 'sup', 'ia', 'flow'],
};
const VIEW_LABEL: Record<View, DictKey> = {
  panel: 'home.sh.v.panel', pos: 'nav.pos', cash: 'nav.cash', stock: 'nav.inventory', store: 'home.sh.v.store', ia: 'nav.ai',
  tables: 'nav.tables', kitchen: 'nav.kitchen', menu: 'home.sh.v.menu', orders: 'home.sh.v.orders',
  route: 'nav.route', fund: 'fund.title', sup: 'sup.title', flow: 'home.sh.v.flow',
};

// Un día normal de comercio, gastronomía y taller: cobros por forma de pago, cajas abiertas y pendientes de revisión
const DAY: Record<Plain, { cash: number; qr: number; card: number; tickets: number; shifts: number; rev: number; set: number; open: number; exp: number }> = {
  retail: { cash: 310, qr: 190, card: 140, tickets: 24, shifts: 2, rev: 1, set: 0, open: 100, exp: 25 },
  food: { cash: 420, qr: 260, card: 310, tickets: 41, shifts: 2, rev: 1, set: 0, open: 120, exp: 30 },
  service: { cash: 180, qr: 120, card: 150, tickets: 4, shifts: 1, rev: 1, set: 0, open: 80, exp: 20 },
};
const salesOf = (d: { cash: number; qr: number; card: number }) => d.cash + d.qr + d.card;

// Cobranza y créditos: dos rutas, cada una con su caja. Caja actual = caja anterior + inversión + cobrado en efectivo − prestado − gastos − entregas.
// El QR / tarjeta se cuenta como cobrado, pero no ingresa a la caja de la ruta.
type Fund = { invest: number; prev: number; cash: number; qr: number; lent: number; exp: number; out: number };
const ROUTES: { n: number; clients: number; late: number; overdue: number; portfolio: number; day: Fund; week: Fund }[] = [
  { n: 1, clients: 46, late: 6, overdue: 230, portfolio: 5500,
    day: { invest: 200, prev: 250, cash: 330, qr: 70, lent: 300, exp: 15, out: 0 },
    week: { invest: 300, prev: 220, cash: 1980, qr: 340, lent: 1400, exp: 95, out: 540 } },
  { n: 2, clients: 28, late: 3, overdue: 130, portfolio: 3200,
    day: { invest: 0, prev: 180, cash: 210, qr: 40, lent: 150, exp: 10, out: 0 },
    week: { invest: 100, prev: 160, cash: 1120, qr: 300, lent: 900, exp: 45, out: 205 } },
];
const currentOf = (f: Fund) => f.prev + f.invest + f.cash - f.lent - f.exp - f.out;
const ZERO: Fund = { invest: 0, prev: 0, cash: 0, qr: 0, lent: 0, exp: 0, out: 0 };
const totalFund = (p: Period): Fund => ROUTES.reduce((a, r) => {
  const f = r[p];
  return { invest: a.invest + f.invest, prev: a.prev + f.prev, cash: a.cash + f.cash, qr: a.qr + f.qr, lent: a.lent + f.lent, exp: a.exp + f.exp, out: a.out + f.out };
}, ZERO);
const PORTFOLIO = ROUTES.reduce((a, r) => a + r.portfolio, 0);
const OVERDUE = ROUTES.reduce((a, r) => a + r.overdue, 0);
const LATE_CLIENTS = ROUTES.reduce((a, r) => a + r.late, 0);
const MONTH_COLLECTED = 15400;

// Forma de la curva de crecimiento: el último punto es siempre el valor actual
const SHAPE: Record<Gran, number[]> = {
  day: [0.86, 0.92, 0.97, 0.9, 0.95, 1.02, 0.88, 0.93, 1, 0.96, 0.91, 0.99, 0.97, 1],
  week: [0.82, 0.84, 0.87, 0.86, 0.9, 0.89, 0.93, 0.92, 0.95, 0.94, 0.97, 1],
  month: [0.7, 0.73, 0.77, 0.8, 0.79, 0.84, 0.88, 0.9, 0.93, 0.92, 0.96, 1],
};

function Curve({ pts }: { pts: number[] }) {
  const w = 300; const h = 84; const max = Math.max(...pts); const min = Math.min(...pts) * 0.8;
  const xy = pts.map((p, i) => [(i / (pts.length - 1)) * w, h - 6 - ((p - min) / (max - min)) * (h - 14)] as const);
  const line = xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const last = xy[xy.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-14 w-full text-blue-600 sm:h-24" preserveAspectRatio="none" aria-hidden>
      <polygon points={`0,${h} ${line} ${w},${h}`} fill="currentColor" opacity="0.12" />
      <polyline points={line} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={last[0]} cy={last[1]} r="3.5" fill="currentColor" />
    </svg>
  );
}

function Seg<T extends string>({ value, items, onPick }: { value: T; items: readonly (readonly [T, string])[]; onPick: (v: T) => void }) {
  return (
    <div className="inline-flex gap-0.5 rounded-lg border border-slate-300 p-0.5 dark:border-slate-700">
      {items.map(([k, label]) => (
        <button key={k} type="button" onClick={() => onPick(k)}
          className={`cursor-pointer rounded-md px-2 py-0.5 text-[10px] font-bold sm:px-2.5 sm:text-[11px] ${value === k ? 'bg-blue-600 text-white' : 'text-slate-600 dark:text-slate-300'}`}>{label}</button>
      ))}
    </div>
  );
}

type Tone = 'ok' | 'warn' | 'late' | 'info' | 'idle';
const TONE: Record<Tone, string> = {
  ok: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
  warn: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
  late: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300',
  info: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300',
  idle: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
};
function Pill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${TONE[tone]}`}>{children}</span>;
}

export function HomeShowcase() {
  const { t } = useT();
  const { formatMoney } = useLanguage();
  const [niche, setNiche] = useState<Niche>('retail');
  const [view, setView] = useState<View>('panel');
  const [auto, setAuto] = useState(true);
  const [gran, setGran] = useState<Gran>('day');
  const [period, setPeriod] = useState<Period>('day');
  const [mode, setMode] = useState<'list' | 'cards'>('list');
  const m = (usd: number) => formatMoney(usd).replace(/\s*\(\$[\d.,]+\)$/, '').replace(/ USD$/, '').replace(/[.,]\d{2}$/, '');

  useEffect(() => {
    if (!auto) return;
    const id = setInterval(() => { setNiche((x) => NICHES[(NICHES.indexOf(x) + 1) % NICHES.length]); setView('panel'); }, 9000);
    return () => clearInterval(id);
  }, [auto]);

  const pickNiche = (x: Niche) => { setAuto(false); setNiche(x); setView('panel'); };
  const pickView = (x: View) => { setAuto(false); setView(x); };
  const card = 'rounded-xl border border-slate-200 bg-white p-2 sm:p-3 dark:border-slate-800 dark:bg-slate-900';
  const lbl = 'text-[9px] font-semibold uppercase tracking-wide text-slate-500 sm:text-[10px]';
  const row = 'flex items-center justify-between gap-2';
  const emoji = ['👕', '👟', '👜', '🧢', '🧥', '👖'];
  const dishes = ['🍔', '🍕', '🥗', '🍜'];
  const perLbl = period === 'day' ? t('cx.sum.day') : t('cx.sum.week');
  const periodSeg = (
    <Seg value={period} onPick={setPeriod} items={[['day', t('cx.sum.day')], ['week', t('cx.sum.week')]]} />
  );

  // Cifras del grupo activo
  const day = niche === 'field' ? null : DAY[niche];
  const sales = day ? salesOf(day) : 0;
  const tf = totalFund(period);
  const route1 = ROUTES[0];
  const toDeliver = route1.day.cash - route1.day.exp;
  const curveLast = niche === 'field'
    ? { day: totalFund('day').cash + totalFund('day').qr, week: totalFund('week').cash + totalFund('week').qr, month: MONTH_COLLECTED }
    : { day: sales, week: sales * 6, month: sales * 26 };
  const curve = SHAPE[gran].map((f) => Math.round(curveLast[gran] * f));
  const curNow = curve[curve.length - 1]; const curPrev = curve[curve.length - 2];
  const pct = Math.round(((curNow - curPrev) / curPrev) * 100);
  const toast = niche === 'retail' ? `${t('home.sh.store.new')} · +${m(52)}` : niche === 'food' ? `${t('home.sh.table', { n: 7 })} · ${t('rest.k.ready')}` : niche === 'service' ? `${t('home.sh.job', { n: 103 })} · ${t('shop.s.done')}` : `${t('home.sc.toast1', { n: 1 })} · +${m(30)}`;

  // Cobro en caja: lo que el vendedor, el mesero o el taller enviaron a caja y la forma de pago
  const QUEUE: Record<Plain, { what: string; by: string; total: number; got: number }> = {
    retail: { what: t('pos.cart'), by: 'Marta', total: 48, got: 50 },
    food: { what: t('home.sh.table', { n: 7 }), by: 'Luis', total: 37, got: 40 },
    service: { what: t('home.sh.job', { n: 103 }), by: 'Carlos', total: 85, got: 85 },
  };

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
        {/* Pantallas del grupo: cada una es la ventana de un rol */}
        <div className="flex overflow-x-auto border-b border-slate-200 bg-white px-1 pt-1 sm:px-2 sm:pt-2 dark:border-slate-800 dark:bg-slate-900" role="tablist">
          {VIEWS[niche].map((x) => (
            <button key={x} type="button" role="tab" aria-selected={view === x} onClick={() => pickView(x)}
              className={`min-w-0 shrink-0 cursor-pointer whitespace-nowrap rounded-t-lg px-2.5 py-1.5 text-[11px] font-bold sm:px-3 sm:text-xs ${view === x ? 'border-b-2 border-blue-600 text-blue-600 dark:text-blue-400' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}>
              {t(VIEW_LABEL[x])}
            </button>
          ))}
        </div>

        <div className="p-2 sm:min-h-[26rem] sm:p-4">
          {/* ───────── Administrador: panel de comercio, gastronomía y taller ───────── */}
          {view === 'panel' && day && (
            <div className="space-y-2 sm:space-y-3">
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 sm:gap-2">
                <div className={card}>
                  <p className={lbl}>{t('owner.collectedToday')}</p>
                  <p className="mt-0.5 whitespace-nowrap text-sm font-extrabold sm:mt-1 sm:text-lg">{m(sales)}</p>
                  <p className="text-[10px] font-semibold text-slate-500">{t('owner.payments', { n: day.tickets })}</p>
                </div>
                <div className={card}>
                  <p className={lbl}>{t('owner.openShifts')}</p>
                  <p className="mt-0.5 text-sm font-extrabold sm:mt-1 sm:text-lg">{day.shifts}</p>
                </div>
                <div className={card}>
                  <p className={lbl}>{t('owner.toReview')}</p>
                  <p className="mt-0.5 text-sm font-extrabold sm:mt-1 sm:text-lg">{day.rev + day.set}</p>
                  <p className="text-[10px] font-semibold text-slate-500">{t('owner.pendingReversals', { n: day.rev })} · {t('owner.pendingSettlements', { n: day.set })}</p>
                </div>
                <div className={card}>
                  <p className={lbl}>{t('rep.kTickets')}</p>
                  <p className="mt-0.5 text-sm font-extrabold sm:mt-1 sm:text-lg">{day.tickets}</p>
                  <p className="text-[10px] font-semibold text-slate-500">{t('rep.ticketsAvg', { n: day.tickets, avg: m(Math.round(sales / day.tickets)) })}</p>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-[1.4fr_1fr] sm:gap-3">
                <div className={card}>
                  <div className={row}>
                    <p className={lbl}>📈 {t('gr2.title')} · {t('gr2.sales')}</p>
                    <Seg value={gran} onPick={setGran} items={[['day', t('cx.sum.day')], ['week', t('cx.sum.week')], ['month', t('gr2.month')]]} />
                  </div>
                  <Curve pts={curve} />
                  <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">{m(curNow)} · {t(pct >= 0 ? 'gr.up' : 'gr.down', { pct: Math.abs(pct) })}</p>
                </div>
                <div className={card}>
                  <p className={lbl}>{t('rep.methods')}</p>
                  <ul className="mt-2 space-y-2 text-xs">
                    {([['cash.m.cash', day.cash], ['cash.m.qr_transfer', day.qr], ['cash.m.card', day.card]] as const).map(([k, v]) => (
                      <li key={k}>
                        <div className={row}><span>{t(k)}</span><span className="font-extrabold">{m(v)}</span></div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"><div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.round((v / sales) * 100)}%` }} /></div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* ───────── Administrador: panel de cobranza y créditos ───────── */}
          {view === 'panel' && !day && (
            <div className="space-y-2 sm:space-y-3">
              <div className={row}>
                <p className="text-xs font-extrabold sm:text-sm">{t('nav.routes')}</p>
                {periodSeg}
              </div>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 sm:gap-2">
                <div className={card}>
                  <p className={lbl}>{t('cx.sum.collected')} · {perLbl}</p>
                  <p className="mt-0.5 whitespace-nowrap text-sm font-extrabold text-emerald-600 sm:mt-1 sm:text-lg dark:text-emerald-400">{m(tf.cash + tf.qr)}</p>
                </div>
                <div className={card}>
                  <p className={lbl}>{t('cx.sum.lent')} · {perLbl}</p>
                  <p className="mt-0.5 whitespace-nowrap text-sm font-extrabold text-violet-600 sm:mt-1 sm:text-lg dark:text-violet-400">{m(tf.lent)}</p>
                </div>
                <div className={card}>
                  <p className={lbl}>{t('cx.sum.current')}</p>
                  <p className="mt-0.5 whitespace-nowrap text-sm font-extrabold sm:mt-1 sm:text-lg">{m(currentOf(tf))}</p>
                </div>
                <div className={card}>
                  <p className={lbl}>{t('cx.sum.portfolio')}</p>
                  <p className="mt-0.5 whitespace-nowrap text-sm font-extrabold sm:mt-1 sm:text-lg">{m(PORTFOLIO)}</p>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-[1.4fr_1fr] sm:gap-3">
                <div className={card}>
                  <div className={row}>
                    <p className={lbl}>📈 {t('gr2.title')} · {t('gr2.collected')}</p>
                    <Seg value={gran} onPick={setGran} items={[['day', t('cx.sum.day')], ['week', t('cx.sum.week')], ['month', t('gr2.month')]]} />
                  </div>
                  <Curve pts={curve} />
                  <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">{m(curNow)} · {t(pct >= 0 ? 'gr.up' : 'gr.down', { pct: Math.abs(pct) })}</p>
                </div>
                <div className={`${card} space-y-2`}>
                  <p className={lbl}>{t('rep.credit')}</p>
                  <div className={`${row} text-xs`}><span>{t('rep.overdue')}</span><span className="font-extrabold text-amber-600 dark:text-amber-400">{m(OVERDUE)}</span></div>
                  <div className={`${row} text-xs`}><span>{t('rep.lateCustomers')}</span><span className="font-extrabold">{LATE_CLIENTS}</span></div>
                  <p className="text-[10px] text-slate-500">{t('rep.creditHint')}</p>
                </div>
              </div>
            </div>
          )}

          {/* ───────── Vendedor: punto de venta ───────── */}
          {view === 'pos' && (
            <div className="grid gap-3 sm:grid-cols-[1.3fr_1fr]">
              <div className="space-y-2">
                <p className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900">🔍 {t('pos.search')}</p>
                <div className="grid grid-cols-3 gap-2">
                  {emoji.slice(0, 6).map((e, i) => (
                    <div key={e} className={`${card} text-center`}>
                      <p className="text-2xl">{e}</p>
                      <p className="mt-1 truncate text-[11px] font-semibold">{t('home.sh.item', { n: i + 1 })}</p>
                      <p className="text-xs font-extrabold">{m([12, 9, 24, 8, 30, 15][i])}</p>
                      <p className={`text-[10px] font-semibold ${i === 4 ? 'text-red-600 dark:text-red-400' : 'text-slate-500'}`}>{i === 4 ? t('pos.out') : t('pos.stock', { n: [34, 6, 12, 22, 0, 18][i] })}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className={`${card} space-y-1.5 text-xs`}>
                <div className={row}><p className={lbl}>{t('pos.cart')}</p><span className="text-[10px] text-slate-500">{t('pos.items', { n: 3 })}</span></div>
                <div className={row}><span>{emoji[0]} {t('home.sh.item', { n: 1 })} × 2</span><span className="font-bold">{m(24)}</span></div>
                <div className={row}><span>{emoji[2]} {t('home.sh.item', { n: 3 })} × 1</span><span className="font-bold">{m(24)}</span></div>
                <div className={`${row} border-t border-slate-200 pt-2 text-sm dark:border-slate-800`}><span className="font-bold">{t('pos.total')}</span><span className="font-extrabold">{m(48)}</span></div>
                <div className="grid grid-cols-2 gap-1">
                  <span className="rounded-md bg-blue-600 py-1 text-center text-[11px] font-bold text-white">{t('pos.cashSale')}</span>
                  <span className="rounded-md bg-slate-100 py-1 text-center text-[11px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{t('pos.creditSale')}</span>
                </div>
                <p className="rounded-lg bg-blue-600 py-2 text-center text-xs font-bold text-white">{t('pos.send')}</p>
              </div>
            </div>
          )}

          {/* ───────── Cajero: cobro y cierre de caja ───────── */}
          {view === 'cash' && day && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className={`${card} space-y-2 text-xs`}>
                <div className={row}><p className={lbl}>{t('cash.tabQueue')}</p><Pill tone="warn">{t('pos.pending')}</Pill></div>
                <div className={row}><span className="font-bold">{QUEUE[niche as Plain].what}</span><span className="text-[10px] text-slate-500">{t('cash.soldBy', { name: QUEUE[niche as Plain].by })}</span></div>
                <div className={`${row} text-sm`}><span className="font-bold">{t('cash.toCharge')}</span><span className="font-extrabold">{m(QUEUE[niche as Plain].total)}</span></div>
                <div className="grid grid-cols-3 gap-1 text-center text-[10px] font-bold">
                  <span className="rounded-md bg-blue-600 py-1 text-white">{t('cash.m.cash')}</span>
                  <span className="rounded-md bg-slate-100 py-1 text-slate-600 dark:bg-slate-800 dark:text-slate-300">{t('cash.m.qr_transfer')}</span>
                  <span className="rounded-md bg-slate-100 py-1 text-slate-600 dark:bg-slate-800 dark:text-slate-300">{t('cash.m.card')}</span>
                </div>
                <div className={row}><span>{t('cash.received')}</span><span className="font-bold">{m(QUEUE[niche as Plain].got)}</span></div>
                <div className={row}><span>{t('cash.change')}</span><span className="font-bold">{m(QUEUE[niche as Plain].got - QUEUE[niche as Plain].total)}</span></div>
                <p className="rounded-lg bg-blue-600 py-2 text-center font-bold text-white">{t('cash.confirm')}</p>
              </div>
              <div className={`${card} space-y-1.5 text-xs`}>
                <p className={lbl}>{t('cash.tabClose')} · {t('cash.openSince', { time: '08:00' })}</p>
                <div className={row}><span>{t('cash.openingCash')}</span><span className="font-bold">{m(day.open)}</span></div>
                <div className={row}><span>{t('home.sc.cashSales')}</span><span className="font-bold">{m(day.cash)}</span></div>
                <div className={row}><span>{t('home.sc.expenses')}</span><span className="font-bold text-red-600 dark:text-red-400">−{m(day.exp)}</span></div>
                <div className={`${row} text-slate-500`}><span>{t('home.sc.qr')}</span><span className="font-bold">{m(day.qr)}</span></div>
                <div className={`${row} border-t border-slate-200 pt-2 dark:border-slate-800`}><span>{t('cash.expectedNow')}</span><span className="font-extrabold">{m(day.open + day.cash - day.exp)}</span></div>
                <div className={row}><span>{t('cash.counted')}</span><span className="font-extrabold">{m(day.open + day.cash - day.exp)}</span></div>
                <p className="text-[11px] text-slate-500">{t('cash.diffNow', { amount: m(0) })}</p>
                <p className="rounded-lg bg-emerald-50 px-2 py-1.5 text-[11px] font-bold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">{t('cash.closedOk')}</p>
              </div>
            </div>
          )}

          {/* ───────── Almacenero: inventario ───────── */}
          {view === 'stock' && (
            <div className="space-y-2 sm:space-y-3">
              <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                <div className={card}><p className={lbl}>{t('inv.value')}</p><p className="mt-0.5 text-sm font-extrabold sm:text-lg">{m(6420)}</p><p className="text-[10px] text-slate-500">{t('inv.productsN', { n: 128 })}</p></div>
                <div className={card}><p className={lbl}>{t('inv.low')}</p><p className="mt-0.5 text-sm font-extrabold text-amber-600 sm:text-lg dark:text-amber-400">3</p></div>
                <div className={card}><p className={lbl}>{t('inv.out')}</p><p className="mt-0.5 text-sm font-extrabold text-red-600 sm:text-lg dark:text-red-400">1</p></div>
              </div>
              <ul className="space-y-1.5">
                {([[1, 34, 10, 'ok'], [2, 6, 8, 'warn'], [5, 0, 6, 'late'], [4, 22, 5, 'ok']] as const).map(([n, q, min, st]) => (
                  <li key={n} className={`${card} ${row}`}>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold">{emoji[n - 1]} {t('home.sh.item', { n })}</p>
                      <p className="text-[10px] text-slate-500">{t('inv.minN', { n: min })}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-extrabold">{q}</span>
                      {st !== 'ok' && <Pill tone={st}>{st === 'late' ? t('pos.out') : t('inv.low')}</Pill>}
                    </div>
                  </li>
                ))}
              </ul>
              <p className="rounded-lg bg-blue-50 px-2 py-1.5 text-[11px] font-bold text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">{t('inv.tabEntry')} · {t('inv.entryTitle')}</p>
            </div>
          )}

          {/* ───────── Tienda virtual ───────── */}
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
                {(niche === 'food' ? dishes : emoji).map((e, i) => (
                  <div key={e} className={`${card} text-center`}>
                    <p className="text-2xl sm:text-3xl">{e}</p>
                    <p className="mt-1 truncate text-[11px] font-semibold">{t('home.sh.item', { n: i + 1 })}</p>
                    <p className="text-xs font-extrabold">{m([12, 9, 24, 8, 30, 15][i])}</p>
                    <p className="mt-1 rounded-md bg-blue-50 py-0.5 text-[10px] font-bold text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">+ {t('home.sh.store.add')}</p>
                  </div>
                ))}
              </div>
              <p className="rounded-lg bg-emerald-50 px-2 py-1.5 text-[11px] font-bold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">🔔 {t('home.sh.store.new')} · {m(52)}</p>
            </div>
          )}

          {/* ───────── Mesero: mesas y comanda ───────── */}
          {view === 'tables' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className={card}>
                <div className={row}><p className={lbl}>🍽️ {t('rest.title')}</p><span className="text-[10px] text-slate-500">{t('rest.subtitle', { n: 8, total: 12 })}</span></div>
                <div className="mt-2 grid grid-cols-4 gap-1.5">
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                    <span key={n} className={`rounded-lg py-2 text-center text-xs font-extrabold ${n === 7 ? 'bg-blue-600 text-white ring-2 ring-blue-300' : [2, 4, 5, 8, 10, 11, 12].includes(n) ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-200' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}>{n}</span>
                  ))}
                </div>
              </div>
              <div className={`${card} space-y-1.5 text-xs`}>
                <p className={lbl}>{t('home.sh.table', { n: 7 })}</p>
                {([[0, 2, 9, 'served'], [1, 1, 12, 'preparing'], [2, 1, 7, 'pending']] as const).map(([d, q, v, st]) => (
                  <div key={d} className={row}>
                    <span className="min-w-0 truncate">{dishes[d]} {t('home.sh.item', { n: d + 1 })} × {q}</span>
                    <span className="flex items-center gap-2"><Pill tone={st === 'served' ? 'ok' : st === 'preparing' ? 'warn' : 'info'}>{t(`rest.k.${st}` as DictKey)}</Pill><span className="font-bold">{m(v * q)}</span></span>
                  </div>
                ))}
                <div className={`${row} border-t border-slate-200 pt-2 text-sm dark:border-slate-800`}><span className="font-bold">{t('pos.total')}</span><span className="font-extrabold">{m(37)}</span></div>
                <div className="grid grid-cols-2 gap-1 text-center text-[11px] font-bold">
                  <span className="rounded-md bg-blue-600 py-1.5 text-white">{t('rest.send')}</span>
                  <span className="rounded-md bg-slate-100 py-1.5 text-slate-600 dark:bg-slate-800 dark:text-slate-300">{t('rest.bill')}</span>
                </div>
              </div>
            </div>
          )}

          {/* ───────── Cocina ───────── */}
          {view === 'kitchen' && (
            <ul className="space-y-2">
              {([[7, 1, 1, 'preparing'], [7, 2, 1, 'pending'], [4, 0, 1, 'pending'], [2, 3, 1, 'ready']] as const).map(([mesa, d, q, st], i) => (
                <li key={i} className={`${card} ${row}`}>
                  <div className="min-w-0">
                    <p className="text-xs font-bold">{t('home.sh.table', { n: mesa })}</p>
                    <p className="truncate text-[11px] text-slate-500">{dishes[d]} {t('home.sh.item', { n: d + 1 })} × {q}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Pill tone={st === 'ready' ? 'ok' : st === 'preparing' ? 'warn' : 'info'}>{t(`rest.k.${st}` as DictKey)}</Pill>
                    {st !== 'ready' && <span className="rounded-md bg-blue-600 px-2 py-1 text-[10px] font-bold text-white">{t(st === 'pending' ? 'rest.next.pending' : 'rest.next.preparing')}</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {/* ───────── Menú digital con QR de la mesa ───────── */}
          {view === 'menu' && (
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <ul className="space-y-1.5">
                {dishes.map((e, i) => (
                  <li key={e} className={`${card} flex items-center justify-between`}>
                    <span className="text-xs font-bold">{e} {t('home.sh.item', { n: i + 1 })}</span>
                    <span className="text-sm font-extrabold">{m([9, 12, 7, 10][i])}</span>
                  </li>
                ))}
              </ul>
              <div className={`${card} flex flex-col items-center justify-center gap-2 text-center`}>
                <div className="grid h-20 w-20 grid-cols-5 gap-0.5 rounded-md bg-white p-1.5 dark:bg-slate-100" aria-hidden>
                  {Array.from({ length: 25 }, (_, i) => <span key={i} className={[0, 1, 2, 4, 5, 6, 10, 12, 14, 18, 20, 22, 23, 24, 8, 16].includes(i) ? 'rounded-[1px] bg-slate-900' : ''} />)}
                </div>
                <p className="max-w-[9rem] text-[11px] font-bold">{t('home.sh.menu.qr')}</p>
              </div>
            </div>
          )}

          {/* ───────── Recepción y técnico: órdenes de trabajo ───────── */}
          {view === 'orders' && (
            <div className="space-y-2">
              <div className={row}>
                <p className="text-xs font-extrabold sm:text-sm">🔧 {t('shop.title')}</p>
                <Pill tone="info">{t('shop.open')} · 4</Pill>
              </div>
              <ul className="space-y-2">
                {([[101, 'shop.k.vehicle', 'diagnosing', 0], [102, 'shop.k.motorcycle', 'in_progress', 140], [104, 'shop.k.device', 'waiting_approval', 60], [103, 'shop.k.device', 'done', 85]] as const).map(([n, kind, st, v]) => (
                  <li key={n} className={card}>
                    <div className={`${row} text-xs`}>
                      <span className="font-bold">{t('home.sh.job', { n })} · <span className="font-normal text-slate-500">{t(kind)}</span></span>
                      <Pill tone={st === 'done' ? 'ok' : st === 'waiting_approval' ? 'warn' : 'info'}>{t(`shop.s.${st}` as DictKey)}</Pill>
                    </div>
                    <div className={`${row} mt-1 text-[11px] text-slate-500`}>
                      <span>{t('shop.technician')}: {n % 2 === 0 ? 'Carlos' : 'Pedro'}</span>
                      {v > 0 && <span className="font-extrabold text-slate-900 dark:text-white">{m(v)}</span>}
                    </div>
                    {st === 'done' && <p className="mt-1.5 rounded-md bg-blue-600 py-1 text-center text-[11px] font-bold text-white">{t('shop.invoice')}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ───────── Cobrador: ruta, lista de clientes y tarjetas de cuotas ───────── */}
          {view === 'route' && (
            <div className="space-y-2 sm:space-y-3">
              <div className={row}>
                <p className="text-xs font-extrabold sm:text-sm">🛵 {t('home.sc.routeN', { n: 1 })}</p>
                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">● {t('col.online')} · {t('col.visited', { n: 31, total: route1.clients })}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"><div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.round((31 / route1.clients) * 100)}%` }} /></div>
              <div className="grid grid-cols-4 gap-1.5">
                {([['col.cash', route1.day.cash], ['col.digital', route1.day.qr], ['col.expenses', route1.day.exp], ['col.toDeliver', toDeliver]] as const).map(([k, v]) => (
                  <div key={k} className={card}><p className={lbl}>{t(k)}</p><p className="mt-0.5 whitespace-nowrap text-xs font-extrabold sm:text-sm">{m(v)}</p></div>
                ))}
              </div>
              <div className={row}>
                <Seg value={mode} onPick={setMode} items={[['list', t('card.viewList')], ['cards', t('card.viewCards')]]} />
                <span className="text-[10px] text-slate-500">{t('col.offline').split(':')[0]}</span>
              </div>

              {mode === 'list' && (
                <ul className="space-y-1.5">
                  {([[14, 30, 'sel', 'weekly'], [15, 12, 'paid', 'daily'], [16, 20, 'partial', 'daily'], [17, 25, 'late', 'weekly'], [18, 15, 'sel', 'daily'], [19, 10, 'paid', 'daily']] as const).map(([n, v, st, f]) => (
                    <li key={n} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
                      <div className="min-w-0">
                        <p className="text-xs font-bold">{t('home.mock.client', { n })} <span className="font-normal text-slate-500">· {t(`card.f.${f}` as DictKey)}</span></p>
                        <p className={`text-[10px] font-semibold ${st === 'paid' ? 'text-emerald-600 dark:text-emerald-400' : st === 'partial' ? 'text-blue-600 dark:text-blue-400' : st === 'late' ? 'text-red-600 dark:text-red-400' : 'text-slate-500'}`}>
                          {st === 'paid' ? t('card.legPaid') : st === 'partial' ? t('card.legPartial') : st === 'late' ? t('home.sc.late', { days: 3 }) : t('col.dueToday')}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-extrabold">{m(v)}</span>
                        {st !== 'paid' && <span className="rounded-md bg-blue-600 px-2 py-1 text-[10px] font-bold text-white">{t('col.collect')}</span>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {mode === 'cards' && (
                <div className="grid gap-2 sm:grid-cols-2">
                  {([
                    { n: 14, f: 'weekly', total: 12, v: 30, states: ['p', 'p', 'p', 'p', 'p', 'p', 'a', 's', 'n', 'n', 'n', 'n'], owes: 165 },
                    { n: 17, f: 'weekly', total: 8, v: 25, states: ['p', 'p', 'p', 'p', 'l', 's', 'n', 'n'], owes: 100 },
                  ] as const).map((c) => (
                    <div key={c.n} className={card}>
                      <div className={`${row} text-xs`}>
                        <span className="font-bold">{t('home.mock.client', { n: c.n })} · {t(`card.f.${c.f}` as DictKey)}</span>
                        <span className="font-extrabold">{t('card.owes', { amount: m(c.owes) })}</span>
                      </div>
                      <p className="text-[10px] text-slate-500">{t('card.progress', { done: c.states.filter((x) => x === 'p').length, total: c.total })} · {m(c.v)}{c.states.includes('l') ? ` · ${t('card.lateN', { n: 1 })}` : ''}</p>
                      <div className="mt-2 grid grid-cols-6 gap-1">
                        {c.states.map((s, i) => (
                          <span key={i} className={`grid h-7 place-items-center rounded-md text-[10px] font-extrabold ${s === 'p' ? 'bg-emerald-500 text-white' : s === 'a' ? 'bg-blue-500 text-white' : s === 'l' ? 'bg-red-500 text-white' : s === 's' ? 'bg-amber-400 text-slate-900 ring-2 ring-amber-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}>{i + 1}</span>
                        ))}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[9px] font-semibold text-slate-500">
                        <span>🟩 {t('card.legPaid')}</span><span>🟨 {t('card.legSel')}</span><span>🟦 {t('card.legPartial')}</span><span>🟥 {t('card.legLate')}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ───────── Caja de la ruta: inversión, caja anterior, cobrado, prestado, gastos y entrega ───────── */}
          {view === 'fund' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className={card}>
                <p className={lbl}>{t('fund.title')} · {t('home.sc.routeN', { n: 1 })}</p>
                <ul className="mt-2 space-y-1.5 text-xs">
                  <li className={row}><span>{t('cx.sum.prev')}</span><span className="font-bold">{m(route1.day.prev)}</span></li>
                  <li className={row}><span>{t('cx.sum.invest')}</span><span className="font-bold text-emerald-600 dark:text-emerald-400">+{m(route1.day.invest)}</span></li>
                  <li className={row}><span>{t('cx.sum.collected')}</span><span className="font-bold text-emerald-600 dark:text-emerald-400">+{m(route1.day.cash)}</span></li>
                  <li className={row}><span>{t('cx.sum.lent')}</span><span className="font-bold text-red-600 dark:text-red-400">−{m(route1.day.lent)}</span></li>
                  <li className={row}><span>{t('cx.sum.expenses')}</span><span className="font-bold text-red-600 dark:text-red-400">−{m(route1.day.exp)}</span></li>
                  <li className={`${row} border-t border-slate-200 pt-2 text-sm dark:border-slate-800`}><span className="font-bold">{t('cx.sum.current')}</span><span className="font-extrabold">{m(currentOf(route1.day))}</span></li>
                  <li className={`${row} text-slate-500`}><span>{t('home.sc.qr')}</span><span className="font-bold">{m(route1.day.qr)}</span></li>
                </ul>
                <p className="mt-2 text-[10px] text-slate-500">{t('fund.formula')}</p>
              </div>
              <div className={`${card} space-y-2 text-xs`}>
                <p className={lbl}>{t('col.settle')}</p>
                <div className={row}><span>{t('fund.deliver')}</span><span className="font-extrabold">{m(toDeliver)}</span></div>
                <p className="text-[11px] text-slate-500">{t('fund.stays', { amount: m(currentOf(route1.day) - toDeliver) })}</p>
                <p className="rounded-lg bg-blue-600 py-2 text-center font-bold text-white">{t('col.settleBtn')}</p>
                <p className="text-[10px] text-slate-500">{t('col.settleHint')}</p>
              </div>
            </div>
          )}

          {/* ───────── Supervisor: rutas y cajas ───────── */}
          {view === 'sup' && (
            <div className="space-y-2 sm:space-y-3">
              <div className={row}>
                <p className="text-xs font-extrabold sm:text-sm">{t('sup.title')}</p>
                {periodSeg}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {ROUTES.map((r) => {
                  const f = r[period];
                  return (
                    <div key={r.n} className={card}>
                      <div className={row}>
                        <p className="text-xs font-extrabold">{t('home.sc.routeN', { n: r.n })} · {perLbl}</p>
                        <span className="text-[10px] text-slate-500">{t('sup.customers', { n: r.clients })} · <span className="text-red-600 dark:text-red-400">{t('sup.late', { n: r.late })}</span></span>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                        <p><span className="text-slate-500">{t('cx.sum.collected')}</span><br /><b className="text-base">{m(f.cash + f.qr)}</b></p>
                        <p><span className="text-slate-500">{t('cx.sum.lent')}</span><br /><b className="text-base">{m(f.lent)}</b></p>
                        <p><span className="text-slate-500">{t('cx.sum.current')}</span><br /><b className="text-base">{m(currentOf(f))}</b></p>
                        <p><span className="text-slate-500">{t('cx.sum.portfolio')}</span><br /><b className="text-base">{m(r.portfolio)}</b></p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ───────── Veltrix IA: consultas sobre los datos del negocio ───────── */}
          {view === 'ia' && (
            <div className="space-y-2 sm:space-y-3">
              <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
                <div className={card}><p className={lbl}>{t('ai.usage')}</p><p className="mt-0.5 text-sm font-extrabold sm:text-lg">38 / 200</p></div>
                <div className={card}><p className={lbl}>{t('ai.usageDay')}</p><p className="mt-0.5 text-sm font-extrabold sm:text-lg">4 / 20</p></div>
              </div>
              <div className={card}>
                <p className={lbl}>✨ {t('ai.try')}</p>
                <ul className="mt-2 space-y-1.5">
                  {(niche === 'field' ? (['ai.s1', 'ai.s2', 'ai.s4'] as const) : niche === 'service' ? (['ai.s5', 'ai.s6'] as const) : (['ai.s3', 'ai.s5', 'ai.s6'] as const)).map((k) => (
                    <li key={k} className="rounded-lg bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">{t(k)}</li>
                  ))}
                </ul>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900">
                <span className="min-w-0 flex-1 truncate">{t('ai.placeholder')}</span>
                <span className="rounded-md bg-blue-600 px-2 py-1 text-[10px] font-bold text-white">➤</span>
              </div>
              <p className="text-[10px] text-slate-500">{t('ai.privacy')}</p>
            </div>
          )}

          {/* ───────── Recorrido: quién hace qué en cada paso ───────── */}
          {view === 'flow' && (
            <div className="space-y-3">
              <ol className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <li key={i} className={`${card} flex items-start gap-3`}>
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-blue-600 text-xs font-extrabold text-white">{i}</span>
                    <div className="min-w-0">
                      <p className="text-xs font-extrabold text-blue-600 dark:text-blue-400">{t(`home.sh.fl.${niche}.${i}.r` as DictKey)}</p>
                      <p className="text-xs text-slate-600 dark:text-slate-300">{t(`home.sh.fl.${niche}.${i}.a` as DictKey)}</p>
                    </div>
                  </li>
                ))}
              </ol>
              {niche === 'field' && (
                <div className={card}>
                  <p className={lbl}>🛡️ {t('home.sh.fl.ti')}</p>
                  <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
                    {(['who', 'when', 'where'] as const).map((x) => (
                      <div key={x} className="min-w-0 rounded-lg bg-slate-50 px-1 py-2 dark:bg-slate-800">
                        <dt className="text-[9px] font-semibold uppercase text-slate-500">{t(`home.sh.fl.${x}` as DictKey)}</dt>
                        <dd className="mt-0.5 text-[11px] font-extrabold leading-tight">{t(`home.sh.fl.${x === 'who' ? 'wv' : x === 'when' ? 'tv' : 'pv'}` as DictKey)}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
