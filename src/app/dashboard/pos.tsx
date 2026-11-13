'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { rpc } from '../../lib/supabase';
import { Card } from './shell';
import { ui } from '../site-header';
import { useT } from '../i18n';
import type { DictKey } from '../i18n/es';
import { money, shortTime } from './format';

type Branch = { id: string; name: string; company: string; currency: string };
type Product = { id: string; sku: string; name: string; price: number; type: string; unit: string; stock: number | null };
type Sale = { id: string; at: string; total: number; currency: string; items: number; paid: boolean };
type Line = { product: Product; qty: number };

const okBox = 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300';
const errBox = 'border-red-300 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400';

function posError(msg: string, t: (k: DictKey) => string) {
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
  const [query, setQuery] = useState('');
  const [cart, setCart] = useState<Line[]>([]);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [sheet, setSheet] = useState(false);   // pedido abierto en celular

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

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  const flash = (ok: boolean, text: string) => {
    setMsg({ ok, text });
    setTimeout(() => setMsg(null), 6000);
  };

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

  const total = cart.reduce((s, l) => s + l.qty * Number(l.product.price), 0);
  const count = cart.reduce((s, l) => s + l.qty, 0);

  const send = async () => {
    if (!cart.length || !branchId) return;
    setBusy(true);
    try {
      await rpc('create_sale', {
        p_branch: branchId,
        p_items: cart.map((l) => ({ product_id: l.product.id, qty: l.qty })),
        p_notes: notes,
      });
      flash(true, t('pos.sent', { amount: fmt(total) }));
      setCart([]);
      setNotes('');
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
      <div>
        <label className={ui.label}>{t('pos.notes')}</label>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={200} className={ui.input} />
      </div>
      <div className="flex items-baseline justify-between border-t border-slate-200 pt-3 dark:border-slate-800">
        <span className="font-semibold">{t('pos.total')}</span>
        <span className="text-2xl font-extrabold">{fmt(total)}</span>
      </div>
      <button type="button" disabled={busy || cart.length === 0} onClick={send} className={`${ui.btnPrimary} w-full py-3 text-base`}>
        {busy ? t('common.wait') : `${t('pos.send')} →`}
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
                  <button
                    key={p.id}
                    type="button"
                    disabled={out}
                    onClick={() => add(p)}
                    className={`relative flex min-h-28 flex-col justify-between rounded-2xl p-3 text-left transition cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${ui.card} ${
                      qty > 0 ? 'ring-2 ring-blue-500' : 'hover:border-blue-400'
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
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Celular: barra inferior con el total y hoja con el pedido */}
      {cart.length > 0 && !sheet && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur lg:hidden dark:border-slate-800 dark:bg-slate-950/95">
          <button type="button" onClick={() => setSheet(true)} className={`${ui.btnPrimary} w-full justify-between py-3 text-base`}>
            <span>🧾 {t('pos.viewCart')} · {count}</span>
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
