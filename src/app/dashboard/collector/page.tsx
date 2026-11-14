'use client';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { rpc } from '../../../lib/supabase';
import { Card } from '../shell';
import { ui } from '../../site-header';
import { useT } from '../../i18n';
import type { DictKey } from '../../i18n/es';
import { money, parseAmount } from '../format';
import { useStaff } from '../staff-context';
import { useSync } from '../sync';
import { CreditCard, applyPayment, freqOf, type Credit, type Freq, type Method } from './credit-card';
import { LoanForm, RATING_DOT, type LoanPolicy } from './loan-form';
import { DaysTable, type DayRow } from './days-table';
import { CutForm } from './cut-form';

/* ------------------------------------------------------------------
 * Cobrador de calle: trabaja SIN internet.
 *  - "El día" se descarga y queda guardado en el teléfono.
 *  - Cada cobro, visita o gasto entra a una cola local con su propio id.
 *  - Cuando hay señal, la cola se envía sola; repetir un envío no duplica nada.
 * ------------------------------------------------------------------ */

type VisitResult = 'no_one_home' | 'promise' | 'refused' | 'other';
type Customer = {
  id: string; name: string; phone: string | null; address: string | null; lat: number | null; lng: number | null;
  balance: number; overdue: number; due_today: number; next_due: string | null; visited_today: boolean;
  credits?: Credit[];
  rating?: string;
  last_visit?: { at: string; result: VisitResult; notes: string | null; promise_date: string | null; promise_amount: number | null } | null;
};
type Settlement = { id: string; at: string; status: string; cash: number; expenses: number; deliver: number };
type Route = {
  id: string; name: string; branch: string; currency: string; today: string;
  unsettled_cash: number; unsettled_digital: number; unsettled_expenses: number; unsettled_loans?: number;
  fund_balance?: number; fund_float?: number;
  period?: Period; liquidations?: Liquidation[]; days?: DayRow[]; can_liquidate?: boolean; can_invest?: boolean;
  policy?: LoanPolicy; can_loan?: boolean; can_customers?: boolean; can_interest?: boolean;
  customers: Customer[]; settlements: Settlement[];
};
type Period = { since: string | null; opening: number; investments: number; withdrawals: number; collected_cash: number;
  collected_digital: number; lent: number; collector_expenses: number; expected: number };
type Liquidation = { id: string; created_at: string; expected: number; counted: number; difference: number; closing: number;
  op_expenses: number; payments_out: number; withdrawals: number };
type Day = { generated_at: string; routes: Route[] };
type Op =
  | { kind: 'payment'; id: string; at: string; route: string; customer: string; method: Method; amount: number; order?: string }
  | { kind: 'visit'; id: string; at: string; route: string; customer: string; result: VisitResult; promise_date?: string; promise_amount?: number; notes?: string; lat?: number; lng?: number }
  | { kind: 'expense'; id: string; at: string; route: string; amount: number; description: string };

const okBox = 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300';
const errBox = 'border-red-300 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400';
const VISITS: VisitResult[] = ['no_one_home', 'promise', 'refused', 'other'];

/** Suma un movimiento local (aún sin señal) a la fila de hoy */
function bumpToday(r: { today: string; days?: DayRow[] }, add: Partial<Record<'cash' | 'digital' | 'payments' | 'lent' | 'expenses', number>>): DayRow[] | undefined {
  if (!r.days) return r.days;
  const has = r.days.some((d) => d.day === r.today);
  const base: DayRow[] = has ? r.days : [{ day: r.today, cash: 0, digital: 0, payments: 0, lent: 0, expenses: 0, cut_at: null }, ...r.days];
  return base.map((d) => d.day !== r.today ? d : {
    ...d, cash: Number(d.cash) + (add.cash ?? 0), digital: Number(d.digital) + (add.digital ?? 0), payments: Number(d.payments) + (add.payments ?? 0),
    lent: Number(d.lent) + (add.lent ?? 0), expenses: Number(d.expenses) + (add.expenses ?? 0),
  });
}

const load = <T,>(k: string, d: T): T => { try { return JSON.parse(localStorage.getItem(k) ?? 'null') ?? d; } catch { return d; } };
const save = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* lleno */ } };

/** Ubicación aproximada, sin bloquear si el teléfono no la da en 5 s */
function getPosition(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6) }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 120000 },
    );
  });
}

