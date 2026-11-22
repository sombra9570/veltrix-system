'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase, rpc } from '../../lib/supabase';
import { Card } from './shell';
import { ui } from '../site-header';
import { useSync } from './sync';
import { useT } from '../i18n';
import type { DictKey } from '../i18n/es';
import { money, parseAmount } from './format';
import { QrRequests, TableQrCard } from './table-qr';
import { DeliveryRequests, DeliveryBoard, DeliverySetup, CashReceive, CourierBoard } from './delivery';
import { useLive } from './live';
import { SkuTag } from './sku-tag';

type Branch = { id: string; name: string; company: string; currency: string };
type Table = {
  id: string; name: string; seats: number; area: string | null; active: boolean;
  order_id: string | null; guests: number | null; opened_at: string | null; waiter: string | null;
  total: number; ready: number; cooking: number;
};
type Item = { id: string; description: string; qty: number; price: number; total: number; notes: string | null; kitchen: string | null };
type Order = { id: string; status: string; guests: number | null; currency: string; table: string; items: Item[] };
type Product = { id: string; name: string; price: number; type: string; stock: number | null; sku: string };
type Line = { product: Product; qty: number; notes: string };

const okBox = 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300';
const errBox = 'border-red-300 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400';
const statusPill: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
  preparing: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300',
  ready: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
  served: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
};

