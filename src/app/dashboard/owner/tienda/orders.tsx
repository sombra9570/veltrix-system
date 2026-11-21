'use client';
import { useCallback, useEffect, useState } from 'react';
import { rpc } from '../../../../lib/supabase';
import { Card } from '../../shell';
import { ui } from '../../../site-header';
import { useT } from '../../../i18n';
import { money, shortTime } from '../../format';
import { friendlyError } from '../owner-context';
import { useLive } from '../../live';
import { useSync } from '../../sync';

type Order = {
  id: string; at: string; status: 'pending' | 'accepted' | 'rejected'; kind: 'pickup' | 'delivery'; customer: string; phone: string; address: string;
  lat: number | null; lng: number | null; notes: string | null; pay_pref: 'cash' | 'qr'; subtotal: number; reject_reason: string | null;
  assigned_to: string | null; assigned_name: string | null; fulfilled_at: string | null; items: { name: string; qty: number }[];
};
type Data = { can_resolve: boolean; can_assign: boolean; me: string; workers: { id: string; name: string }[]; orders: Order[] };

/** Bandeja de pedidos que llegan de la tienda virtual: el administrador los acepta o rechaza y los delega a un trabajador. */
export function StoreOrders({ companyId, currency, flash }: { companyId: string; currency: string; flash: (ok: boolean, text: string) => void }) {
  const { t, lang } = useT();
  const [d, setD] = useState<Data | null>(null);
  const [busy, setBusy] = useState('');
  const fmt = (n: number) => money(Number(n), currency, lang);
  const load = useCallback(async () => {
    if (!companyId) return;
    try { setD(await rpc<Data>('store_orders', { p_company: companyId })); } catch { /* sin permiso o sin conexión */ }
  }, [companyId]);
  useEffect(() => { load(); }, [load]);
  useSync(load, 0);
  useLive('delivery', load);

  const run = async (id: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(id);
    try { await fn(); if (ok) flash(true, ok); await load(); }
    catch (e) { flash(false, /PRODUCT|disponible|stock/i.test((e as Error).message) ? t('tq.errUnavailable') : friendlyError((e as Error).message, t)); }
    setBusy('');
  };
  const accept = (o: Order) => run(o.id, () => rpc('store_order_resolve', { p_request: o.id, p_accept: true, p_reason: null }), t('dl.acceptedOk', { name: o.customer }));
  const reject = (o: Order) => {
    const reason = window.prompt(t('tq.rejectReason'));
    if (reason === null) return;
    void run(o.id, () => rpc('store_order_resolve', { p_request: o.id, p_accept: false, p_reason: reason }), t('tq.rejectedOk'));
  };
  const assign = (o: Order, user: string) => run(o.id, () => rpc('store_order_assign', { p_request: o.id, p_user: user || null }));
  const done = (o: Order) => run(o.id, () => rpc('store_order_done', { p_request: o.id }), t('so.doneOk'));

  if (!d) return null;
  const pending = d.orders.filter((o) => o.status === 'pending');
  const active = d.orders.filter((o) => o.status === 'accepted' && !o.fulfilled_at);
  const closed = d.orders.filter((o) => o.status === 'rejected' || (o.status === 'accepted' && o.fulfilled_at));
  if (d.orders.length === 0) return <Card><h2 className="font-bold">🧾 {t('so.title')}</h2><p className={`mt-1 text-sm ${ui.muted}`}>{t('so.empty')}</p></Card>;

  const card = (o: Order) => (
    <li key={o.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
      <div className="flex items-start justify-between gap-2">
        <p className="font-extrabold">{o.customer} <a href={`tel:${o.phone}`} className="font-normal text-blue-600 dark:text-blue-400">· {o.phone}</a></p>
        <p className="font-extrabold">{fmt(o.subtotal)}</p>
      </div>
      <p className="text-sm font-semibold">{o.kind === 'pickup' ? `🏬 ${t('pk.pickup')}` : `🛵 ${t('pk.delivery')}`} · {o.pay_pref === 'qr' ? `📲 ${t('tq.payQr')}` : `💵 ${t('tq.payCash')}`}</p>
      {o.kind === 'delivery' && (
        <p className="text-sm">📍 {o.address}{o.lat != null && o.lng != null && <> <a href={`https://maps.google.com/?q=${o.lat},${o.lng}`} target="_blank" rel="noopener noreferrer" className="font-semibold text-blue-600 dark:text-blue-400">· {t('dl.map')}</a></>}</p>
      )}
      <ul className="mt-1 text-sm">{o.items.map((i, k) => <li key={k}>{i.qty} × {i.name}</li>)}</ul>
      {o.notes && <p className={`mt-1 text-sm ${ui.muted}`}>📝 {o.notes}</p>}
      <p className={`mt-1 text-xs ${ui.muted}`}>{shortTime(o.at, lang)}</p>
      {o.status === 'pending' && d.can_resolve && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button type="button" disabled={busy === o.id} onClick={() => accept(o)} className={`${ui.btnPrimary} !py-2 text-sm`}>✅ {t('tq.accept')}</button>
          <button type="button" disabled={busy === o.id} onClick={() => reject(o)} className={`${ui.btnGhost} !py-2 text-sm`}>✖ {t('tq.reject')}</button>
        </div>
      )}
      {o.status === 'accepted' && !o.fulfilled_at && (
        <div className="mt-2 space-y-2">
          {d.can_assign ? (
            <label className="block">
              <span className={ui.label}>👷 {t('so.assignTo')}</span>
              <select value={o.assigned_to ?? ''} disabled={busy === o.id} onChange={(e) => assign(o, e.target.value)} className={ui.input}>
                <option value="">{t('so.unassigned')}</option>
                {d.workers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </label>
          ) : o.assigned_name && <p className="text-sm">👷 {o.assigned_name}</p>}
          <button type="button" disabled={busy === o.id} onClick={() => done(o)} className={`${ui.btnPrimary} w-full !py-2 text-sm`}>📦 {t('so.markDone')}</button>
        </div>
      )}
      {o.status === 'rejected' && <p className="mt-1 text-xs font-semibold text-red-600 dark:text-red-400">✖ {t('tq.rejected')}{o.reject_reason ? `: ${o.reject_reason}` : ''}</p>}
      {o.fulfilled_at && <p className="mt-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">✓ {t('so.done')}{o.assigned_name ? ` · ${o.assigned_name}` : ''}</p>}
    </li>
  );

  return (
    <Card className={`space-y-4 ${pending.length > 0 ? 'border-2 !border-amber-400' : ''}`}>
      <h2 className="font-bold">🧾 {t('so.title')}{pending.length > 0 ? ` · ${pending.length} ${t('so.new')}` : ''}</h2>
      {pending.length > 0 && <ul className="space-y-3">{pending.map(card)}</ul>}
      {active.length > 0 && <div className="space-y-2"><p className={ui.label}>{t('so.inProgress')}</p><ul className="space-y-3">{active.map(card)}</ul></div>}
      {closed.length > 0 && <details><summary className={`cursor-pointer text-sm font-semibold ${ui.muted}`}>{t('so.closed')} ({closed.length})</summary><ul className="mt-2 space-y-3">{closed.map(card)}</ul></details>}
    </Card>
  );
}