export default function CollectorPage() {
  const { t, lang } = useT();
  const { userId } = useStaff();
  const DAY_KEY = `vx_collector_day_${userId}`;
  const QUEUE_KEY = `vx_collector_queue_${userId}`;

  const [day, setDay] = useState<Day | null>(null);
  const [queue, setQueue] = useState<Op[]>([]);
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [routeId, setRouteId] = useState('');
  const [sel, setSel] = useState<Customer | null>(null);
  const [panel, setPanel] = useState<'pay' | 'visit' | 'expense' | 'settle' | 'loan' | null>(null);
  const [view, setView] = useState<'cards' | 'list'>('list');
  const [freq, setFreq] = useState<Freq | 'all'>('all');
  useEffect(() => { const v = load<string>('vx_col_view', 'list'); if (v === 'cards' || v === 'list') setView(v); }, []);
  const pickView = (v: 'cards' | 'list') => { setView(v); save('vx_col_view', v); };
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const flushing = useRef(false);

  const flash = (ok: boolean, text: string) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 5000); };

  // Lo guardado en el teléfono aparece al instante, aun sin señal
  useEffect(() => {
    const d = load<Day | null>(DAY_KEY, null);
    if (d) { setDay(d); setRouteId((r) => r || d.routes[0]?.id || ''); }
    setQueue(load<Op[]>(QUEUE_KEY, []));
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, [DAY_KEY, QUEUE_KEY]);

  const refresh = useCallback(async () => {
    try {
      const d = await rpc<Day>('collector_day');
      setDay(d);
      save(DAY_KEY, d);
      setRouteId((r) => (d.routes.some((x) => x.id === r) ? r : d.routes[0]?.id ?? ''));
    } catch { /* sin señal: seguimos con lo guardado */ }
  }, [DAY_KEY]);

  // Envía la cola, de a uno y en orden
  const flush = useCallback(async (force = false) => {
    let sent = 0;
    if (flushing.current) return;
    flushing.current = true;
    setSyncing(true);
    try {
      let pending = load<Op[]>(QUEUE_KEY, []);
      while (pending.length) {
        const op = pending[0];
        try {
          if (op.kind === 'payment') {
            await rpc('register_payment', {
              p_customer: op.customer, p_origin: 'field_route', p_method: op.method, p_amount: op.amount,
              p_route: op.route, p_offline_uuid: op.id, p_collected_at: op.at, p_order: op.order ?? null,
            });
          } else if (op.kind === 'visit') {
            await rpc('collector_visit', {
              p_route: op.route, p_customer: op.customer, p_result: op.result,
              p_promise_date: op.promise_date ?? null, p_promise_amount: op.promise_amount ?? null,
              p_notes: op.notes ?? null, p_lat: op.lat ?? null, p_lng: op.lng ?? null,
              p_offline_uuid: op.id, p_visited_at: op.at,
            });
          } else {
            await rpc('collector_expense', { p_route: op.route, p_amount: op.amount, p_description: op.description, p_offline_uuid: op.id });
          }
          sent++;
          await new Promise((r) => setTimeout(r, 150)); // de a uno, sin saturar la señal
        } catch (err) {
          const m = (err as Error).message;
          // Sin señal: se reintenta más tarde. Rechazo real (p. ej. monto mayor a la deuda): se descarta y se avisa.
          if (/fetch|network|Failed|Load failed/i.test(m) || !navigator.onLine) break;
          flash(false, `${t('col.rejected')}: ${m}`);
        }
        pending = pending.slice(1);
        save(QUEUE_KEY, pending);
        setQueue(pending);
      }
    } finally {
      flushing.current = false;
      setSyncing(false);
    }
    // Solo vuelve a descargar el día si se envió algo o si se pidió
    if (sent > 0 || force) await refresh();
  }, [QUEUE_KEY, refresh, t]);

  // Al abrir y al volver la señal: envía lo pendiente y actualiza el día.
  // Si quedó algo sin enviar, reintenta cada 5 min (solo si hay pendientes).
  useEffect(() => {
    if (!online) return;
    flush(true);
    const id = setInterval(() => { if (load<Op[]>(QUEUE_KEY, []).length > 0) flush(); }, 5 * 60_000);
    return () => clearInterval(id);
  }, [online, flush, QUEUE_KEY]);
  // El día completo se vuelve a descargar unas 5 veces al día o con el botón ↻
  useSync(refresh);

  const enqueue = (op: Op) => {
    const next = [...load<Op[]>(QUEUE_KEY, []), op];
    save(QUEUE_KEY, next);
    setQueue(next);
    // Refleja el cambio en lo guardado para seguir trabajando sin señal
    setDay((d) => {
      if (!d) return d;
      const nd: Day = {
        ...d,
        routes: d.routes.map((r) => {
          if (r.id !== op.route) return r;
          if (op.kind === 'expense') return { ...r, unsettled_expenses: Number(r.unsettled_expenses) + op.amount,
            days: bumpToday(r, { expenses: op.amount }),
            fund_balance: r.fund_balance === undefined ? undefined : Number(r.fund_balance) - op.amount };
          const customers = r.customers.map((c) => {
            if (c.id !== op.customer) return c;
            if (op.kind === 'payment') {
              const paid = op.amount;
              let credits = c.credits;
              if (credits) {
                if (op.order) credits = credits.map((k) => (k.id === op.order ? applyPayment(k, paid, op.at) : k));
                else {
                  let left = paid;
                  credits = credits.map((k) => {
                    const open = k.installments.reduce((s, i) => s + Math.max(0, Number(i.amount) - Number(i.paid)), 0);
                    const take = Math.min(left, open);
                    left -= take;
                    return take > 0 ? applyPayment(k, take, op.at) : k;
                  });
                }
              }
              return {
                ...c, visited_today: true, credits,
                balance: Math.max(0, Number(c.balance) - paid),
                overdue: Math.max(0, Number(c.overdue) - paid),
                due_today: Math.max(0, Number(c.due_today) - Math.max(0, paid - Number(c.overdue))),
              };
            }
            return { ...c, visited_today: true };
          });
          const cashAdd = op.kind === 'payment' && op.method === 'cash' ? op.amount : 0;
          const digAdd = op.kind === 'payment' && op.method !== 'cash' ? op.amount : 0;
          return {
            ...r, customers,
            unsettled_cash: Number(r.unsettled_cash) + cashAdd,
            days: op.kind === 'payment' ? bumpToday(r, { cash: cashAdd, digital: digAdd, payments: 1 }) : r.days,
            fund_balance: r.fund_balance === undefined ? undefined : Number(r.fund_balance) + cashAdd,
            unsettled_digital: Number(r.unsettled_digital) + digAdd,
          };
        }),
      };
      save(DAY_KEY, nd);
      return nd;
    });
    if (navigator.onLine) flush();
  };

  const route = day?.routes.find((r) => r.id === routeId);
  const cardPay = (customer: string, order: string, amount: number, method: Method) => {
    if (!route) return;
    enqueue({ kind: 'payment', id: crypto.randomUUID(), at: new Date().toISOString(), route: route.id, customer, method, amount, order });
    flash(true, online ? t('col.paySaved') : t('col.savedOffline'));
  };
  // La ficha abierta se mantiene al día con lo guardado (tarjetas marcadas)
  const selNow = sel ? route?.customers.find((x) => x.id === sel.id) ?? sel : null;
  const fmt = (n: number) => money(Number(n), route?.currency ?? 'USD', lang);

  /* ---------- Pantallas ---------- */
  if (!day) {
    return <Card><p className={`text-sm ${ui.muted}`}>{online ? t('common.wait') : t('col.noDataOffline')}</p></Card>;
  }
  if (day.routes.length === 0) {
    return <Card><p className={`text-sm ${ui.muted}`}>{t('col.noRoute')}</p></Card>;
  }
  if (!route) return null;

  const pendingRoute = queue.filter((q) => q.route === route.id).length;
  const visited = route.customers.filter((c) => c.visited_today).length;
  const loans = Number(route.unsettled_loans ?? 0);
  const inHand = Number(route.unsettled_cash) - Number(route.unsettled_expenses) - loans;
  const fund = route.fund_balance === undefined ? null : Number(route.fund_balance);
  const opening = fund === null ? 0 : fund - inHand;
  const todayRow = route.days?.find((d) => d.day === route.today);
  const shown = freq === 'all' ? route.customers : route.customers.filter((c) => c.credits?.some((k) => freqOf(k) === freq));

  return (
    <div className="space-y-4">
      {/* Estado de conexión y sincronización */}
      <div className={`flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold ${online ? okBox : 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300'}`}>
        <span>{online ? `🟢 ${t('col.online')}` : `🟠 ${t('col.offline')}`}</span>
        <span className="flex-1 text-xs font-normal">
          {queue.length > 0 ? t('col.pending', { n: queue.length }) : t('col.synced')}
          {' · '}{t('col.updated', { time: new Date(day.generated_at).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' }) })}
        </span>
        {online && (
          <button type="button" onClick={() => flush(true)} disabled={syncing} className="rounded-lg border border-current px-2.5 py-1 text-xs cursor-pointer disabled:opacity-50">
            {syncing ? '…' : `↻ ${t('col.sync')}`}
          </button>
        )}
      </div>

      {msg && <p className={`rounded-xl border p-3 text-sm font-semibold ${msg.ok ? okBox : errBox}`}>{msg.text}</p>}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-extrabold sm:text-2xl">🛵 {route.name}</h1>
          <p className={`text-sm ${ui.muted}`}>{route.branch} · {t('col.visited', { n: visited, total: route.customers.length })}</p>
        </div>
        {day.routes.length > 1 && (
          <select value={routeId} onChange={(e) => setRouteId(e.target.value)} className={`${ui.input} !w-auto`}>
            {day.routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        )}
      </div>

      {/* Caja de la ruta: lo que hay para prestar y lo que llevo encima */}
      {fund !== null && (
        <Card className="!p-4">
          <div className="flex items-baseline justify-between gap-2">
            <p className={`text-xs font-bold uppercase ${ui.muted}`}>💼 {t('fund.title')}</p>
            <p className={`text-2xl font-extrabold ${fund < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{fmt(fund)}</p>
          </div>
          <p className={`mt-1 text-[11px] ${ui.muted}`}>{t('liq.formula')}</p>
        </Card>
      )}
      {fund !== null && route.days && (
        <Card className="!p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-bold">📅 {t('day.today')}</p>
            <span className={`text-[11px] ${ui.muted}`}>{t('day.auto')}</span>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-center">
            <div><p className={`text-[11px] uppercase ${ui.muted}`}>{t('col.cash')}</p><p className="font-extrabold">{fmt(todayRow?.cash ?? 0)}</p></div>
            <div><p className={`text-[11px] uppercase ${ui.muted}`}>{t('loan.lent')}</p><p className="font-extrabold text-violet-600 dark:text-violet-400">{fmt(todayRow?.lent ?? 0)}</p></div>
            <div><p className={`text-[11px] uppercase ${ui.muted}`}>{t('col.expenses')}</p><p className="font-extrabold text-red-600 dark:text-red-400">{fmt(todayRow?.expenses ?? 0)}</p></div>
          </div>
        </Card>
      )}
      {fund !== null && <p className={`text-xs font-bold uppercase ${ui.muted}`}>{t('day.sinceLiq')}</p>}
      <div className={`grid gap-2 text-center ${fund !== null ? 'grid-cols-2 sm:grid-cols-4' : loans !== 0 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'}`}>
        {fund !== null && (
          <Card className="!p-3">
            <p className={`text-[11px] font-semibold uppercase ${ui.muted}`}>{t('liq.opening')}</p>
            <p className="font-extrabold">{fmt(opening)}</p>
          </Card>
        )}
        <Card className="!p-3">
          <p className={`text-[11px] font-semibold uppercase ${ui.muted}`}>{t('col.cash')}</p>
          <p className="font-extrabold">{fmt(route.unsettled_cash)}</p>
        </Card>
        {(fund !== null || loans !== 0) && (
          <Card className="!p-3">
            <p className={`text-[11px] font-semibold uppercase ${ui.muted}`}>{t('loan.lent')}</p>
            <p className="font-extrabold text-violet-600 dark:text-violet-400">{fmt(loans)}</p>
          </Card>
        )}
        <Card className="!p-3">
          <p className={`text-[11px] font-semibold uppercase ${ui.muted}`}>{t('col.expenses')}</p>
          <p className="font-extrabold text-red-600 dark:text-red-400">{fmt(route.unsettled_expenses)}</p>
        </Card>
        {fund === null && (
          <Card className="!p-3">
            <p className={`text-[11px] font-semibold uppercase ${ui.muted}`}>{t('col.toDeliver')}</p>
            <p className="font-extrabold text-emerald-600 dark:text-emerald-400">{fmt(inHand)}</p>
          </Card>
        )}
      </div>

      {route.can_loan && route.policy && (
        <button type="button" onClick={() => { setSel(null); setPanel('loan'); }} disabled={!online} className={`${ui.btnPrimary} w-full py-3`}>
          💸 {t('loan.title')}{!online ? ` · ${t('loan.needsSignal')}` : ''}
        </button>
      )}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => { setSel(null); setPanel('expense'); }} className={ui.btnGhost}>⛽ {t('col.addExpense')}</button>
        <button type="button" onClick={() => { setSel(null); setPanel('settle'); }} className={ui.btnGhost}>{fund !== null ? `📋 ${t('liq.summary')}` : `🏁 ${t('col.settle')}`}</button>
      </div>

      {/* Vista: tarjetas o lista, y frecuencia de cobro */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl border border-slate-300 p-0.5 dark:border-slate-700" role="tablist">
          {(['cards', 'list'] as const).map((v) => (
            <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => pickView(v)}
              className={`rounded-lg px-3 py-1.5 text-sm font-bold cursor-pointer ${view === v ? 'bg-blue-600 text-white' : ''}`}>
              {v === 'cards' ? `🗂️ ${t('card.viewCards')}` : `📋 ${t('card.viewList')}`}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          {(['all', 'daily', 'weekly', 'biweekly', 'monthly'] as const).map((f) => {
            const n = f === 'all' ? route.customers.length : route.customers.filter((c) => c.credits?.some((k) => freqOf(k) === f)).length;
            if (f !== 'all' && n === 0) return null;
            return (
              <button key={f} type="button" onClick={() => setFreq(f)}
                className={`rounded-full px-3 py-1 text-xs font-bold cursor-pointer ${freq === f ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'border border-slate-300 dark:border-slate-700'}`}>
                {f === 'all' ? t('card.all') : t(`card.f.${f}` as DictKey)} · {n}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tarjetas de cobro */}
      {view === 'cards' && (
        <div className="space-y-3">
          {shown.length === 0 && <Card><p className={`text-sm ${ui.muted}`}>{t('col.noCustomers')}</p></Card>}
          {shown.map((c) => (
            <Card key={c.id} className={`space-y-3 ${c.visited_today ? 'opacity-80' : ''}`}>
              <div className="flex items-start gap-3">
                <span className="text-xl">{c.visited_today ? '✅' : Number(c.overdue) > 0 ? '🔴' : Number(c.due_today) > 0 ? '🟡' : '⚪'}</span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate font-bold"><Dot r={c.rating} />{c.name}</p>
                  <p className={`truncate text-xs ${ui.muted}`}>{c.address ?? '—'}</p>
                  {c.last_visit && <Note v={c.last_visit} />}
                </div>
                <button type="button" onClick={() => { setSel(c); setPanel(null); }} className={`${ui.btnGhost} !px-3 !py-1.5 text-xs`}>👤 {t('card.profile')}</button>
              </div>
              <Credits c={c} filter={freq} today={route.today} policy={route.policy} fmt={fmt} onSave={(order, amount, method) => cardPay(c.id, order, amount, method)} />
              {(c.credits ?? []).length === 0 && <p className={`text-xs ${ui.muted}`}>{t('card.noCards')}</p>}
            </Card>
          ))}
        </div>
      )}

      {/* Clientes del día: primero los vencidos */}
      {view === 'list' && <ul className="space-y-2">
        {shown.length === 0 && <Card><p className={`text-sm ${ui.muted}`}>{t('col.noCustomers')}</p></Card>}
        {shown.map((c) => (
          <li key={c.id}>
            <button type="button" onClick={() => { setSel(c); setPanel(null); }}
              className={`flex w-full items-center gap-3 rounded-2xl p-4 text-left transition cursor-pointer ${ui.card} ${c.visited_today ? 'opacity-60' : ''} ${sel?.id === c.id ? 'ring-2 ring-blue-500' : ''}`}>
              <span className="text-xl">{c.visited_today ? '✅' : Number(c.overdue) > 0 ? '🔴' : Number(c.due_today) > 0 ? '🟡' : '⚪'}</span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate font-bold"><Dot r={c.rating} />{c.name}</p>
                <p className={`truncate text-xs ${ui.muted}`}>{c.address ?? '—'}</p>
                {c.last_visit && <Note v={c.last_visit} />}
              </div>
              <div className="text-right">
                <p className="text-sm font-extrabold">{fmt(Number(c.overdue) + Number(c.due_today))}</p>
                <p className={`text-[11px] ${ui.muted}`}>{t('col.ofBalance', { amount: fmt(c.balance) })}</p>
              </div>
            </button>
          </li>
        ))}
      </ul>}

      {/* Hoja inferior: cliente / gasto / rendición */}
      {(sel || panel) && (
        <div className="fixed inset-x-0 top-0 z-40 h-dvh">
          <div className="absolute inset-0 bg-black/50" onClick={() => { setSel(null); setPanel(null); }} />
          <div className="absolute inset-x-0 bottom-0 mx-auto max-h-[90dvh] max-w-xl overflow-y-auto overscroll-contain rounded-t-3xl bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] dark:bg-slate-900">
            <div className="mb-3 flex justify-end">
              <button type="button" onClick={() => { setSel(null); setPanel(null); }} aria-label={t('pos.close')} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-300 cursor-pointer dark:border-slate-700">✕</button>
            </div>

            {sel && !panel && (
              <CustomerSheet c={selNow ?? sel} fmt={fmt} onPay={() => setPanel('pay')} onVisit={() => setPanel('visit')}
                cards={<Credits c={selNow ?? sel} filter="all" today={route.today} policy={route.policy} fmt={fmt} onSave={(order, amount, method) => cardPay(sel.id, order, amount, method)} />} />
            )}
            {sel && panel === 'pay' && (
              <PayForm c={sel} fmt={fmt} onDone={(method, amount) => {
                enqueue({ kind: 'payment', id: crypto.randomUUID(), at: new Date().toISOString(), route: route.id, customer: sel.id, method, amount });
                flash(true, online ? t('col.paySaved') : t('col.savedOffline'));
                setSel(null); setPanel(null);
              }} />
            )}
            {sel && panel === 'visit' && (
              <VisitForm onDone={async (v) => {
                const pos = await getPosition();
                enqueue({ kind: 'visit', id: crypto.randomUUID(), at: new Date().toISOString(), route: route.id, customer: sel.id, ...v, ...(pos ?? {}) });
                flash(true, online ? t('col.visitSaved') : t('col.savedOffline'));
                setSel(null); setPanel(null);
              }} />
            )}
            {panel === 'expense' && (
              <ExpenseForm onDone={(amount, description) => {
                enqueue({ kind: 'expense', id: crypto.randomUUID(), at: new Date().toISOString(), route: route.id, amount, description });
                flash(true, online ? t('cash.movementSaved') : t('col.savedOffline'));
                setPanel(null);
              }} />
            )}
            {panel === 'loan' && route.policy && (
              <LoanForm routeId={route.id} today={route.today} policy={route.policy} canInterest={!!route.can_interest}
                canCustomers={route.can_customers !== false} fmt={fmt}
                onDone={async (text, ok) => { flash(ok, text); setPanel(null); await refresh(); }} />
            )}
            {panel === 'settle' && fund !== null && <PeriodSheet route={route} fmt={fmt} fund={fund} online={online}
              onChanged={async (text) => { flash(true, text); await refresh(); }} onError={(text) => flash(false, text)} />}
            {panel === 'settle' && fund === null && (
              <SettleSheet route={route} fmt={fmt} online={online} pending={pendingRoute}
                onClosed={async () => { await refresh(); flash(true, t('col.settled')); setPanel(null); }} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Última anotación de visita ---------- */
function Note({ v }: { v: NonNullable<Customer['last_visit']> }) {
  const { t, lang } = useT();
  const when = new Date(v.at).toLocaleDateString(lang, { day: '2-digit', month: '2-digit' });
  return (
    <p className="mt-1 line-clamp-2 rounded-lg bg-slate-50 px-2 py-1 text-[11px] text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
      📝 {when} · {t(`col.v.${v.result}` as DictKey)}
      {v.promise_date ? ` · ${t('card.promise', { date: new Date(v.promise_date + 'T12:00:00').toLocaleDateString(lang, { day: '2-digit', month: '2-digit' }) })}` : ''}
      {v.notes ? ` · ${v.notes}` : ''}
    </p>
  );
}

/* ---------- Ficha rápida del cliente ---------- */
/* ---------- Créditos del cliente: una tarjeta por crédito, todas dentro del mismo cliente ---------- */
function Dot({ r }: { r?: string }) {
  const { t } = useT();
  if (!r) return null;
  return <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${RATING_DOT[r] ?? RATING_DOT.new}`} title={t(`rating.${r}` as DictKey)} />;
}

function Credits({ c, filter, today, policy, fmt, onSave }: {
  c: Customer; filter: Freq | 'all'; today: string; policy?: LoanPolicy; fmt: (n: number) => string;
  onSave: (order: string, amount: number, method: Method) => void;
}) {
  const { t, lang } = useT();
  const all = c.credits ?? [];
  const list = all.filter((k) => filter === 'all' || freqOf(k) === filter);
  if (all.length === 0) return <p className={`text-xs ${ui.muted}`}>{t('card.noCards')}</p>;
  return (
    <div className="space-y-4">
      {list.map((k) => {
        // Atraso contado desde las fechas del crédito: borde rojo al llegar al tope de su frecuencia
        const late = k.installments.filter((i) => i.due < today && Number(i.amount) - Number(i.paid) > 0.004).length;
        const f = freqOf(k);
        const limit = Number((policy as Record<string, number> | undefined)?.[`late_${f}`] ?? ({ daily: 10, weekly: 2, biweekly: 1, monthly: 1 })[f]);
        const border = late >= limit && limit > 0 ? 'border-4 border-red-500' : late > 0 ? 'border-2 border-amber-400' : 'border border-slate-200 dark:border-slate-800';
        return (
        <div key={k.id} className={`space-y-2 rounded-xl p-3 ${border}`}>
          {late > 0 && (
            <p className={`text-xs font-bold ${late >= limit ? 'text-red-600 dark:text-red-400' : 'text-amber-700 dark:text-amber-300'}`}>
              {late >= limit ? '🚨' : '⚠️'} {t('card.lateN', { n: late })}
            </p>
          )}
          {all.length > 1 && (
            <p className="text-xs font-bold">
              💳 {t('card.creditN', { n: all.indexOf(k) + 1, total: all.length })}
              <span className={`font-normal ${ui.muted}`}> · {new Date(k.created).toLocaleDateString(lang)} · {fmt(Number(k.total))}</span>
            </p>
          )}
          <CreditCard credit={k} today={today} fmt={fmt} onSave={(amount, method) => onSave(k.id, amount, method)} />
        </div>
        );
      })}
    </div>
  );
}

function CustomerSheet({ c, fmt, onPay, onVisit, cards }: { c: Customer; fmt: (n: number) => string; onPay: () => void; onVisit: () => void; cards: ReactNode }) {
  const { t, lang } = useT();
  const map = c.lat != null && c.lng != null
    ? `https://maps.google.com/?q=${c.lat},${c.lng}`
    : c.address ? `https://maps.google.com/?q=${encodeURIComponent(c.address)}` : null;
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold">{c.name}</h2>
        <p className={`text-sm ${ui.muted}`}>{c.address ?? '—'}</p>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-slate-50 p-2 dark:bg-slate-800/50">
          <p className={`text-[11px] uppercase ${ui.muted}`}>{t('cust.overdue')}</p>
          <p className={`font-extrabold ${Number(c.overdue) > 0 ? 'text-red-600 dark:text-red-400' : ''}`}>{fmt(c.overdue)}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-2 dark:bg-slate-800/50">
          <p className={`text-[11px] uppercase ${ui.muted}`}>{t('col.dueToday')}</p>
          <p className="font-extrabold">{fmt(c.due_today)}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-2 dark:bg-slate-800/50">
          <p className={`text-[11px] uppercase ${ui.muted}`}>{t('cust.balance')}</p>
          <p className="font-extrabold">{fmt(c.balance)}</p>
        </div>
      </div>
      {c.next_due && <p className={`text-xs ${ui.muted}`}>{t('col.nextDue', { date: new Date(c.next_due + 'T12:00:00').toLocaleDateString(lang) })}</p>}
      <div className="grid grid-cols-2 gap-2">
        {c.phone ? <a href={`tel:${c.phone}`} className={ui.btnGhost}>📞 {t('col.call')}</a> : <span />}
        {map ? <a href={map} target="_blank" rel="noopener noreferrer" className={ui.btnGhost}>📍 {t('col.map')}</a> : <span />}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={onVisit} className={ui.btnGhost}>📝 {t('col.visit')}</button>
        <button type="button" onClick={onPay} className={`${ui.btnPrimary} py-3`}>💵 {t('col.collect')}</button>
      </div>
      {(c.credits ?? []).length > 0 && (
        <div className="space-y-2 border-t border-slate-200 pt-4 dark:border-slate-800">
          <p className="font-bold">🗂️ {t('card.viewCards')}</p>
          {cards}
        </div>
      )}
    </div>
  );
}

function PayForm({ c, fmt, onDone }: { c: Customer; fmt: (n: number) => string; onDone: (m: Method, a: number) => void }) {
  const { t } = useT();
  const suggested = Number(c.overdue) + Number(c.due_today) || Number(c.balance);
  const [amount, setAmount] = useState(String(Math.min(suggested, Number(c.balance))));
  const [method, setMethod] = useState<Method>('cash');
  const n = parseAmount(amount);
  const invalid = Number.isNaN(n) || n <= 0 || n > Number(c.balance);
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold">💵 {c.name}</h2>
      <div>
        <label className={ui.label}>{t('cash.amount')}</label>
        <input inputMode="decimal" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} className={`${ui.input} text-2xl font-bold`} />
        {!Number.isNaN(n) && n > Number(c.balance) && <p className="mt-1 text-sm font-semibold text-red-600 dark:text-red-400">{t('cash.exceeds')}</p>}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {(['cash', 'qr_transfer', 'card'] as Method[]).map((m) => (
          <button key={m} type="button" onClick={() => setMethod(m)}
            className={`rounded-xl px-2 py-2.5 text-xs font-bold transition cursor-pointer ${method === m ? 'bg-blue-600 text-white' : 'border border-slate-300 dark:border-slate-700'}`}>
            {t(`cash.m.${m}` as DictKey)}
          </button>
        ))}
      </div>
      <button type="button" disabled={invalid} onClick={() => onDone(method, Math.round(n * 100) / 100)} className={`${ui.btnPrimary} w-full py-3 text-base`}>
        {t('cash.confirm')} {invalid ? '' : `· ${fmt(n)}`}
      </button>
    </div>
  );
}

function VisitForm({ onDone }: { onDone: (v: { result: VisitResult; promise_date?: string; promise_amount?: number; notes?: string }) => void }) {
  const { t } = useT();
  const [result, setResult] = useState<VisitResult>('no_one_home');
  const [date, setDate] = useState('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const promiseInvalid = result === 'promise' && !date;
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold">📝 {t('col.visit')}</h2>
      <div className="grid grid-cols-2 gap-2">
        {VISITS.map((v) => (
          <button key={v} type="button" onClick={() => setResult(v)}
            className={`rounded-xl px-2 py-2.5 text-sm font-semibold transition cursor-pointer ${result === v ? 'bg-blue-600 text-white' : 'border border-slate-300 dark:border-slate-700'}`}>
            {t(`col.v.${v}` as DictKey)}
          </button>
        ))}
      </div>
      {result === 'promise' && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={ui.label}>{t('col.promiseDate')}</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={ui.input} />
          </div>
          <div>
            <label className={ui.label}>{t('cash.amount')}</label>
            <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={ui.input} />
          </div>
        </div>
      )}
      <div>
        <label className={ui.label}>{t('cust.notes')}</label>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} className={ui.input} />
      </div>
      <button type="button" disabled={busy || promiseInvalid} className={`${ui.btnPrimary} w-full py-3`}
        onClick={async () => {
          setBusy(true);
          const a = parseAmount(amount);
          await onDone({ result, promise_date: date || undefined, promise_amount: Number.isNaN(a) || a <= 0 ? undefined : a, notes: notes || undefined });
          setBusy(false);
        }}>
        {busy ? t('common.wait') : t('col.saveVisit')}
      </button>
    </div>
  );
}

function ExpenseForm({ onDone }: { onDone: (amount: number, description: string) => void }) {
  const { t } = useT();
  const [amount, setAmount] = useState('');
  const [desc, setDesc] = useState('');
  const n = parseAmount(amount);
  const invalid = Number.isNaN(n) || n <= 0 || !desc.trim();
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold">⛽ {t('col.addExpense')}</h2>
      <p className={`text-sm ${ui.muted}`}>{t('col.expenseHint')}</p>
      <div>
        <label className={ui.label}>{t('cash.amount')}</label>
        <input inputMode="decimal" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} className={ui.input} />
      </div>
      <div>
        <label className={ui.label}>{t('cash.reason')}</label>
        <input value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={200} className={ui.input} />
      </div>
      <button type="button" disabled={invalid} onClick={() => onDone(Math.round(n * 100) / 100, desc.trim())} className={`${ui.btnPrimary} w-full py-3`}>
        {t('cash.addMovement')}
      </button>
    </div>
  );
}

/* ---------- Resumen desde el último corte (la caja la cuadra el administrador o supervisor) ---------- */
function PeriodSheet({ route, fmt, fund, online, onChanged, onError }: {
  route: Route; fmt: (n: number) => string; fund: number; online: boolean;
  onChanged: (text: string) => Promise<void>; onError: (text: string) => void;
}) {
  const { t, lang } = useT();
  const [cutting, setCutting] = useState(false);
  const [mv, setMv] = useState<{ type: 'investment' | 'withdrawal'; amount: string; note: string } | null>(null);
  const moveFund = async () => {
    if (!mv) return;
    const n = parseAmount(mv.amount);
    if (Number.isNaN(n) || n <= 0) return;
    try {
      await rpc('route_fund_move', { p_route: route.id, p_type: mv.type, p_amount: n, p_note: mv.note || null });
      setMv(null); await onChanged(t('fund.saved'));
    } catch (e) {
      const m = (e as Error).message;
      onError(m.includes('ROUTE_FUND_LOW') ? t('fund.low') : m.includes('ROUTE_NO_PERMISSION') ? t('loan.e.perm') : t('err.generic'));
    }
  };
  const p = route.period;
  const cash = Number(route.unsettled_cash), exp = Number(route.unsettled_expenses), lent = Number(route.unsettled_loans ?? 0);
  const start = fund - (cash - exp - lent);
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold">📋 {t('liq.summary')}</h2>
      <p className={`text-xs ${ui.muted}`}>{p?.since ? t('liq.since', { date: new Date(p.since).toLocaleString(lang, { dateStyle: 'medium', timeStyle: 'short' }) }) : t('liq.noCutYet')}</p>
      <ul className="space-y-1 text-sm">
        <li className="flex justify-between"><span>{t('liq.opening')}</span><b>{fmt(start)}</b></li>
        <li className="flex justify-between"><span>+ {t('col.cash')}</span><b>{fmt(cash)}</b></li>
        <li className="flex justify-between"><span>− {t('loan.lent')}</span><b className="text-violet-600 dark:text-violet-400">{fmt(lent)}</b></li>
        <li className="flex justify-between"><span>− {t('col.expenses')}</span><b className="text-red-600 dark:text-red-400">{fmt(exp)}</b></li>
        <li className="flex justify-between border-t border-slate-200 pt-2 text-base dark:border-slate-800"><span>💼 {t('fund.title')}</span><b>{fmt(fund)}</b></li>
        {Number(route.unsettled_digital) > 0 && <li className={`flex justify-between text-xs ${ui.muted}`}><span>{t('col.digital')}</span><span>{fmt(route.unsettled_digital)}</span></li>}
      </ul>
      {(route.days ?? []).length > 0 && <DaysTable days={route.days ?? []} fmt={fmt} />}
      <p className="rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-800/50">✂️ {t('liq.collectorHint')}</p>
      {(route.can_liquidate || route.can_invest) && route.period && (
        <div className="space-y-2 rounded-xl border border-blue-200 p-3 dark:border-blue-500/30">
          <p className="text-xs font-bold">🔑 {t('liq.delegated')}</p>
          {!online && <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">{t('loan.e.offline')}</p>}
          {cutting ? (
            <CutForm routeId={route.id} routeName={route.name} period={route.period} m={fmt} onCancel={() => setCutting(false)}
              onDone={async (text) => { setCutting(false); await onChanged(text); }} onError={onError} />
          ) : mv ? (
            <div className="grid gap-2">
              <input inputMode="decimal" autoFocus placeholder={t('cash.amount')} value={mv.amount} onChange={(e) => setMv({ ...mv, amount: e.target.value })} className={ui.input} />
              <input placeholder={t('cust.notes')} value={mv.note} onChange={(e) => setMv({ ...mv, note: e.target.value })} className={ui.input} />
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setMv(null)} className={ui.btnGhost}>{t('card.cancel')}</button>
                <button type="button" disabled={!online} onClick={moveFund} className={ui.btnPrimary}>{mv.type === 'investment' ? `➕ ${t('fund.invest')}` : `➖ ${t('fund.withdraw')}`}</button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {route.can_liquidate && <button type="button" disabled={!online} onClick={() => setCutting(true)} className={`${ui.btnPrimary} !py-2 text-sm`}>✂️ {t('liq.cut')}</button>}
              {route.can_invest && <button type="button" disabled={!online} onClick={() => setMv({ type: 'investment', amount: '', note: '' })} className={`${ui.btnGhost} !py-2 text-sm`}>➕ {t('fund.invest')}</button>}
              {route.can_invest && <button type="button" disabled={!online} onClick={() => setMv({ type: 'withdrawal', amount: '', note: '' })} className={`${ui.btnGhost} !py-2 text-sm`}>➖ {t('fund.withdraw')}</button>}
            </div>
          )}
        </div>
      )}
      {(route.liquidations ?? []).length > 0 && (
        <div>
          <p className={ui.label}>{t('liq.history')}</p>
          <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
            {(route.liquidations ?? []).map((l) => (
              <li key={l.id} className="py-1.5">
                <div className="flex justify-between"><span className={ui.muted}>{new Date(l.created_at).toLocaleDateString(lang)}</span><b>{fmt(l.closing)}</b></div>
                <p className={`text-[11px] ${Number(l.difference) < 0 ? 'text-red-600 dark:text-red-400' : ui.muted}`}>
                  {t('liq.lineSummary', { expected: fmt(l.expected), counted: fmt(l.counted), diff: fmt(l.difference) })}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function SettleSheet({ route, fmt, online, pending, onClosed }: {
  route: Route; fmt: (n: number) => string; online: boolean; pending: number; onClosed: () => Promise<void>;
}) {
  const { t, lang } = useT();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const lent = Number(route.unsettled_loans ?? 0);
  const fund = route.fund_balance === undefined ? null : Number(route.fund_balance);
  const suggested = fund === null ? Number(route.unsettled_cash) - Number(route.unsettled_expenses) - lent
    : Math.max(0, fund - Number(route.fund_float ?? 0));
  const [give, setGive] = useState(String(Math.round(suggested * 100) / 100));
  const g = parseAmount(give);
  const deliver = fund === null ? suggested : (Number.isNaN(g) ? 0 : g);
  const badGive = fund !== null && (Number.isNaN(g) || g < 0 || g > Math.max(fund, 0) + 0.004);
  const nothing = Number(route.unsettled_cash) === 0 && Number(route.unsettled_digital) === 0 && Number(route.unsettled_expenses) === 0 && lent === 0
    && !(fund !== null && deliver > 0);

  const close = async () => {
    setBusy(true);
    setErr('');
    try {
      await rpc('close_route', fund === null ? { p_route: route.id } : { p_route: route.id, p_deliver: Math.round(deliver * 100) / 100 });
      await onClosed();
    } catch {
      setErr(t('err.generic'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold">🏁 {t('col.settle')}</h2>
      <ul className="space-y-1 text-sm">
        <li className="flex justify-between"><span>{t('col.cash')}</span><b>{fmt(route.unsettled_cash)}</b></li>
        <li className="flex justify-between"><span>{t('col.digital')}</span><b>{fmt(route.unsettled_digital)}</b></li>
        <li className="flex justify-between"><span>{t('col.expenses')}</span><b className="text-red-600 dark:text-red-400">− {fmt(route.unsettled_expenses)}</b></li>
        {lent !== 0 && <li className="flex justify-between"><span>{t('loan.lent')}</span><b className="text-violet-600 dark:text-violet-400">− {fmt(lent)}</b></li>}
        {fund === null && <li className="flex justify-between border-t border-slate-200 pt-2 text-base dark:border-slate-800"><span>{t('col.toDeliver')}</span><b>{fmt(deliver)}</b></li>}
        {fund !== null && <li className="flex justify-between border-t border-slate-200 pt-2 text-base dark:border-slate-800"><span>💼 {t('fund.title')}</span><b>{fmt(fund)}</b></li>}
      </ul>
      {fund !== null && (
        <div className="space-y-1">
          <label className={ui.label}>{t('fund.deliver')}</label>
          <input inputMode="decimal" value={give} onChange={(e) => setGive(e.target.value)} className={`${ui.input} text-xl font-bold`} />
          {badGive ? <p className="text-sm font-semibold text-red-600 dark:text-red-400">{t('fund.deliverBad')}</p>
            : <p className={`text-xs ${ui.muted}`}>{t('fund.stays', { amount: fmt(Math.max(0, fund - deliver)) })}</p>}
        </div>
      )}
      <p className={`text-xs ${ui.muted}`}>{t('col.settleHint')}</p>
      {!online && <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">{t('col.settleNeedsSignal')}</p>}
      {online && pending > 0 && <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">{t('col.settleSyncFirst')}</p>}
      {err && <p className="text-sm font-semibold text-red-600 dark:text-red-400">{err}</p>}
      <button type="button" disabled={busy || !online || pending > 0 || nothing || badGive} onClick={close} className={`${ui.btnPrimary} w-full py-3`}>
        {busy ? t('common.wait') : t('col.settleBtn')}
      </button>

      {route.settlements.length > 0 && (
        <div>
          <p className={ui.label}>{t('col.lastSettlements')}</p>
          <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
            {route.settlements.map((s) => (
              <li key={s.id} className="flex items-center justify-between py-1.5">
                <span className={ui.muted}>{new Date(s.at).toLocaleString(lang, { dateStyle: 'short', timeStyle: 'short' })}</span>
                <span className="flex items-center gap-2">
                  <b>{fmt(s.deliver)}</b>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold dark:bg-slate-800">{t(`col.st.${s.status}` as DictKey)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
