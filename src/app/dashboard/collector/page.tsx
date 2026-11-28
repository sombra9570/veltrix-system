'use client';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { rpc, supabase } from '../../../lib/supabase';
import { Card, useHeaderSlot } from '../shell';
import { ui } from '../../site-header';
import { useT } from '../../i18n';
import type { DictKey } from '../../i18n/es';
import { money, parseAmount } from '../format';
import { useStaff } from '../staff-context';
import { useSync } from '../sync';
import { isNetworkError } from '../offline-sales';
import { ShowMore } from '../paged';
import { applyPayment, freqOf, type Credit, type Freq, type Method } from './credit-card';
import { CreditSaleForm } from './credit-sale-form';
import { LoanForm, type LoanPolicy } from './loan-form';
import { DaysTable, type DayRow } from './days-table';
import { CutForm } from './cut-form';
import { SignalButton } from './signal';
import { MenuTile } from './tiles';
import { NearbyScreen, NEAR_METERS, distanceM } from './nearby';
import { NewClient, GpsButton, type CustomerOp } from './new-client';
import { getFile, delFile } from './offline-files';
import { extFor } from '../image';
import { Credits } from './credits';
import { CustomerNames, CustomerProfile, FreqChips, ProfileTabs } from '../customer-profile';
import { SettingsScreen, payQrUrl } from './settings';
import { useBackButton } from '../use-back';
import { readSaleMode, cacheSaleMode, creditErrorKey, type CreditOp } from './credit-ops';

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
  tax_id?: string | null; business?: string | null; g_name?: string | null; g_phone?: string | null; g_lat?: number | null; g_lng?: number | null; paid_today?: boolean;
  rating?: string;
  last_visit?: { at: string; result: VisitResult; notes: string | null; promise_date: string | null; promise_amount: number | null } | null;
};
type Settlement = { id: string; at: string; status: string; cash: number; expenses: number; deliver: number };
type Route = {
  id: string; name: string; branch: string; currency: string; today: string;
  unsettled_cash: number; unsettled_digital: number; unsettled_expenses: number; unsettled_loans?: number;
  fund_balance?: number; fund_float?: number;
  period?: Period; liquidations?: Liquidation[]; days?: DayRow[]; can_liquidate?: boolean; can_invest?: boolean;
  policy?: LoanPolicy; can_loan?: boolean; can_customers?: boolean; can_no_photo?: boolean; can_no_id_photo?: boolean; can_gallery?: boolean; can_change_loc?: boolean; can_interest?: boolean;
  can_expenses?: boolean; can_portfolio?: boolean; can_settings?: boolean; can_delete_credits?: boolean; can_delete_customers?: boolean; can_delete_installments?: boolean; commission_pct?: number; locked?: boolean; max_loan?: number; pay_qr?: string | null; pay_qr_note?: string | null; org_id?: string; branch_id?: string; own_qr?: boolean; notices_unread?: number;
  customers: Customer[]; settlements: Settlement[];
};
type Screen = 'home' | 'near' | 'list' | 'pending' | 'newclient' | 'settings';
type Period = { since: string | null; opening: number; investments: number; withdrawals: number; collected_cash: number;
  collected_digital: number; lent: number; collector_expenses: number; expected: number };
type Liquidation = { id: string; created_at: string; expected: number; counted: number; difference: number; closing: number;
  op_expenses: number; payments_out: number; withdrawals: number };
type Day = { generated_at: string; routes: Route[] };
type Op =
  | { kind: 'payment'; id: string; at: string; route: string; customer: string; method: Method; amount: number; order?: string; lat?: number; lng?: number }
  | { kind: 'visit'; id: string; at: string; route: string; customer: string; result: VisitResult; promise_date?: string; promise_amount?: number; notes?: string; lat?: number; lng?: number }
  | { kind: 'expense'; id: string; at: string; route: string; amount: number; description: string }
  | CustomerOp
  | CreditOp;

const okBox = 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300';
const errBox = 'border-red-300 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400';
const VISITS: VisitResult[] = ['no_one_home', 'promise', 'refused', 'other'];

/** Clientes de la ruta guardados en el teléfono, con la forma que usan los formularios de crédito */
const localCust = (r: Route) => r.customers.map((c) => ({ id: c.id, name: c.name, phone: c.phone, address: c.address, balance: Number(c.balance), rating: c.rating ?? 'new' }));

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

