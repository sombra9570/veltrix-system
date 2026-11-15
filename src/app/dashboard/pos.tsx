'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { rpc } from '../../lib/supabase';
import { Card } from './shell';
import { ui } from '../site-header';
import { useSync } from './sync';
import { useT } from '../i18n';
import type { DictKey } from '../i18n/es';
import { money, shortTime } from './format';

type Branch = { id: string; name: string; company: string; currency: string };
type Product = { id: string; sku: string; name: string; price: number; type: string; unit: string; stock: number | null };
type Sale = { id: string; at: string; total: number; currency: string; items: number; paid: boolean };
type Line = { product: Product; qty: number };
type Cust = { id: string; name: string; tax_id: string | null; credit_status: string; balance: number; credit_limit: number };
const FREQS = [
  { days: 1, label: 'pos.daily' },
  { days: 7, label: 'pos.weekly' },
  { days: 15, label: 'pos.biweekly' },
  { days: 30, label: 'pos.monthly' },
] as const;
const addDays = (d: number) => {
  const x = new Date(); x.setDate(x.getDate() + d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

const okBox = 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300';
const errBox = 'border-red-300 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400';

function posError(msg: string, t: (k: DictKey, v?: Record<string, string | number>) => string) {
  const over = msg.match(/DISCOUNT_OVER_LIMIT:([\d.]+)/);
  if (over) return t('pos.discountOver', { n: Number(over[1]) });
  if (/PERM_DENIED/.test(msg)) return t('err.permDenied');
  if (/Stock insuficiente/i.test(msg)) return t('pos.noStock');
  if (/suspendida/i.test(msg)) return t('err.suspended');
  return t('err.generic');
}

/** Punto de venta: lo usan el vendedor y también el dueño o supervisor. */
export function PosScreen() {
  const { t, lang } = useT();
  const [branches, setBranches] = useState<Branch[] | null>(null);
  const [branchId, setBranchId] = useState('');
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [disc, setDisc] = useState('');
  const [query, setQuery] = useState('');
  const [cart, setCart] = useState<Line[]>([]);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [sheet, setSheet] = useState(false);   // pedido abierto en celular
  // Venta a crédito
  const [mode, setMode] = useState<'cash' | 'credit'>('cash');
  const [canCredit, setCanCredit] = useState(true);   // permiso que da el dueño
  const [custQuery, setCustQuery] = useState('');
  const [custs, setCusts] = useState<Cust[]>([]);
  const [customer, setCustomer] = useState<Cust | null>(null);
  const [count, setCount] = useState('4');
  const [every, setEvery] = useState(7);
  const [firstDue, setFirstDue] = useState(addDays(7));

  useEffect(() => {
    rpc<Branch[]>('seller_branches')
      .then((b) => { setBranches(b ?? []); if (b?.length) setBranchId(b[0].id); })
      .catch(() => setBranches([]));
  }, []);

  const branch = branches?.find((b) => b.id === branchId);
  const currency = branch?.currency ?? 'USD';
  const fmt = (n: number) => money(Number(n), currency, lang);

  const load = useCallback(async () => {
    if (!branchId) return;
    try {
      const [c, s] = await Promise.all([
        rpc<Product[]>('pos_catalog', { p_branch: branchId }),
        rpc<Sale[]>('my_sales_today', { p_branch: branchId }),
      ]);
      setCatalog(c ?? []);
      setSales(s ?? []);
    } catch { /* sin conexión */ }
  }, [branchId]);

  // Permisos del usuario en esta sucursal (el dueño puede quitar la venta a crédito)
  useEffect(() => {
    if (!branchId) return;
    rpc<Record<string, boolean>>('my_permissions', { p_branch: branchId })
      .then((p) => { const ok = p?.['sales.credit'] !== false; setCanCredit(ok); if (!ok) setMode('cash'); })
      .catch(() => {});
  }, [branchId]);

  useEffect(() => {
    load();
  }, [load]);
  useSync(load);

  const flash = (ok: boolean, text: string) => {
    setMsg({ ok, text });
    setTimeout(() => setMsg(null), 6000);
  };

  // Busca clientes registrados para vender a crédito
  useEffect(() => {
    if (mode !== 'credit' || !branchId || customer) return;
    const id = setTimeout(() => {
      rpc<Cust[]>('customers_list', { p_branch: branchId, p_search: custQuery || null })
        .then((r) => setCusts((r ?? []).slice(0, 8)))
        .catch(() => setCusts([]));
    }, 250);
    return () => clearTimeout(id);
  }, [mode, branchId, custQuery, customer]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q));
  }, [catalog, query]);

  const inCart = (id: string) => cart.find((l) => l.product.id === id)?.qty ?? 0;
  const add = (p: Product) => {
    if (p.stock !== null && inCart(p.id) + 1 > Number(p.stock)) return;
    setCart((c) => {
      const ex = c.find((l) => l.product.id === p.id);
      return ex ? c.map((l) => (l.product.id === p.id ? { ...l, qty: l.qty + 1 } : l)) : [...c, { product: p, qty: 1 }];
    });
  };
  const change = (id: string, delta: number) => {
    setCart((c) =>
      c
        .map((l) => {
          if (l.product.id !== id) return l;
          const max = l.product.stock === null ? Infinity : Number(l.product.stock);
          return { ...l, qty: Math.min(max, l.qty + delta) };
        })
        .filter((l) => l.qty > 0),
    );
  };

  const gross = cart.reduce((s, l) => s + l.qty * Number(l.product.price), 0);
  const pct = mode === 'cash' ? Math.min(99, Math.max(0, parseFloat(disc.replace(',', '.')) || 0)) : 0;
  const total = pct > 0 ? cart.reduce((s, l) => s + l.qty * Math.round(Number(l.product.price) * (1 - pct / 100) * 100) / 100, 0) : gross;
  const units = cart.reduce((s, l) => s + l.qty, 0);
  const nInst = Math.max(1, Math.min(120, parseInt(count, 10) || 1));

  // Pedir anulación: si es supervisor o dueño se anula directo; si no, va a la bandeja de aprobaciones
  const askCancel = async (id: string) => {
    const reason = window.prompt(t('appr.reasonAsk'));
    if (!reason?.trim()) return;
    try {
      const r = await rpc<string | null>('request_cancel_sale', { p_order: id, p_reason: reason.trim() });
      flash(true, r ? t('appr.requested') : t('appr.cancelled'));
      await load();
    } catch (err) {
      const m = (err as Error).message;
      flash(false, m.includes('REQUEST_PENDING') ? t('appr.alreadyPending') : m.includes('SALE_HAS_PAYMENTS') ? t('appr.hasPayments') : posError(m, t));
    }
  };

  const send = async () => {
    if (!cart.length || !branchId) return;
    if (mode === 'credit' && !customer) return flash(false, t('pos.pickCustomer'));
    setBusy(true);
    try {
      const items = cart.map((l) => ({ product_id: l.product.id, qty: l.qty }));
      if (mode === 'credit' && customer) {
        const r = await rpc<{ approval: string }>('create_credit_sale', {
          p_branch: branchId, p_customer: customer.id, p_items: items,
          p_count: nInst, p_every_days: every, p_first_due: firstDue, p_notes: notes,
        });
        flash(true, r.approval === 'pending_supervisor'
          ? t('pos.creditPending', { name: customer.name })
          : t('pos.creditOk', { name: customer.name, n: nInst }));
        setCustomer(null);
        setMode('cash');
      } else {
        await rpc('create_sale', pct > 0 ? { p_branch: branchId, p_items: items, p_notes: notes, p_discount: pct } : { p_branch: branchId, p_items: items, p_notes: notes });
        flash(true, t('pos.sent', { amount: fmt(total) }));
      }
      setCart([]);
      setNotes('');
      setDisc('');
      setSheet(false);
      await load();
    } catch (err) {
      flash(false, posError((err as Error).message, t));
    } finally {
      setBusy(false);
    }
  };

  if (branches === null) return <p className={`text-sm ${ui.muted}`}>{t('common.wait')}</p>;
  if (branches.length === 0) return <Card><p className={`text-sm ${ui.muted}`}>{t('pos.noBranches')}</p></Card>;

  const cartPanel = (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-bold">🧾 {t('pos.cart')}</h2>
        {cart.length > 0 && (
          <button type="button" onClick={() => setCart([])} className={`text-xs font-semibold ${ui.muted} hover:underline cursor-pointer`}>
            {t('pos.clear')}
          </button>
        )}
      </div>
      {cart.length === 0 ? (
        <p className={`text-sm ${ui.muted}`}>{t('pos.cartEmpty')}</p>
      ) : (
        <ul className="space-y-2">
          {cart.map((l) => (
            <li key={l.product.id} className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{l.product.name}</p>
                <p className={`text-xs ${ui.muted}`}>{fmt(l.product.price)}</p>
              </div>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => change(l.product.id, -1)} aria-label="−" className="grid h-9 w-9 place-items-center rounded-lg border border-slate-300 font-bold cursor-pointer dark:border-slate-700">−</button>
                <span className="w-8 text-center font-bold">{l.qty}</span>
                <button type="button" onClick={() => change(l.product.id, 1)} aria-label="+" className="grid h-9 w-9 place-items-center rounded-lg border border-slate-300 font-bold cursor-pointer dark:border-slate-700">+</button>
              </div>
              <span className="w-20 shrink-0 text-right text-sm font-bold">{fmt(l.qty * l.product.price)}</span>
            </li>
          ))}
        </ul>
      )}
      {/* Contado o crédito */}
      <div className={`grid gap-2 ${canCredit ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {(canCredit ? (['cash', 'credit'] as const) : (['cash'] as const)).map((m) => (
          <button key={m} type="button" onClick={() => setMode(m)}
            className={`rounded-xl px-3 py-2 text-sm font-semibold transition cursor-pointer ${mode === m ? 'bg-blue-600 text-white' : 'border border-slate-300 dark:border-slate-700'}`}>
            {m === 'cash' ? `💵 ${t('pos.cashSale')}` : `📅 ${t('pos.creditSale')}`}
          </button>
        ))}
      </div>
      {mode === 'credit' && (
        <div className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/50 p-3 dark:border-blue-500/20 dark:bg-blue-500/5">
          {customer ? (
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-semibold">{customer.name}</p>
                <p className={`text-xs ${ui.muted}`}>{t('cust.balance')}: {fmt(customer.balance)} · {t('cust.limit')}: {fmt(customer.credit_limit)}</p>
              </div>
              <button type="button" onClick={() => setCustomer(null)} className={`text-xs font-semibold ${ui.muted} hover:underline cursor-pointer`}>{t('pos.change')}</button>
            </div>
          ) : (
            <div>
              <label className={ui.label}>{t('cash.customer')}</label>
              <input type="search" value={custQuery} onChange={(e) => setCustQuery(e.target.value)} placeholder={t('cust.search')} className={ui.input} />
              <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">
                {custs.map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => setCustomer(c)} className="flex w-full justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-white cursor-pointer dark:hover:bg-slate-800">
                      <span className="truncate">{c.name}</span>
                      <span className={`shrink-0 text-xs ${ui.muted}`}>{c.tax_id ?? ''}</span>
                    </button>
                  </li>
                ))}
                {custs.length === 0 && <li className={`px-2 text-xs ${ui.muted}`}>{t('pos.noCustomers')}</li>}
              </ul>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={ui.label}>{t('pos.installments')}</label>
              <input inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value.replace(/\D/g, ''))} className={ui.input} />
            </div>
            <div>
              <label className={ui.label}>{t('pos.every')}</label>
              <select value={every} onChange={(e) => { const d = Number(e.target.value); setEvery(d); setFirstDue(addDays(d)); }} className={ui.input}>
                {FREQS.map((f) => <option key={f.days} value={f.days}>{t(f.label)}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className={ui.label}>{t('pos.firstDue')}</label>
            <input type="date" value={firstDue} min={addDays(0)} onChange={(e) => setFirstDue(e.target.value)} className={ui.input} />
          </div>
          {cart.length > 0 && (
            <p className={`text-xs ${ui.muted}`}>{t('pos.installmentOf', { n: nInst, amount: fmt(total / nInst) })}</p>
          )}
          <p className={`text-[11px] ${ui.muted}`}>⚖️ {t('legal.creditNotice')}</p>
        </div>
      )}
      <div>
        <label className={ui.label}>{t('pos.notes')}</label>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={200} className={ui.input} />
      </div>
      {mode === 'cash' && cart.length > 0 && (
        <div className="flex items-center justify-between gap-3">
          <label className={`${ui.label} !mb-0`} htmlFor="pos-disc">🏷️ {t('pos.discount')}</label>
          <div className="flex items-center gap-1">
            <input id="pos-disc" inputMode="decimal" value={disc} onChange={(e) => setDisc(e.target.value.replace(/[^\d.,]/g, ''))} placeholder="0" className={`${ui.input} !w-20 text-right`} />
            <span className="font-semibold">%</span>
          </div>
        </div>
      )}
      {pct > 0 && <p className={`text-right text-xs ${ui.muted}`}>{t('pos.discountSaved', { amount: fmt(gross - total) })}</p>}
      <div className="flex items-baseline justify-between border-t border-slate-200 pt-3 dark:border-slate-800">
        <span className="font-semibold">{t('pos.total')}</span>
        <span className="text-2xl font-extrabold">{fmt(total)}</span>
      </div>
      <button type="button" disabled={busy || cart.length === 0} onClick={send} className={`${ui.btnPrimary} w-full py-3 text-base`}>
        {busy ? t('common.wait') : mode === 'credit' ? `${t('pos.sendCredit')} →` : `${t('pos.send')} →`}
      </button>
    </div>
  );

  return (
    <div className="space-y-5 pb-24 lg:pb-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-extrabold sm:text-2xl">🛒 {t('pos.title')}</h1>
          {branch && <p className={`text-sm ${ui.muted}`}>{branch.company} · {branch.name}</p>}
        </div>
        {branches.length > 1 && (
          <select
            aria-label={t('pos.branch')}
            value={branchId}
            onChange={(e) => { setBranchId(e.target.value); setCart([]); }}
            className={`${ui.input} !w-auto`}
          >
            {branches.map((b) => <option key={b.id} value={b.id}>{b.company} · {b.name}</option>)}
          </select>
        )}
      </div>

      {msg && <p className={`rounded-xl border p-3 text-sm font-semibold ${msg.ok ? okBox : errBox}`}>{msg.text}</p>}

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Catálogo */}
        <div className="space-y-3 lg:col-span-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('pos.search')}
            className={ui.input}
          />
          {catalog.length === 0 ? (
            <Card><p className={`text-sm ${ui.muted}`}>{t('pos.noProducts')}</p></Card>
          ) : filtered.length === 0 ? (
            <p className={`text-sm ${ui.muted}`}>{t('pos.noResults')}</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {filtered.map((p) => {
                const out = p.stock !== null && Number(p.stock) - inCart(p.id) <= 0;
                const qty = inCart(p.id);
                return (
                  <div key={p.id} className="relative">
                  <button
                    type="button"
                    disabled={out && qty === 0}
                    onClick={() => { if (!out) add(p); }}
                    onContextMenu={(e) => { if (qty > 0) { e.preventDefault(); change(p.id, -1); } }}
                    className={`relative flex min-h-28 w-full flex-col justify-between rounded-2xl p-3 text-left transition cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${ui.card} ${
                      qty > 0 ? 'ring-2 ring-blue-500 pb-12' : 'hover:border-blue-400'
                    }`}
                  >
                    {qty > 0 && (
                      <span className="absolute end-2 top-2 grid h-6 min-w-6 place-items-center rounded-full bg-blue-600 px-1.5 text-xs font-bold text-white">{qty}</span>
                    )}
                    <span className="line-clamp-2 pe-6 text-sm font-semibold">{p.name}</span>
                    <span>
                      <span className="block text-lg font-extrabold">{fmt(p.price)}</span>
                      <span className={`block text-[11px] ${ui.muted}`}>
                        {p.type === 'service'
                          ? t('pos.service')
                          : p.stock === null
                            ? p.sku
                            : out
                              ? t('pos.out')
                              : t('pos.stock', { n: Number(p.stock) - qty })}
                      </span>
                    </span>
                  </button>
                  {qty > 0 && (
                    <>
                      {/* Quitar del todo */}
                      <button type="button" onClick={() => change(p.id, -qty)} aria-label={t('pos.removeItem')}
                        className="absolute start-1.5 top-1.5 z-10 grid h-6 w-6 place-items-center rounded-full bg-slate-200 text-xs font-bold text-slate-700 cursor-pointer hover:bg-red-100 hover:text-red-700 dark:bg-slate-700 dark:text-slate-200">✕</button>
                      {/* − a la izquierda (quita uno), + a la derecha (agrega uno) */}
                      <div className="absolute inset-x-2 bottom-2 z-10 flex items-center justify-between gap-1">
                        <button type="button" onClick={() => change(p.id, -1)} aria-label="−"
                          className="h-9 flex-1 rounded-lg border border-slate-300 bg-white text-lg font-bold text-slate-700 cursor-pointer hover:bg-red-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">−</button>
                        <span className="w-8 text-center text-sm font-extrabold tabular-nums">{qty}</span>
                        <button type="button" disabled={out} onClick={() => add(p)} aria-label="+"
                          className="h-9 flex-1 rounded-lg bg-blue-600 text-lg font-bold text-white cursor-pointer hover:bg-blue-700 disabled:opacity-40">+</button>
                      </div>
                    </>
                  )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Pedido: columna fija en computadora */}
        <div className="hidden lg:block">
          <Card className="sticky top-24">{cartPanel}</Card>
        </div>
      </div>

      {/* Mis ventas de hoy */}
      <Card className="!p-0 overflow-hidden">
        <h2 className="border-b border-slate-200 px-5 py-3 font-bold dark:border-slate-800">{t('pos.today')}</h2>
        {sales.length === 0 ? (
          <p className={`p-5 text-sm ${ui.muted}`}>{t('pos.todayEmpty')}</p>
        ) : (
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {sales.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-5 py-3">
                <span className={`w-12 shrink-0 text-xs ${ui.muted}`}>{shortTime(s.at, lang)}</span>
                <span className={`flex-1 text-sm ${ui.muted}`}>{t('pos.items', { n: s.items })}</span>
                <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${s.paid ? okBox : 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300'}`}>
                  {s.paid ? t('pos.paid') : t('pos.pending')}
                </span>
                <span className="w-24 text-right font-bold">{money(Number(s.total), s.currency, lang)}</span>
                {!s.paid && (
                  <button type="button" onClick={() => askCancel(s.id)} aria-label={t('appr.askCancel')} title={t('appr.askCancel')}
                    className={`${ui.btnGhost} !px-2 !py-1 text-xs`}>🚫</button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Celular: barra inferior con el total y hoja con el pedido */}
      {cart.length > 0 && !sheet && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur lg:hidden dark:border-slate-800 dark:bg-slate-950/95">
          <button type="button" onClick={() => setSheet(true)} className={`${ui.btnPrimary} w-full justify-between py-3 text-base`}>
            <span>🧾 {t('pos.viewCart')} · {units}</span>
            <span>{fmt(total)}</span>
          </button>
        </div>
      )}
      {sheet && (
        <div className="fixed inset-x-0 top-0 z-40 h-dvh lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSheet(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto overscroll-contain rounded-t-3xl bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] dark:bg-slate-900">
            <div className="mb-3 flex justify-end">
              <button type="button" onClick={() => setSheet(false)} aria-label={t('pos.close')} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-300 cursor-pointer dark:border-slate-700">✕</button>
            </div>
            {cartPanel}
          </div>
        </div>
      )}
    </div>
  );
}
