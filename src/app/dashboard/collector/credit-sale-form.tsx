'use client';
import { useEffect, useMemo, useState } from 'react';
import { rpc } from '../../../lib/supabase';
import { ui } from '../../site-header';
import { useT } from '../../i18n';
import type { DictKey } from '../../i18n/es';
import { SkuTag } from '../sku-tag';
import { isNetworkError } from '../offline-sales';
import { readProducts, cacheProducts, type SaleOp } from './credit-ops';

/* ------------------------------------------------------------------
 * Venta a plazos de mercadería en la calle: cuotas fijas y SIN interés.
 * Solo la ve el cobrador que tiene el permiso "Vender a crédito" (lo da el administrador desde Permisos).
 * ------------------------------------------------------------------ */
type RouteCustomer = { id: string; name: string; phone: string | null; balance: number };
type Product = { id: string; name: string; unit_price: number; sku?: string | null };
const FREQS: [number, string][] = [[1, 'daily'], [7, 'weekly'], [15, 'biweekly'], [30, 'monthly']];
const addDays = (iso: string, n: number) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

export function CreditSaleForm({ routeId, today, fmt, onDone, online, localCustomers, onQueue }: {
  routeId: string; today: string; fmt: (n: number) => string; onDone: (text: string, ok: boolean, customerId?: string) => void;
  online: boolean; localCustomers: RouteCustomer[]; onQueue: (op: SaleOp) => void;
}) {
  const { t } = useT();
  const [customers, setCustomers] = useState<RouteCustomer[]>(localCustomers);
  const [products, setProducts] = useState<Product[]>(() => readProducts<Product>(routeId));
  const [q, setQ] = useState('');
  const [pq, setPq] = useState('');
  const [cid, setCid] = useState('');
  const [items, setItems] = useState<Record<string, number>>({});
  const [count, setCount] = useState('4');
  const [every, setEvery] = useState(7);
  const [first, setFirst] = useState(addDays(today, 7));
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => { if (navigator.onLine) rpc<RouteCustomer[]>('route_customers', { p_route: routeId }).then((x) => setCustomers(x ?? [])).catch(() => setCustomers(localCustomers)); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [routeId, online]);
  useEffect(() => {
    if (!navigator.onLine) return;
    rpc<Product[]>('collector_products_v2', { p_route: routeId })
      .then((x) => { setProducts(x ?? []); cacheProducts(routeId, x ?? []); })
      .catch((e) => { const m = (e as Error).message; if (m.includes('SALE_NO_PERMISSION')) setErr(t('sale.e.perm')); else if (!isNetworkError(m)) setErr(m); });
  }, [routeId, t, online]);
  useEffect(() => { setFirst(addDays(today, every)); }, [every, today]);

  const custList = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (s ? customers.filter((c) => c.name.toLowerCase().includes(s) || (c.phone ?? '').includes(s)) : customers).slice(0, 30);
  }, [customers, q]);
  const prodList = useMemo(() => {
    const s = pq.trim().toLowerCase();
    return (s ? products.filter((p) => p.name.toLowerCase().includes(s) || (p.sku ?? '').toLowerCase().includes(s)) : products).slice(0, 30);
  }, [products, pq]);

  const chosen = products.filter((p) => (items[p.id] ?? 0) > 0);
  const total = Math.round(chosen.reduce((a, p) => a + Number(p.unit_price) * items[p.id], 0) * 100) / 100;
  const n = parseInt(count, 10);
  const valid = !!cid && chosen.length > 0 && n >= 1 && n <= 120 && first >= today;
  const each = valid ? Math.trunc((total / n) * 100) / 100 : 0;
  const setQty = (id: string, v: number) => setItems((m) => { const x = { ...m }; if (v <= 0) delete x[id]; else x[id] = v; return x; });

  const queueIt = (opId: string) => {
    onQueue({ kind: 'credit_sale', id: opId, at: new Date().toISOString(), route: routeId, customer: cid,
      items: chosen.map((p) => ({ product_id: p.id, qty: items[p.id] })), count: n, every, first, notes: notes || null, total });
    onDone(t('sale.queued', { amount: fmt(total) }), true);
  };

  const submit = async () => {
    setBusy(true); setErr('');
    const opId = crypto.randomUUID();
    if (!online || !navigator.onLine) { queueIt(opId); setBusy(false); return; }
    try {
      await rpc('collector_credit_sale_v2', {
        p_route: routeId, p_customer: cid, p_items: chosen.map((p) => ({ product_id: p.id, qty: items[p.id] })),
        p_count: n, p_every_days: every, p_first_due: first, p_notes: notes || null, p_offline_uuid: opId,
      });
      onDone(t('sale.created', { amount: fmt(total) }), true, cid);
    } catch (e) {
      const m = (e as Error).message;
      if (isNetworkError(m)) { queueIt(opId); return; }
      setErr(m.includes('SALE_NO_PERMISSION') ? t('sale.e.perm') : m.includes('LOAN_OTHER_ROUTE') ? t('loan.e.otherRoute')
        : m.includes('ROUTE_LOCKED') ? t('sp.lockedInfo') : /fetch|network|Failed/i.test(m) ? t('loan.e.offline') : m);
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold">🛍️ {t('sale.title')}</h2>
      <div className="space-y-2">
        <label className={ui.label}>{t('loan.customer')}</label>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('loan.search')} className={ui.input} />
        <ul className="max-h-40 space-y-1 overflow-y-auto">
          {custList.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => setCid(c.id)}
                className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm cursor-pointer ${cid === c.id ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10' : 'border-slate-200 dark:border-slate-800'}`}>
                <span className="min-w-0 flex-1 truncate font-semibold">{c.name}</span>
                {Number(c.balance) > 0 && <span className={`text-xs ${ui.muted}`}>{fmt(c.balance)}</span>}
              </button>
            </li>
          ))}
          {custList.length === 0 && <li className={`text-xs ${ui.muted}`}>{t('loan.noCustomers')}</li>}
        </ul>
      </div>

      <div className="space-y-2">
        <label className={ui.label}>{t('sale.items')}</label>
        <input value={pq} onChange={(e) => setPq(e.target.value)} placeholder={t('sale.search')} className={ui.input} />
        <ul className="max-h-48 space-y-1 overflow-y-auto">
          {prodList.map((p) => (
            <li key={p.id} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
              <span className="min-w-0 flex-1 truncate font-semibold">{p.name}<SkuTag sku={p.sku} /></span>
              <span className={`text-xs ${ui.muted}`}>{fmt(Number(p.unit_price))}</span>
              <button type="button" onClick={() => setQty(p.id, (items[p.id] ?? 0) - 1)} className={`${ui.btnGhost} px-2 py-0.5`} aria-label="−">−</button>
              <span className="w-6 text-center font-bold">{items[p.id] ?? 0}</span>
              <button type="button" onClick={() => setQty(p.id, (items[p.id] ?? 0) + 1)} className={`${ui.btnGhost} px-2 py-0.5`} aria-label="+">+</button>
            </li>
          ))}
          {prodList.length === 0 && <li className={`text-xs ${ui.muted}`}>{t('sale.noProducts')}</li>}
        </ul>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={ui.label}>{t('loan.count')}</label>
          <input inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value.replace(/\D/g, ''))} className={ui.input} />
        </div>
        <div>
          <label className={ui.label}>{t('loan.every')}</label>
          <select value={every} onChange={(e) => setEvery(Number(e.target.value))} className={ui.input}>
            {FREQS.map(([d, k]) => <option key={d} value={d}>{t(`card.f.${k}` as DictKey)}</option>)}
          </select>
        </div>
        <div className="col-span-2">
          <label className={ui.label}>{t('loan.firstDue')}</label>
          <input type="date" min={today} value={first} onChange={(e) => setFirst(e.target.value)} className={ui.input} />
        </div>
        <div className="col-span-2">
          <label className={ui.label}>{t('cust.notes')}</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} className={ui.input} />
        </div>
      </div>

      {chosen.length > 0 && (
        <div className="space-y-1 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/50">
          <p className="flex justify-between"><span>{t('loan.total')}</span><b>{fmt(total)}</b></p>
          {valid && <p className="flex justify-between"><span>{t('loan.each', { n })}</span><b>{fmt(each)}</b></p>}
          <p className={`text-xs ${ui.muted}`}>{t('sale.noInterest')}</p>
        </div>
      )}
      {err && <p className="text-sm font-semibold text-red-600 dark:text-red-400">{err}</p>}
      <button type="button" disabled={!valid || busy} onClick={submit} className={`${ui.btnPrimary} w-full py-3`}>
        {busy ? t('common.wait') : t('sale.submit')}
      </button>
    </div>
  );
}