/** Las tarjetas llegan compactas ([n, vence, monto, pagado, último pago]); aquí se arman para la pantalla */
type RawCredit = Credit & { i?: [number, string, number, number, string | null][] };
function normalizeDay(d: Day): Day {
  return {
    ...d,
    routes: d.routes.map((r) => ({
      ...r,
      customers: r.customers.map((c) => ({
        ...c,
        credits: (c.credits as RawCredit[] | undefined)?.map((k) => k.i
          ? { id: k.id, created: k.created, total: k.total, every_days: k.every_days,
              installments: k.i.map(([n, due, amount, paid, last_at]) => ({ id: `${k.id}:${n}`, n, due, amount: Number(amount), paid: Number(paid), last_at })) }
          : k),
      })),
    })),
  };
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
  const { userId, userName } = useStaff();
  const DAY_KEY = `vx_collector_day_${userId}`;
  const QUEUE_KEY = `vx_collector_queue_${userId}`;
  const REJ_KEY = `vx_collector_rejected_${userId}`;

  const [day, setDay] = useState<Day | null>(null);
  const [queue, setQueue] = useState<Op[]>([]);
  // Registros que el servidor no aceptó: NO se pierden, quedan aquí hasta reintentar o descartar
  const [rejected, setRejected] = useState<(Op & { reason: string })[]>([]);
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [routeId, setRouteId] = useState('');
  const [sel, setSel] = useState<Customer | null>(null);
  const [saleMode, setSaleMode] = useState<{ mode: 'loan' | 'merch'; can: boolean } | null>(null);
  const [panel, setPanel] = useState<'pay' | 'visit' | 'expense' | 'settle' | 'loan' | null>(null);
  const [sheetTab, setSheetTab] = useState<'info' | 'acc' | 'loc' | 'chg'>('info');
  const [sheetAcct, setSheetAcct] = useState<string | null>(null);
  const [loanFor, setLoanFor] = useState<{ id: string; name: string } | null>(null);
  useEffect(() => { if (panel !== 'loan') setLoanFor(null); }, [panel]);
  useEffect(() => { setSheetTab('info'); setSheetAcct(null); }, [sel?.id]);
  const [freq, setFreq] = useState<Freq | 'all'>('all');
  // Se dibujan de a 25 clientes (tarjetas pesan): "Ver más" agrega el resto
  const [limit, setLimit] = useState(25);
  useEffect(() => { setLimit(25); }, [freq, routeId]);
  const router = useRouter();
  const [nearCount, setNearCount] = useState<number | null>(null);
  const [q, setQ] = useState('');
  const [screen, setScreen] = useState<Screen>('home');
  const [hist, setHist] = useState<Screen[]>([]);
  const [geoOn, setGeoOn] = useState(true);
  useEffect(() => { setGeoOn(load<boolean>('vx_col_geo', true)); }, []);
  const go = (sc: Screen) => { setHist((h) => [...h, screen]); setScreen(sc); setSel(null); setPanel(null); };
  const back = () => { setHist((h) => { const n = [...h]; setScreen(n.pop() ?? 'home'); return n; }); setSel(null); setPanel(null); };
  const menu = () => { setHist([]); setScreen('home'); setSel(null); setPanel(null); };
  useBackButton((sel ? 1 : 0) + (panel ? 1 : 0) + (sel && !panel && sheetAcct ? 1 : 0) + (screen !== 'home' ? 1 : 0), () => {
    if (sel && !panel && sheetAcct) setSheetAcct(null); else if (sel && panel) setPanel(null); else if (sel || panel) { setSel(null); setPanel(null); } else back();
  });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // Último cobro, para ofrecer el comprobante por WhatsApp
  const [receipt, setReceipt] = useState<{ phone: string; text: string } | null>(null);
  const flushing = useRef(false);
  // Acciones hechas desde la última descarga completa: al pasar el límite (app muy cargada) se reconcilia con el servidor
  const sinceSync = useRef(0);
  const RECONCILE_EVERY = 100;

  const flash = (ok: boolean, text: string) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 5000); };
  // Borrar cuota (revertir un cobro): solo con señal y si el administrador lo permitió en la ruta
  const reverseInst = async (customerId: string, order: string, ns: number[]) => {
    if (!navigator.onLine) { flash(false, t('loan.e.offline')); return; }
    try { await rpc('collector_delete_installments', { p_order: order, p_numbers: ns }); await patch(routeId, { customers: [customerId], totals: true }); flash(true, t('card.delInstDone', { n: ns.join(', ') })); }
    catch (e) {
      const m = (e as Error).message;
      flash(false, m.includes('AFTER_CLOSE') ? t('col.delClosed') : m.includes('ROUTE_LOCKED') ? t('sp.lockedInfo') : m.includes('LOAN_NO_PERMISSION') ? t('loan.e.perm') : t('err.generic'));
    }
  };

  // Lo guardado en el teléfono aparece al instante, aun sin señal
  useEffect(() => {
    const d0 = load<Day | null>(DAY_KEY, null);
    const d = d0 ? normalizeDay(d0) : null;
    if (d) { setDay(d); setRouteId((r) => r || d.routes[0]?.id || ''); }
    setQueue(load<Op[]>(QUEUE_KEY, []));
    setRejected(load<(Op & { reason: string })[]>(REJ_KEY, []));
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, [DAY_KEY, QUEUE_KEY]);

  const refresh = useCallback(async () => {
    try {
      const d = normalizeDay(await rpc<Day>('collector_day'));
      sinceSync.current = 0;
      setDay(d);
      save(DAY_KEY, d);
      setRouteId((r) => (d.routes.some((x) => x.id === r) ? r : d.routes[0]?.id ?? ''));
    } catch { /* sin señal: seguimos con lo guardado */ }
  }, [DAY_KEY]);

  /* Sincronización puntual: solo lo que cambió (un cliente y/o las cifras de la ruta), sin volver a leer todo el día.
   * Si no hay señal o falla, no avisa: lo local ya está al día y el resto llega al abrir o con ↻. */
  const patch = useCallback(async (routeId: string, opts: { customers?: string[]; removed?: string[]; totals?: boolean }) => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    try {
      const rows = await Promise.all((opts.customers ?? []).map((id) => rpc<Customer | null>('collector_customer_row', { p_route: routeId, p_customer: id }).catch(() => undefined)));
      const totals = opts.totals ? await rpc<Partial<Route>>('collector_route_totals', { p_route: routeId }).catch(() => null) : null;
      setDay((d) => {
        if (!d) return d;
        const nd: Day = { ...d, routes: d.routes.map((r) => {
          if (r.id !== routeId) return r;
          let customers = r.customers.filter((c) => !(opts.removed ?? []).includes(c.id));
          for (const row of rows) {
            if (!row) continue;
            const one = normalizeDay({ generated_at: '', routes: [{ customers: [row] } as unknown as Route] }).routes[0].customers[0];
            customers = customers.some((c) => c.id === one.id) ? customers.map((c) => (c.id === one.id ? one : c)) : [...customers, one];
          }
          customers = [...customers].sort((x, y) => Number(y.overdue) - Number(x.overdue) || x.name.localeCompare(y.name));
          return { ...r, ...(totals ?? {}), customers };
        }) };
        save(DAY_KEY, nd);
        return nd;
      });
    } catch { /* sin señal: se completa al abrir o con ↻ */ }
  }, [DAY_KEY]);

  // Envía la cola, de a uno y en orden
  const flush = useCallback(async (force = false) => {
    let sent = 0;
    let lockedHit = false;
    let creditSent = false;
    const touched = new Map<string, Set<string>>(); // ruta -> clientes tocados
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
            if (op.lat != null && op.lng != null) {
              await rpc('set_payment_geo', { p_offline_uuid: op.id, p_lat: op.lat, p_lng: op.lng }).catch(() => undefined);
            }
          } else if (op.kind === 'visit') {
            await rpc('collector_visit', {
              p_route: op.route, p_customer: op.customer, p_result: op.result,
              p_promise_date: op.promise_date ?? null, p_promise_amount: op.promise_amount ?? null,
              p_notes: op.notes ?? null, p_lat: op.lat ?? null, p_lng: op.lng ?? null,
              p_offline_uuid: op.id, p_visited_at: op.at,
            });
          } else if (op.kind === 'customer') {
            await rpc('collector_save_customer', {
              p_route: op.route, p_name: op.name, p_phone: op.phone || null, p_address: op.address || null, p_tax_id: op.ci || null,
              p_notes: null, p_lat: op.lat, p_lng: op.lng, p_g_name: op.gName || null, p_g_phone: op.gPhone || null, p_g_address: op.gAddress || null,
              p_g_lat: op.gLat ?? null, p_g_lng: op.gLng ?? null, p_offline_uuid: op.id, p_business: op.business || null,
            });
            if (op.files && (op.files.doc || op.files.docback || op.files.photo || op.files.gphoto)) {
              const up = async (kind: 'doc' | 'docback' | 'photo' | 'gphoto'): Promise<string | null> => {
                if (!op.files?.[kind]) return null;
                const blob = await getFile(`${op.id}:${kind}`);
                if (!blob) return null;
                const path = `${load<Day | null>(DAY_KEY, null)?.routes.find((x) => x.id === op.route)?.org_id ?? ''}/${op.id}/${kind}-${Date.now()}.${extFor(blob)}`;
                const { error } = await supabase.storage.from('customer-files').upload(path, blob, { contentType: blob.type, upsert: false });
                if (error) throw new Error(error.message);
                return path;
              };
              const [a, b, c, d] = [await up('doc'), await up('docback'), await up('photo'), await up('gphoto')];
              await rpc('collector_set_customer_files', { p_customer: op.id, p_doc_front: a, p_doc_back: b, p_photo: c, p_g_photo: d, p_consent: op.consent });
              for (const k of ['doc', 'docback', 'photo', 'gphoto'] as const) { await delFile(`${op.id}:${k}`).catch(() => undefined); }
            }
          } else if (op.kind === 'loan') {
            await rpc('create_street_loan_v2', {
              p_route: op.route, p_customer: op.customer, p_principal: op.principal, p_interest: op.interest, p_count: op.count,
              p_every_days: op.every, p_first_due: op.first, p_notes: op.notes, p_offline_uuid: op.id,
            });
            creditSent = true;
          } else if (op.kind === 'credit_sale') {
            await rpc('collector_credit_sale_v2', {
              p_route: op.route, p_customer: op.customer, p_items: op.items, p_count: op.count,
              p_every_days: op.every, p_first_due: op.first, p_notes: op.notes, p_offline_uuid: op.id,
            });
            creditSent = true;
          } else {
            await rpc('collector_expense', { p_route: op.route, p_amount: op.amount, p_description: op.description, p_offline_uuid: op.id });
          }
          sent++;
          { const set = touched.get(op.route) ?? new Set<string>(); if (op.kind === 'customer') set.add(op.id); else if (op.kind !== 'expense') set.add(op.customer); touched.set(op.route, set); }
          await new Promise((r) => setTimeout(r, 150)); // de a uno, sin saturar la señal
        } catch (err) {
          const m = (err as Error).message;
          // Sin señal o corte por tiempo: se reintenta más tarde (el identificador evita duplicar).
          // Rechazo real (p. ej. monto mayor a la deuda): NO se pierde, queda en "rechazados" para revisar.
          if (isNetworkError(m) || !navigator.onLine) break;
          // Ruta bloqueada por el supervisor: lo anotado se conserva en la cola y se envía al desbloquear
          if (m.includes('ROUTE_LOCKED')) { lockedHit = true; break; }
          const ck = op.kind === 'loan' || op.kind === 'credit_sale' ? creditErrorKey(m) : null;
          const why = ck ? t(ck as DictKey) : m;
          const rej = [...load<(Op & { reason: string })[]>(REJ_KEY, []).filter((o) => o.id !== op.id), { ...op, reason: why }];
          save(REJ_KEY, rej);
          setRejected(rej);
          flash(false, `${t('col.rejected')}: ${why}`);
        }
        pending = load<Op[]>(QUEUE_KEY, []).filter((o) => o.id !== op.id);
        save(QUEUE_KEY, pending);
        setQueue(pending);
      }
    } finally {
      flushing.current = false;
      setSyncing(false);
    }
    // Solo vuelve a descargar el día si se envió algo o si se pidió
    // Al abrir / ↻ / bloqueo: se descarga el día. Si solo se envió algo: se actualiza únicamente lo tocado.
    // Las cifras ya se calcularon en el teléfono al anotar (caja, cobrado, deuda del cliente): no se lee nada más.
    // Solo se tira del servidor al abrir / ↻ / bloqueo, si hubo rechazos, o cuando se acumulan muchas acciones.
    const hadRejects = load<unknown[]>(REJ_KEY, []).length > 0;
    // Un préstamo o venta a plazos enviado puede quedar pendiente de aprobación: se baja el día para ver el estado real
    if (force || lockedHit || hadRejects || creditSent || sinceSync.current >= RECONCILE_EVERY) await refresh();
    void touched;
  }, [QUEUE_KEY, REJ_KEY, refresh, patch, t]);

  const retryRejected = (id: string) => {
    const r = load<(Op & { reason: string })[]>(REJ_KEY, []);
    const item = r.find((o) => o.id === id);
    if (!item) return;
    const { reason: _reason, ...op } = item;
    void _reason;
    const rest = r.filter((o) => o.id !== id);
    save(REJ_KEY, rest); setRejected(rest);
    const q = [...load<Op[]>(QUEUE_KEY, []), op as Op];
    save(QUEUE_KEY, q); setQueue(q);
    if (navigator.onLine) flush();
  };
  const discardRejected = (id: string) => {
    const rest = load<(Op & { reason: string })[]>(REJ_KEY, []).filter((o) => o.id !== id);
    save(REJ_KEY, rest); setRejected(rest);
  };

  // Al abrir y al volver la señal: envía lo pendiente y actualiza el día.
  // Si quedó algo sin enviar, reintenta cada 5 min (solo si hay pendientes).
  useEffect(() => {
    if (!online) return;
    flush(true);
    const id = setInterval(() => { if (load<Op[]>(QUEUE_KEY, []).length > 0) flush(); }, 5 * 60_000);
    return () => clearInterval(id);
  }, [online, flush, QUEUE_KEY]);
  // El día completo se vuelve a descargar unas 5 veces al día o con el botón ↻
  useSync(refresh, 0); // sin reloj: el día se baja al abrir, al volver la señal o con ↻

  // Bloqueo/desbloqueo: el supervisor lo aplica una vez y avisa por un canal en vivo (sin consultas periódicas).
  // Al llegar el aviso se descarga el día una sola vez y se ve el cambio al instante.
  const routeKey = (day?.routes ?? []).map((r) => r.id).join(',');
  useEffect(() => {
    if (!routeKey) return;
    const chans = routeKey.split(',').map((id) => supabase.channel(`route-lock:${id}`)
      .on('broadcast', { event: 'lock' }, () => { void patch(id, { totals: true }); })
      .subscribe());
    return () => { chans.forEach((c) => { void supabase.removeChannel(c); }); };
  }, [routeKey, patch]);

  const enqueue = (op: Op) => {
    sinceSync.current += 1;
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
          if (op.kind === 'customer') {
            const nc: Customer = { id: op.id, name: op.name, phone: op.phone, address: op.address, lat: op.lat, lng: op.lng, balance: 0, overdue: 0, due_today: 0,
              next_due: null, visited_today: false, tax_id: op.ci, g_name: op.gName ?? null, g_phone: op.gPhone ?? null, g_lat: op.gLat ?? null, g_lng: op.gLng ?? null, credits: [] };
            return { ...r, customers: [...r.customers.filter((c) => c.id !== op.id), nc] };
          }
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
                ...c, visited_today: true, paid_today: true, credits,
                balance: Math.max(0, Number(c.balance) - paid),
                overdue: Math.max(0, Number(c.overdue) - paid),
                due_today: Math.max(0, Number(c.due_today) - Math.max(0, paid - Number(c.overdue))),
              };
            }
            if (op.kind === 'loan' || op.kind === 'credit_sale') {
              return { ...c, visited_today: true, balance: Number(c.balance) + op.total };
            }
            return { ...c, visited_today: true };
          });
          const lentAdd = op.kind === 'loan' ? op.principal : 0;
          const cashAdd = op.kind === 'payment' && op.method === 'cash' ? op.amount : 0;
          const digAdd = op.kind === 'payment' && op.method !== 'cash' ? op.amount : 0;
          return {
            ...r, customers,
            unsettled_cash: Number(r.unsettled_cash) + cashAdd,
            days: op.kind === 'payment' ? bumpToday(r, { cash: cashAdd, digital: digAdd, payments: 1 })
              : op.kind === 'loan' ? bumpToday(r, { lent: lentAdd }) : r.days,
            unsettled_loans: lentAdd ? Number(r.unsettled_loans ?? 0) + lentAdd : r.unsettled_loans,
            fund_balance: r.fund_balance === undefined ? undefined : Number(r.fund_balance) + cashAdd - lentAdd,
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
  useEffect(() => {
    if (!routeId) return;
    setSaleMode(readSaleMode(routeId)); // sin señal: lo último que se vio
    rpc<{ mode: 'loan' | 'merch'; can: boolean }>('collector_sale_mode', { p_route: routeId })
      .then((m) => { setSaleMode(m ?? null); if (m) cacheSaleMode(routeId, m); }).catch(() => { /* se queda con lo guardado */ });
  }, [routeId]);
  const merch = saleMode?.mode === 'merch';
  const canNew = merch ? !!saleMode?.can : !!route?.can_loan && !!route?.policy;
  // Registra el cobro al instante; la ubicación se adjunta apenas el teléfono la da (sin hacer esperar)
  const pay = (customer: string, method: Method, amount: number, order?: string) => {
    if (!route) return;
    const id = crypto.randomUUID();
    const at = new Date().toISOString();
    enqueue({ kind: 'payment', id, at, route: route.id, customer, method, amount, order });
    flash(true, online ? t('col.paySaved') : t('col.savedOffline'));
    if (geoOn) getPosition().then((pos) => {
      if (!pos) return;
      const q = load<Op[]>(QUEUE_KEY, []);
      if (q.some((o) => o.id === id)) {
        const next = q.map((o) => (o.id === id ? { ...o, ...pos } : o));
        save(QUEUE_KEY, next);
        setQueue(next);
      } else {
        rpc('set_payment_geo', { p_offline_uuid: id, p_lat: pos.lat, p_lng: pos.lng }).catch(() => undefined);
      }
    });
    const c = route.customers.find((x) => x.id === customer);
    const phone = c?.phone?.replace(/[^\d]/g, '') ?? '';
    if (c && phone.length >= 7) {
      const left = Math.max(0, Number(c.balance) - amount);
      const when = new Date(at).toLocaleString(lang, { dateStyle: 'short', timeStyle: 'short' });
      setReceipt({ phone, text: [
        `🧾 ${t('rcpt.title')} · ${route.branch}`,
        `${t('rcpt.customer')}: ${c.name}`,
        `${t('rcpt.amount')}: ${money(amount, route.currency, lang)} (${t(`cash.m.${method}` as DictKey)})`,
        `${t('rcpt.date')}: ${when}`,
        `${t('rcpt.balance')}: ${money(left, route.currency, lang)}`,
        `${t('rcpt.collector')}: ${userName}`,
        `${t('rcpt.code')}: ${id.slice(0, 8).toUpperCase()}`,
      ].join('\n') });
    }
  };
  const cardPay = (customer: string, order: string, amount: number, method: Method) => pay(customer, method, amount, order);
  // La ficha abierta se mantiene al día con lo guardado (tarjetas marcadas)
  const selNow = sel ? route?.customers.find((x) => x.id === sel.id) ?? sel : null;
  const fmt = (n: number) => money(Number(n), route?.currency ?? 'USD', lang);

  // Barra superior única de la app: nombre de la ruta, atrás y antena (sin segunda barra)
  const slotRoute = day?.routes.find((r) => r.id === routeId);
  const act = useRef({ back, menu, flush });
  act.current = { back, menu, flush };
  const sigNow = !online ? 'off' : queue.length > 0 || rejected.length > 0 ? 'pending' : 'ok';
  useHeaderSlot(slotRoute ? {
    title: `🛵 ${slotRoute.name}`, subtitle: `${userName} · ${slotRoute.branch}`,
    onBack: screen !== 'home' ? () => act.current.back() : undefined,
    onTitle: screen !== 'home' ? () => act.current.menu() : undefined,
    extra: <SignalButton state={sigNow} pending={queue.length} syncing={syncing} onClick={() => { if (online) void act.current.flush(true); }} />,
    hideSync: true, logout: true,
  } : null, [slotRoute?.name, slotRoute?.branch, userName, screen, sigNow, queue.length, syncing, online]);

  // Cuántos clientes hay a menos de 100 m (se calcula al abrir la pantalla principal)
  const nearList = day?.routes.find((r) => r.id === routeId)?.customers;
  useEffect(() => {
    if (screen !== 'home' || !nearList) return;
    let live = true;
    getPosition().then((pos) => {
      if (!live) return;
      if (!pos) { setNearCount(null); return; }
      setNearCount(nearList.filter((c) => c.lat != null && c.lng != null && distanceM(pos, { lat: c.lat, lng: c.lng }) <= NEAR_METERS).length);
    });
    return () => { live = false; };
  }, [screen, nearList]);

  /* ---------- Pantallas ---------- */
  if (!day) {
    return <Card><p className={`text-sm ${ui.muted}`}>{online ? t('common.wait') : t('col.noDataOffline')}</p></Card>;
  }
  if (day.routes.length === 0) {
    return <Card><p className={`text-sm ${ui.muted}`}>{t('col.noRoute')}</p></Card>;
  }
  if (!route) return null;

  const pendingRoute = queue.filter((q) => q.route === route.id).length;
  const fund = route.fund_balance === undefined ? null : Number(route.fund_balance);
  const shownAll = freq === 'all' ? route.customers : route.customers.filter((c) => c.credits?.some((k) => freqOf(k) === freq));
  const qn = q.trim().toLowerCase();
  const shownAllQ = qn ? shownAll.filter((c) => c.name.toLowerCase().includes(qn) || (c.tax_id ?? '').toLowerCase().includes(qn)) : shownAll;
  const shownQ = shownAllQ.slice(0, limit);
  const pendingCustomers = route.customers
    .filter((c) => !c.paid_today && Number(c.overdue) + Number(c.due_today) > 0.004)
    .sort((x, y) => Number(y.overdue) - Number(x.overdue));
  const unread = Number(route.notices_unread ?? 0);
  const openCustomer = (id: string) => { const c = route.customers.find((x) => x.id === id); if (c) { setSel(c); setPanel(null); } };
  const canExpenses = route.can_expenses !== false;
  const custRow = (c: Customer) => (
    <li key={c.id}>
      <button type="button" onClick={() => { setSel(c); setPanel(null); }}
        className={`flex w-full items-center gap-3 rounded-2xl p-4 text-left transition cursor-pointer ${ui.card}`}>
        <span className="text-xl">{c.paid_today ? '✅' : Number(c.overdue) > 0 ? '🔴' : Number(c.due_today) > 0 ? '🟡' : '⚪'}</span>
        <div className="min-w-0 flex-1">
          <p className="break-words font-bold leading-tight">{c.name}</p>
          <p className={`truncate text-xs ${ui.muted}`}>{c.address ?? '—'}</p>
        </div>
        <p className="shrink-0 whitespace-nowrap text-sm font-extrabold">{fmt(Number(c.overdue) + Number(c.due_today))}</p>
      </button>
    </li>
  );

  return (
    <div className="space-y-4">
      {day.routes.length > 1 && screen === 'home' && (
        <select value={routeId} onChange={(e) => setRouteId(e.target.value)} className={`${ui.input} !w-auto`}>
          {day.routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      )}

      {msg && <p className={`rounded-xl border p-3 text-sm font-semibold ${msg.ok ? okBox : errBox}`}>{msg.text}</p>}
      {rejected.length > 0 && (
        <div className={`space-y-2 rounded-xl border p-3 text-sm ${errBox}`}>
          <h2 className="font-bold">⚠️ {t('col.rejectedTitle', { n: rejected.length })}</h2>
          <p className="text-xs">{t('pos.rejectedHint')}</p>
          <ul className="space-y-2">
            {rejected.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/60 p-2 dark:bg-black/20">
                <span className="min-w-0 text-xs">
                  <b>{r.kind === 'visit' ? '📍' : r.kind === 'expense' ? '🧾' : r.kind === 'customer' ? '👤' : r.kind === 'loan' ? '💸' : r.kind === 'credit_sale' ? '🛍️' : '💵'}{' '}
                    {r.kind === 'visit' ? '' : r.kind === 'customer' ? r.name : r.kind === 'loan' ? fmt(r.principal) : r.kind === 'credit_sale' ? fmt(r.total) : fmt(r.amount)}</b>{' · '}
                  {new Date(r.at).toLocaleString(lang, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  <br />{r.reason}
                </span>
                <span className="flex gap-2">
                  <button type="button" onClick={() => retryRejected(r.id)} className={`${ui.btnGhost} !px-3 !py-1.5 text-xs`}>↻ {t('pos.retry')}</button>
                  <button type="button" onClick={() => discardRejected(r.id)} className={`${ui.btnGhost} !px-3 !py-1.5 text-xs`}>🗑️ {t('pos.discard')}</button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {receipt && (
        <div className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-sm ${okBox}`}>
          <span className="font-semibold">{t('rcpt.offer')}</span>
          <span className="flex gap-2">
            <a href={`https://wa.me/${receipt.phone}?text=${encodeURIComponent(receipt.text)}`} target="_blank" rel="noopener noreferrer"
              onClick={() => setReceipt(null)} className={ui.btnPrimary}>📲 {t('rcpt.send')}</a>
            <button type="button" onClick={() => setReceipt(null)} className={`${ui.btnGhost} cursor-pointer`}>{t('pos.close')}</button>
          </span>
        </div>
      )}


      {screen === 'home' && (
        <>
          {route.locked && <p className="mb-3 rounded-xl border border-red-300 bg-red-50 p-3 text-xs font-semibold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">🔒 {t('sp.lockedInfo')}</p>}
          <div className="mx-auto grid max-w-xl grid-cols-2 gap-3">
            <MenuTile icon="pin" tone="blue" label={`${t('cx.nearby')}${nearCount === null ? '' : ` (${nearCount})`}`} onClick={() => go('near')} />
            <MenuTile icon="clock" tone="amber" label={`${t('cx.pending')} (${pendingCustomers.length})`} onClick={() => go('pending')} />
            <MenuTile icon="users" tone="plain" label={`${t('cx.list')} (${route.customers.length})`} onClick={() => go('list')} />
            <MenuTile icon="userPlus" tone="blue" label={t('cx.newClient')} onClick={() => go('newclient')} disabled={!!route.locked} />
            <MenuTile icon="wallet" tone="plain" label={t('nav.routeInfo')} onClick={() => router.push('/dashboard/collector/info')} />
            {canExpenses && <MenuTile icon="receipt" tone="amber" label={t('cx.expenses')} onClick={() => { setSel(null); setPanel('expense'); }} disabled={!!route.locked} />}
            {route.can_liquidate && <MenuTile icon="refresh" tone="blue" label={t('cx.settle')} onClick={() => { setSel(null); setPanel('settle'); }} disabled={!!route.locked} />}
            <MenuTile icon="sliders" tone="plain" label={`${t('cx.settings')}${unread > 0 ? ` (${unread})` : ''}`} onClick={() => go('settings')} />
          </div>
        </>
      )}

      {screen === 'near' && (
        <NearbyScreen customers={route.customers} onOpen={openCustomer} />
      )}

      {screen === 'pending' && (
        <div className="space-y-2">
          <h2 className="font-bold">⏳ {t('cx.pend.title', { n: pendingCustomers.length })}</h2>
          {pendingCustomers.length === 0 && <Card><p className={`text-sm ${ui.muted}`}>{t('cx.pend.none')}</p></Card>}
          <ul className="space-y-2">{pendingCustomers.map(custRow)}</ul>
        </div>
      )}

      {screen === 'newclient' && (
        <NewClient routeId={route.id} orgId={route.org_id ?? ''} online={online} onQueue={(op) => { enqueue(op); }} canLoan={canNew} saleLabel={merch} needPhoto={!route.can_no_photo} needIdPhoto={!route.can_no_id_photo} allowGallery={route.can_gallery !== false}
          onSaved={async (id) => { await patch(route.id, { customers: [id] }); }}
          onLoan={(c) => { setLoanFor(c); setPanel('loan'); }} />
      )}

      {screen === 'settings' && (
        <SettingsScreen routeId={route.id} orgId={route.org_id ?? ''} branchId={route.branch_id ?? ''} ownQr={!!route.own_qr}
          canLoan={canNew} saleLabel={merch} onLoan={() => setPanel('loan')} onQrChanged={refresh} payQr={route.pay_qr ?? null} payQrNote={route.pay_qr_note ?? null}
          geoOn={geoOn} onGeo={(v) => { setGeoOn(v); save('vx_col_geo', v); }} fmt={fmt} online={online}
          onNoticesRead={() => { setDay((d) => { if (!d) return d; const nd = { ...d, routes: d.routes.map((r) => (r.id === route.id ? { ...r, notices_unread: 0 } : r)) }; save(DAY_KEY, nd); return nd; }); }}
          perms={[
            ['perm.loans.create', !!route.can_loan], ['perm.loans.customers', route.can_customers !== false],
            ['perm.loans.interest', !!route.can_interest], ['perm.routes.liquidate', !!route.can_liquidate],
            ['perm.routes.invest', !!route.can_invest], ['perm.collector.expenses', canExpenses],
            ['perm.collector.portfolio', !!route.can_portfolio]
          ] as [DictKey, boolean][]} />
      )}

      {screen === 'list' && (
        <>
          <input type="search" placeholder={t('cx.search')} value={q} onChange={(e) => setQ(e.target.value)} className={ui.input} />
          <FreqChips customers={route.customers} freq={freq} onFreq={setFreq} />
          <CustomerNames list={shownQ} selId={sel?.id} onPick={(id) => { const c = shownQ.find((x) => x.id === id); if (c) { setSel(c); setPanel(null); } }} />
          <ShowMore rest={shownAllQ.length - shownQ.length} onClick={() => setLimit((x) => x + 25)} />
        </>
      )}

      {/* Hoja inferior: cliente / gasto / rendición */}
      {(sel || panel) && (
        <div className="fixed inset-0 z-40 overflow-y-auto overscroll-contain bg-white dark:bg-slate-900">
          <div className={`mx-auto max-w-xl px-4 ${sel && !panel ? 'pb-[calc(6rem+env(safe-area-inset-bottom))]' : 'pb-[calc(2rem+env(safe-area-inset-bottom))]'}`}>
            <div className="sticky top-0 z-10 -mx-4 mb-3 flex items-center gap-2 border-b border-slate-200 bg-white px-4 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top))] dark:border-slate-800 dark:bg-slate-900">
              <button type="button" onClick={() => { if (sel && !panel && sheetAcct) setSheetAcct(null); else if (sel && panel) setPanel(null); else { setSel(null); setPanel(null); } }} aria-label={t('cx.back')} className="grid h-10 w-10 place-items-center rounded-lg border border-slate-300 text-lg cursor-pointer dark:border-slate-700">←</button>
              <span className="min-w-0 flex-1 truncate text-sm font-bold">{sel?.name ?? route.name}</span>
              <button type="button" onClick={() => { setSel(null); setPanel(null); menu(); }} aria-label={t('cx.menu')} className="grid h-10 w-10 place-items-center rounded-lg border border-slate-300 text-lg cursor-pointer dark:border-slate-700">☰</button>
            </div>

            {sel && !panel && (
              <CustomerProfile c={selNow ?? sel} fmt={fmt} online={online} tab={sheetTab} acct={sheetAcct} onAcct={setSheetAcct}
                canChange={!!route.can_change_loc && !route.locked}
                onSaveLoc={async (lat, lng) => { try { await rpc('collector_set_customer_location', { p_route: route.id, p_customer: sel.id, p_lat: lat, p_lng: lng }); await patch(route.id, { customers: [sel.id] }); flash(true, t('cx.loc.saved')); setSheetTab('loc'); } catch (e) { const m = (e as Error).message; flash(false, m.includes('LOAN_NO_PERMISSION') ? t('loan.e.perm') : t('err.generic')); } }}
                renderCards={(only) => (
                  <Credits only={only} locked={!!route.locked} onReverse={route.can_delete_installments && !route.locked ? (o, ns) => reverseInst(sel.id, o, ns) : undefined} c={selNow ?? sel} filter="all" today={route.today} policy={route.policy} fmt={fmt} onSave={(order, amount, method) => cardPay(sel.id, order, amount, method)} />
                )}
                extra={<CollectorActions c={selNow ?? sel} qr={route.pay_qr ?? null} online={online} locked={!!route.locked} onPay={() => setPanel('pay')} onVisit={() => setPanel('visit')}>
                  <DeleteActions c={selNow ?? sel} canCredits={!!route.can_delete_credits} canCustomer={!!route.can_delete_customers} online={online}
                    onDone={(what) => { const cid = sel.id; setSel(null); setPanel(null); void patch(route.id, what === 'customer' ? { removed: [cid], totals: true } : { customers: [cid], totals: true }); }} />
                </CollectorActions>} />
            )}
            {sel && !panel && <ProfileTabs tab={sheetTab} canChange={!!route.can_change_loc && !route.locked} onTab={(k) => { setSheetTab(k); setSheetAcct(null); }} />}
            {sel && panel === 'pay' && (
              <PayForm c={sel} fmt={fmt} onDone={(method, amount) => {
                pay(sel.id, method, amount);
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
            {panel === 'loan' && merch && (
              <CreditSaleForm routeId={route.id} today={route.today} fmt={fmt} online={online} localCustomers={localCust(route)} fixedCustomer={loanFor ?? undefined}
                onQueue={(op) => enqueue(op)}
                onDone={async (text, ok, customerId) => { flash(ok, text); if (ok) { setHist(['home']); setScreen('list'); setSel(null); } setPanel(null); await patch(route.id, { customers: customerId ? [customerId] : [], totals: true }); }} />
            )}
            {panel === 'loan' && !merch && route.policy && (
              <LoanForm routeId={route.id} today={route.today} policy={route.policy} canInterest={!!route.can_interest}
                canCustomers={route.can_customers !== false} fmt={fmt} online={online} localCustomers={localCust(route)}
                fund={fund} maxLoan={Number(route.max_loan ?? 0)} onQueue={(op) => enqueue(op)} fixedCustomer={loanFor ?? undefined}
                onDone={async (text, ok, customerId) => { flash(ok, text); if (ok) { setHist(['home']); setScreen('list'); setSel(null); } setPanel(null); await patch(route.id, { customers: customerId ? [customerId] : [], totals: true }); }} />
            )}
            {panel === 'settle' && fund !== null && <PeriodSheet route={route} fmt={fmt} fund={fund} online={online}
              onChanged={async (text) => { flash(true, text); await patch(route.id, { totals: true }); }} onError={(text) => flash(false, text)} />}
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
/** Borrar créditos o al cliente: solo si el administrador lo permitió en los ajustes de la ruta */
function DeleteActions({ c, canCredits, canCustomer, online, onDone }: { c: Customer; canCredits: boolean; canCustomer: boolean; online: boolean; onDone: (what: 'credit' | 'customer') => void }) {
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!canCredits && !canCustomer) return null;
  const run = async (fn: string, args: Record<string, string>) => {
    if (!window.confirm(t('col.delConfirm'))) return;
    setBusy(true); setErr('');
    try { await rpc(fn, args); onDone(fn === 'collector_delete_customer' ? 'customer' : 'credit'); }
    catch (e) {
      const m = (e as Error).message;
      setErr(m.includes('AFTER_CLOSE') ? t('col.delClosed') : m.includes('CUSTOMER_HAS_DEBT') ? t('col.delDebt') : m.includes('LOAN_NO_PERMISSION') ? t('loan.e.perm') : m.includes('cobros') ? t('col.delPaid') : t('err.generic'));
    } finally { setBusy(false); }
  };
  return (
    <div className="space-y-2 border-t border-slate-200 pt-3 dark:border-slate-800">
      {!online && <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">{t('loan.e.offline')}</p>}
      {err && <p className="text-xs font-semibold text-red-600 dark:text-red-400">{err}</p>}
      {canCredits && (c.credits ?? []).map((k, i) => (
        <button key={k.id} type="button" disabled={busy || !online} onClick={() => run('collector_delete_credit', { p_order: k.id })}
          className="w-full rounded-xl border border-red-300 px-3 py-2 text-sm font-bold text-red-600 cursor-pointer disabled:opacity-50 dark:border-red-500/40 dark:text-red-400">🗑️ {t('col.delCredit')} {(c.credits ?? []).length > 1 ? `#${i + 1}` : ''}</button>
      ))}
      {canCustomer && (
        <button type="button" disabled={busy || !online} onClick={() => run('collector_delete_customer', { p_customer: c.id })}
          className="w-full rounded-xl border border-red-300 px-3 py-2 text-sm font-bold text-red-600 cursor-pointer disabled:opacity-50 dark:border-red-500/40 dark:text-red-400">🗑️ {t('col.delCustomer')}</button>
      )}
    </div>
  );
}

function CollectorActions({ c, qr, online, locked, onPay, onVisit, children }: { c: Customer; qr: string | null; online: boolean; locked: boolean; onPay: () => void; onVisit: () => void; children: ReactNode }) {
  const { t } = useT();
  const sendQr = async () => {
    const phone = c.phone?.replace(/[^\d]/g, '') ?? '';
    if (!qr || phone.length < 7) return;
    const url = await payQrUrl(qr);
    if (!url) return;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(t('cx.cs.qrMsg', { name: c.name, url }))}`, '_blank', 'noopener');
  };
  return (
    <>
      {c.last_visit && <Note v={c.last_visit} />}
      {qr && c.phone && <button type="button" onClick={sendQr} disabled={!online} className={`${ui.btnGhost} w-full`}>📲 {t('cx.cs.sendQr')}</button>}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" disabled={locked} onClick={onVisit} className={ui.btnGhost}>📝 {t('col.visit')}</button>
        <button type="button" disabled={locked} onClick={onPay} className={`${ui.btnPrimary} py-3`}>💵 {t('col.collect')}</button>
      </div>
      {children}
    </>
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
  const [mv, setMv] = useState<{ type: 'investment'; amount: string; note: string } | null>(null);
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