/** Mesas del restaurante: lo usan el mesero, el cajero y el dueño (que además configura). */
export function TablesScreen({ manage = false }: { manage?: boolean }) {
  const { t, lang } = useT();
  const [branches, setBranches] = useState<Branch[] | null>(null);
  const [branchId, setBranchId] = useState('');
  const [tables, setTables] = useState<Table[]>([]);
  const [order, setOrder] = useState<Order | null>(null);
  const [setup, setSetup] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    rpc<Branch[]>('seller_branches').then((b) => { setBranches(b ?? []); if (b?.length) setBranchId(b[0].id); }).catch(() => setBranches([]));
  }, []);
  const branch = branches?.find((b) => b.id === branchId);
  const fmt = (n: number) => money(Number(n), branch?.currency ?? 'USD', lang);
  const flash = (ok: boolean, text: string) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 5000); };

  const loadBoard = useCallback(async () => {
    if (!branchId) return;
    try { setTables(await rpc<Table[]>('tables_board', { p_branch: branchId }) ?? []); } catch { /* sin conexión */ }
  }, [branchId]);
  const loadOrder = useCallback(async (id: string) => {
    try { setOrder(await rpc<Order>('table_order', { p_order: id })); } catch { setOrder(null); }
  }, []);

  useEffect(() => {
    loadBoard();
  }, [loadBoard]);
  // Mesas en vivo, pero solo con la pantalla visible
  useSync(() => { loadBoard(); if (order?.id) loadOrder(order.id); }, 0);
  useLive('tables', () => { loadBoard(); if (order?.id) loadOrder(order.id); });

  const openTable = async (tb: Table) => {
    try {
      let id = tb.order_id;
      if (!id) {
        const g = window.prompt(t('rest.guestsPrompt'), String(Math.min(2, tb.seats)));
        if (g === null) return;
        id = await rpc<string>('open_table_order', { p_table: tb.id, p_guests: parseInt(g, 10) || null });
      }
      await loadOrder(id);
      await loadBoard();
    } catch { flash(false, t('err.generic')); }
  };

  if (branches === null) return <p className={`text-sm ${ui.muted}`}>{t('common.wait')}</p>;
  if (branches.length === 0) return <Card><p className={`text-sm ${ui.muted}`}>{t('pos.noBranches')}</p></Card>;

  const areas = Array.from(new Set(tables.filter((x) => x.active).map((x) => x.area ?? '')));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-extrabold sm:text-2xl">🍽️ {t('rest.title')}</h1>
          <p className={`text-sm ${ui.muted}`}>{t('rest.subtitle', { n: tables.filter((x) => x.order_id).length, total: tables.filter((x) => x.active).length })}</p>
        </div>
        <div className="flex flex-wrap gap-2 max-sm:w-full">
          {branches.length > 1 && (
            <select value={branchId} onChange={(e) => { setBranchId(e.target.value); setOrder(null); }} className={`${ui.input} !w-auto max-sm:!w-full`}>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.company} · {b.name}</option>)}
            </select>
          )}
          {manage && <button type="button" onClick={() => setSetup(!setup)} className={`${ui.btnGhost} max-sm:w-full`}>⚙️ {t('rest.setup')}</button>}
        </div>
      </div>

      {msg && <p className={`rounded-xl border p-3 text-sm font-semibold ${msg.ok ? okBox : errBox}`}>{msg.text}</p>}

      {manage && setup && <SetupPanel branchId={branchId} tables={tables} onChanged={loadBoard} flash={flash} />}

      <QrRequests branchId={branchId} currency={branch?.currency ?? 'USD'} onChanged={loadBoard} flash={flash} />
      <DeliveryRequests branchId={branchId} currency={branch?.currency ?? 'USD'} onChanged={loadBoard} flash={flash} />
      <DeliveryBoard branchId={branchId} currency={branch?.currency ?? 'USD'} flash={flash} />
      <CashReceive branchId={branchId} currency={branch?.currency ?? 'USD'} flash={flash} onChanged={loadBoard} />
      {manage && <CourierBoard branchId={branchId} orgId="" currency={branch?.currency ?? 'USD'} flash={flash} manager />}

      {tables.filter((x) => x.active).length === 0 && !setup && (
        <Card><p className={`text-sm ${ui.muted}`}>{manage ? t('rest.noTablesOwner') : t('rest.noTables')}</p></Card>
      )}

      <div className="grid gap-5 lg:grid-cols-5">
        <div className={`min-w-0 space-y-4 lg:col-span-3 ${order ? 'max-lg:hidden' : ''}`}>
          {areas.map((area) => (
            <div key={area}>
              {area && <p className={`mb-2 text-xs font-bold uppercase tracking-wide ${ui.muted}`}>{area}</p>}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {tables.filter((x) => x.active && (x.area ?? '') === area).map((tb) => (
                  <button key={tb.id} type="button" onClick={() => openTable(tb)}
                    className={`flex min-h-28 flex-col justify-between rounded-2xl border-2 p-3 text-left transition cursor-pointer ${
                      tb.order_id
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10'
                        : 'border-emerald-400/60 bg-white dark:bg-slate-900'
                    } ${order?.id && order.id === tb.order_id ? 'ring-4 ring-blue-500/30' : ''}`}>
                    <span className="flex items-start justify-between gap-1">
                      <span className="font-extrabold">{tb.name}</span>
                      <span className={`text-[11px] ${ui.muted}`}>👤 {tb.guests ?? tb.seats}</span>
                    </span>
                    {tb.order_id ? (
                      <span>
                        <span className="block text-lg font-extrabold">{fmt(tb.total)}</span>
                        <span className="flex flex-wrap gap-1 text-[11px] font-bold">
                          {tb.cooking > 0 && <span className="rounded-full bg-amber-100 px-1.5 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200">🔥 {tb.cooking}</span>}
                          {tb.ready > 0 && <span className="rounded-full bg-emerald-100 px-1.5 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200">✅ {tb.ready}</span>}
                          {tb.waiter && <span className={`truncate font-normal ${ui.muted}`}>{tb.waiter}</span>}
                        </span>
                      </span>
                    ) : (
                      <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">{t('rest.free')}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {order && (
          <div className="min-w-0 lg:col-span-2">
            <OrderPanel order={order} branchId={branchId} fmt={fmt}
              onClose={() => setOrder(null)}
              onChanged={async () => { await loadOrder(order.id); await loadBoard(); }}
              onClosed={async (total) => { flash(true, t('rest.sentToCash', { amount: fmt(total) })); setOrder(null); await loadBoard(); }}
              flash={flash} />
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Comanda de una mesa ---------- */
function OrderPanel({ order, branchId, fmt, onClose, onChanged, onClosed, flash }: {
  order: Order; branchId: string; fmt: (n: number) => string;
  onClose: () => void; onChanged: () => Promise<void>; onClosed: (total: number) => Promise<void>;
  flash: (ok: boolean, text: string) => void;
}) {
  const { t } = useT();
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [adding, setAdding] = useState<Line[]>([]);
  const [q, setQ] = useState('');
  const [tip, setTip] = useState('');
  const [disc, setDisc] = useState('');
  const [closing, setClosing] = useState(false);
  const [busy, setBusy] = useState(false);
  // Identificador del envío a cocina: si se reintenta tras un corte de señal, el servidor no repite los platos
  const sendKey = useRef<{ k: string; sig: string } | null>(null);

  useEffect(() => {
    rpc<Product[]>('pos_catalog', { p_branch: branchId }).then((c) => setCatalog(c ?? [])).catch(() => setCatalog([]));
  }, [branchId]);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? catalog.filter((p) => p.name.toLowerCase().includes(s)) : catalog;
  }, [catalog, q]);

  const total = order.items.reduce((s, i) => s + Number(i.total), 0);
  const tipN = parseAmount(tip || '0');
  const pct = Math.min(99, Math.max(0, parseFloat(disc.replace(',', '.')) || 0));
  const net = pct > 0 ? order.items.reduce((s, i) => s + Number(i.qty) * Math.round(Number(i.price) * (1 - pct / 100) * 100) / 100, 0) : total;

  const add = (p: Product) => setAdding((a) => {
    const ex = a.find((l) => l.product.id === p.id && !l.notes);
    return ex ? a.map((l) => (l === ex ? { ...l, qty: l.qty + 1 } : l)) : [...a, { product: p, qty: 1, notes: '' }];
  });
  // Quita uno (del último renglón de ese producto) o todos
  const sub = (p: Product, all = false) => setAdding((a) => {
    if (all) return a.filter((l) => l.product.id !== p.id);
    const k = a.map((l) => l.product.id).lastIndexOf(p.id);
    if (k < 0) return a;
    return a.map((l, j) => (j === k ? { ...l, qty: l.qty - 1 } : l)).filter((l) => l.qty > 0);
  });
  const qtyOf = (id: string) => adding.filter((l) => l.product.id === id).reduce((n, l) => n + l.qty, 0);

  const send = async () => {
    if (!adding.length) return;
    setBusy(true);
    try {
      const items = adding.map((l) => ({ product_id: l.product.id, qty: l.qty, notes: l.notes }));
      const sig = order.id + JSON.stringify(items);
      if (!sendKey.current || sendKey.current.sig !== sig) sendKey.current = { k: crypto.randomUUID(), sig };
      await rpc('add_table_items', { p_order: order.id, p_client: sendKey.current.k, p_items: items });
      sendKey.current = null;
      setAdding([]);
      await onChanged();
    } catch { flash(false, t('err.generic')); } finally { setBusy(false); }
  };
  const act = async (fn: string, args: Record<string, unknown>) => {
    try { await rpc(fn, args); await onChanged(); } catch { flash(false, t('err.generic')); }
  };
  const close = async () => {
    if (Number.isNaN(tipN) || tipN < 0) return flash(false, t('cash.invalidAmount'));
    setBusy(true);
    try {
      await rpc('close_table', pct > 0 ? { p_order: order.id, p_tip: tipN, p_discount: pct } : { p_order: order.id, p_tip: tipN });
      await onClosed(net + tipN);
    } catch (e) {
      const m = (e as Error).message;
      const over = m.match(/DISCOUNT_OVER_LIMIT:([\d.]+)/);
      flash(false, over ? t('pos.discountOver', { n: Number(over[1]) }) : m.includes('PERM_DENIED') ? t('err.permDenied') : t('err.generic'));
    } finally { setBusy(false); }
  };

  return (
    <Card className="space-y-4 lg:sticky lg:top-24">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold">{order.table}</h2>
          {order.guests && <p className={`text-xs ${ui.muted}`}>👤 {order.guests}</p>}
        </div>
        <button type="button" onClick={onClose} aria-label={t('pos.close')} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-300 cursor-pointer dark:border-slate-700">✕</button>
      </div>

      {/* Lo que ya se pidió */}
      {order.items.length === 0 ? (
        <p className={`text-sm ${ui.muted}`}>{t('rest.emptyOrder')}</p>
      ) : (
        <ul className="space-y-2">
          {order.items.map((i) => (
            <li key={i.id} className="flex items-center gap-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{Number(i.qty)} × {i.description}</p>
                {i.notes && <p className={`truncate text-xs ${ui.muted}`}>📝 {i.notes}</p>}
              </div>
              {i.kitchen && (
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${statusPill[i.kitchen] ?? ''}`}>{t(`rest.k.${i.kitchen}` as DictKey)}</span>
              )}
              {i.kitchen === 'ready' && (
                <button type="button" onClick={() => act('set_kitchen_item_status', { p_item: i.id, p_status: 'served' })} className="rounded-lg bg-emerald-600 px-2 py-1 text-xs font-bold text-white cursor-pointer">{t('rest.serve')}</button>
              )}
              {(i.kitchen === null || i.kitchen === 'pending') && (
                <button type="button" onClick={() => act('remove_table_item', { p_item: i.id })} aria-label={t('rest.remove')} className={`text-xs ${ui.muted} hover:text-red-600 cursor-pointer`}>✕</button>
              )}
              <span className="w-20 shrink-0 text-right font-bold">{fmt(i.total)}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Agregar */}
      <div className="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
        <p className="text-sm font-bold">➕ {t('rest.addItems')}</p>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('pos.search')} className={ui.input} />
        <div className="grid max-h-56 grid-cols-2 gap-2 overflow-y-auto">
          {list.map((p) => {
            const q = qtyOf(p.id);
            return (
              <div key={p.id} className="relative">
                <button type="button" onClick={() => add(p)} disabled={p.stock !== null && Number(p.stock) <= 0}
                  onContextMenu={(e) => { if (q > 0) { e.preventDefault(); sub(p); } }}
                  className={`w-full rounded-xl border p-2 text-left text-sm transition cursor-pointer disabled:opacity-40 ${q > 0 ? 'border-blue-500 ring-1 ring-blue-500 pb-10' : 'border-slate-200 hover:border-blue-400 dark:border-slate-700'}`}>
                  <span className={`line-clamp-2 font-semibold ${q > 0 ? 'ps-5' : ''}`}>{p.name}</span>
                  <span className={`text-xs ${ui.muted}`}>{fmt(p.price)}</span>
                </button>
                {q > 0 && (
                  <>
                    <button type="button" onClick={() => sub(p, true)} aria-label={t('pos.removeItem')}
                      className="absolute start-1 top-1 z-10 grid h-5 w-5 place-items-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-700 cursor-pointer hover:bg-red-100 hover:text-red-700 dark:bg-slate-700 dark:text-slate-200">✕</button>
                    <div className="absolute inset-x-1.5 bottom-1.5 z-10 flex items-center gap-1">
                      <button type="button" onClick={() => sub(p)} aria-label="−" className="h-7 flex-1 rounded-md border border-slate-300 bg-white font-bold text-slate-700 cursor-pointer dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">−</button>
                      <span className="w-6 text-center text-xs font-extrabold tabular-nums">{q}</span>
                      <button type="button" onClick={() => add(p)} aria-label="+" className="h-7 flex-1 rounded-md bg-blue-600 font-bold text-white cursor-pointer">+</button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
        {adding.length > 0 && (
          <div className="space-y-2 border-t border-slate-200 pt-2 dark:border-slate-800">
            {adding.map((l, k) => (
              <div key={k} className="flex items-center gap-2">
                <span className="w-6 text-center font-bold">{l.qty}</span>
                <span className="min-w-0 flex-1 truncate text-sm">{l.product.name}</span>
                <input value={l.notes} placeholder={t('rest.notes')} maxLength={120}
                  onChange={(e) => setAdding((a) => a.map((x, j) => (j === k ? { ...x, notes: e.target.value } : x)))}
                  className={`${ui.input} !w-32 !py-1.5 text-xs`} />
                <button type="button" onClick={() => setAdding((a) => a.filter((_, j) => j !== k))} className={`text-xs ${ui.muted} cursor-pointer`}>✕</button>
              </div>
            ))}
            <button type="button" disabled={busy} onClick={send} className={`${ui.btnPrimary} w-full`}>🔥 {t('rest.send')}</button>
          </div>
        )}
      </div>

      <div className="flex items-baseline justify-between border-t border-slate-200 pt-3 dark:border-slate-800">
        <span className="font-semibold">{t('pos.total')}</span>
        <span className="text-2xl font-extrabold">{fmt(total)}</span>
      </div>

      {!closing ? (
        <button type="button" disabled={order.items.length === 0} onClick={() => setClosing(true)} className={`${ui.btnGhost} w-full py-3`}>🧾 {t('rest.bill')}</button>
      ) : (
        <div className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/50 p-3 dark:border-blue-500/20 dark:bg-blue-500/5">
          <div>
            <label className={ui.label}>{t('rest.tip')}</label>
            <input inputMode="decimal" value={tip} onChange={(e) => setTip(e.target.value)} placeholder="0" className={ui.input} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <label className={`${ui.label} !mb-0`} htmlFor="tbl-disc">🏷️ {t('pos.discount')}</label>
            <div className="flex items-center gap-1">
              <input id="tbl-disc" inputMode="decimal" value={disc} onChange={(e) => setDisc(e.target.value.replace(/[^\d.,]/g, ''))} placeholder="0" className={`${ui.input} !w-20 text-right`} />
              <span className="font-semibold">%</span>
            </div>
          </div>
          {pct > 0 && <p className={`text-right text-xs ${ui.muted}`}>{t('pos.discountSaved', { amount: fmt(total - net) })}</p>}
          <p className="text-sm font-semibold">{t('rest.billTotal', { amount: fmt(net + (Number.isNaN(tipN) ? 0 : tipN)) })}</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setClosing(false)} className={ui.btnGhost}>{t('prod.cancel')}</button>
            <button type="button" disabled={busy} onClick={close} className={ui.btnPrimary}>{t('rest.closeBill')}</button>
          </div>
        </div>
      )}
    </Card>
  );
}

/* ---------- Configuración (dueño): mesas y qué productos van a cocina ---------- */
function SetupPanel({ branchId, tables, onChanged, flash }: {
  branchId: string; tables: Table[]; onChanged: () => Promise<void>; flash: (ok: boolean, text: string) => void;
}) {
  const { t } = useT();
  const [name, setName] = useState('');
  const [seats, setSeats] = useState('4');
  const [area, setArea] = useState('');
  const [products, setProducts] = useState<{ id: string; name: string; station: string | null }[]>([]);
  const [companyId, setCompanyId] = useState('');

  useEffect(() => {
    supabase.from('branches').select('company_id').eq('id', branchId).single()
      .then(({ data }) => setCompanyId(data?.company_id ?? ''));
  }, [branchId]);
  const loadProducts = useCallback(async () => {
    if (!companyId) return;
    try { setProducts(await rpc('kitchen_products', { p_company: companyId }) ?? []); } catch { /* */ }
  }, [companyId]);
  useEffect(() => { loadProducts(); }, [loadProducts]);

  const addTable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await rpc('save_table', { p_id: null, p_branch: branchId, p_name: name, p_seats: parseInt(seats, 10) || 4, p_area: area || null, p_active: true });
      setName('');
      await onChanged();
    } catch { flash(false, t('err.generic')); }
  };
  const toggleTable = async (tb: Table) => {
    try {
      await rpc('save_table', { p_id: tb.id, p_branch: branchId, p_name: tb.name, p_seats: tb.seats, p_area: tb.area, p_active: !tb.active });
      await onChanged();
    } catch { flash(false, t('err.generic')); }
  };
  const toggleKitchen = async (p: { id: string; station: string | null }) => {
    try {
      await rpc('set_product_station', { p_product: p.id, p_station: p.station ? null : 'cocina' });
      await loadProducts();
    } catch { flash(false, t('err.generic')); }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="space-y-3">
        <h2 className="font-bold">🪑 {t('rest.tables')}</h2>
        <form onSubmit={addTable} className="grid grid-cols-3 gap-2">
          <input required value={name} onChange={(e) => setName(e.target.value)} placeholder={t('rest.tableName')} className={`${ui.input} col-span-3 sm:col-span-1`} />
          <input inputMode="numeric" value={seats} onChange={(e) => setSeats(e.target.value)} placeholder={t('rest.seats')} className={ui.input} />
          <input value={area} onChange={(e) => setArea(e.target.value)} placeholder={t('rest.area')} className={ui.input} />
          <button type="submit" className={`${ui.btnPrimary} col-span-3`}>+ {t('rest.addTable')}</button>
        </form>
        <ul className="max-h-64 divide-y divide-slate-200 overflow-y-auto dark:divide-slate-800">
          {tables.map((tb) => (
            <li key={tb.id} className={`flex items-center gap-2 py-2 text-sm ${tb.active ? '' : 'opacity-50'}`}>
              <span className="flex-1 font-semibold">{tb.name} <span className={`font-normal ${ui.muted}`}>· 👤 {tb.seats}{tb.area ? ` · ${tb.area}` : ''}</span></span>
              <button type="button" disabled={!!tb.order_id} onClick={() => toggleTable(tb)} className={`${ui.btnGhost} !px-3 !py-1 text-xs`}>
                {tb.active ? t('prod.hide') : t('prod.show')}
              </button>
            </li>
          ))}
        </ul>
      </Card>
      <Card className="space-y-3">
        <h2 className="font-bold">🔥 {t('rest.kitchenProducts')}</h2>
        <p className={`text-xs ${ui.muted}`}>{t('rest.kitchenHint')}</p>
        <ul className="max-h-72 divide-y divide-slate-200 overflow-y-auto dark:divide-slate-800">
          {products.map((p) => (
            <li key={p.id} className="flex items-center gap-2 py-2 text-sm">
              <span className="flex-1 truncate">{p.name}</span>
              <button type="button" onClick={() => toggleKitchen(p)}
                className={`rounded-full px-3 py-1 text-xs font-bold cursor-pointer ${p.station ? 'bg-amber-500 text-white' : 'border border-slate-300 dark:border-slate-700'}`}>
                {p.station ? `🔥 ${t('rest.goesToKitchen')}` : t('rest.direct')}
              </button>
            </li>
          ))}
          {products.length === 0 && <li className={`py-2 text-sm ${ui.muted}`}>{t('prod.empty')}</li>}
        </ul>
      </Card>
      <DeliverySetup branchId={branchId} flash={flash} />
      <TableQrCard branchId={branchId} flash={flash} />
    </div>
  );
}

/* ---------- Pantalla de cocina ---------- */
type KItem = { item_id: string; order_id: string; order_type: string; table_name: string | null; description: string; qty: number; notes: string | null; modifiers: string | null; kitchen_status: 'pending' | 'preparing' | 'ready'; created_at: string; sku?: string | null };

export function KitchenScreen() {
  const { t, lang } = useT();
  const [branches, setBranches] = useState<{ id: string; name: string }[] | null>(null);
  const [branchId, setBranchId] = useState('');
  const [items, setItems] = useState<KItem[]>([]);
  const [now, setNow] = useState(0);

  useEffect(() => {
    // Dueño/supervisor: sus sucursales de venta. Cocina: las de su membresía (no vende).
    (async () => {
      const sell = await rpc<{ id: string; name: string }[]>('seller_branches').catch(() => []);
      const { data } = await supabase.from('memberships').select('branch_id, branches(name)').eq('is_active', true).is('deleted_at', null);
      const mine = (data ?? []).filter((m) => m.branch_id)
        .map((m) => ({ id: m.branch_id as string, name: ((m.branches as unknown as { name: string } | null)?.name) ?? '' }));
      const list = Array.from(new Map([...(sell ?? []), ...mine].map((b) => [b.id, { id: b.id, name: b.name }])).values());
      setBranches(list);
      if (list.length) setBranchId(list[0].id);
    })();
  }, []);

  const load = useCallback(async () => {
    if (!branchId) return;
    try {
      const q = (await rpc<KItem[]>('get_kitchen_queue', { p_branch: branchId, p_station: null })) ?? [];
      let codes = new Map<string, string>();
      try {
        const c = q.length ? await rpc<{ item_id: string; sku: string }[]>('kitchen_item_codes', { p_branch: branchId, p_items: q.map((x) => x.item_id) }) : [];
        codes = new Map((c ?? []).map((x) => [x.item_id, x.sku]));
      } catch { /* sin códigos: la cocina sigue igual */ }
      setItems(q.map((x) => ({ ...x, sku: codes.get(x.item_id) ?? null })));
    } catch { /* */ }
    setNow(Date.now());
  }, [branchId]);
  useEffect(() => {
    load();
  }, [load]);
  useSync(load, 0);
  useLive('tables', load);

  const move = async (it: KItem) => {
    const next = it.kitchen_status === 'pending' ? 'preparing' : it.kitchen_status === 'preparing' ? 'ready' : 'served';
    try { await rpc('set_kitchen_item_status', { p_item: it.item_id, p_status: next }); await load(); } catch { /* */ }
  };

  // Agrupa por pedido (mesa / para llevar)
  const groups = useMemo(() => {
    const m = new Map<string, KItem[]>();
    items.forEach((i) => m.set(i.order_id, [...(m.get(i.order_id) ?? []), i]));
    return Array.from(m.values());
  }, [items]);

  if (branches === null) return <p className={`text-sm ${ui.muted}`}>{t('common.wait')}</p>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold sm:text-2xl">🔥 {t('rest.kitchen')}</h1>
          <p className={`text-sm ${ui.muted}`}>{t('rest.kitchenSubtitle', { n: items.length })}</p>
        </div>
        {branches.length > 1 && (
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={`${ui.input} !w-auto`}>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
      </div>
      {groups.length === 0 && <Card><p className={`text-sm ${ui.muted}`}>{t('rest.kitchenEmpty')}</p></Card>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {groups.map((g) => {
          const mins = Math.floor((now - new Date(g[0].created_at).getTime()) / 60000);
          return (
            <Card key={g[0].order_id} className={`space-y-3 ${mins >= 20 ? 'border-red-400 dark:border-red-500/50' : ''}`}>
              <div className="flex items-center justify-between">
                <p className="text-lg font-extrabold">{g[0].table_name ?? t(`rest.type.${g[0].order_type}` as DictKey)}</p>
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${mins >= 20 ? 'bg-red-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}>⏱ {Math.max(0, mins)} min</span>
              </div>
              <ul className="space-y-2">
                {g.map((it) => (
                  <li key={it.item_id}>
                    <button type="button" onClick={() => move(it)}
                      className={`flex w-full items-center gap-3 rounded-xl p-3 text-left transition cursor-pointer ${
                        it.kitchen_status === 'ready' ? 'bg-emerald-100 dark:bg-emerald-500/15'
                          : it.kitchen_status === 'preparing' ? 'bg-blue-100 dark:bg-blue-500/15' : 'bg-amber-50 dark:bg-amber-500/10'}`}>
                      <span className="text-2xl font-extrabold">{Number(it.qty)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-bold">{it.description}<SkuTag sku={it.sku} /></span>
                        {(it.notes || it.modifiers) && <span className="block text-xs font-semibold text-red-700 dark:text-red-300">📝 {[it.modifiers, it.notes].filter(Boolean).join(' · ')}</span>}
                      </span>
                      <span className="text-xs font-bold">{t(`rest.next.${it.kitchen_status}` as DictKey)} →</span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className={`text-[11px] ${ui.muted}`}>{new Date(g[0].created_at).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' })}</p>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
