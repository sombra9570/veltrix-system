'use client';
import { useCallback, useEffect, useState } from 'react';
import { rpc } from '../../lib/supabase';
import { Card } from './shell';
import { ui } from '../site-header';
import { useSync } from './sync';
import { useT } from '../i18n';
import { money, shortTime } from './format';

type Flash = (ok: boolean, text: string) => void;
type Req = {
  id: string; at: string; customer: string; phone: string; address: string; reference: string | null; lat: number | null; lng: number | null;
  notes: string | null; pay_pref: 'qr' | 'cash'; zone: string | null; fee: number; eta_min: number | null; subtotal: number;
  items: { name: string; qty: number; notes: string | null }[];
};
type Del = {
  id: string; at: string; address: string; notes: string | null; status: 'pending' | 'dispatched' | 'delivered' | 'failed'; total: number; currency: string;
  paid: number; driver: string | null; mine: boolean; eta_min: number | null; items: { description: string; qty: number }[];
};
type Zone = { id: string; name: string; fee: number; free_over: number | null; eta_min: number; active: boolean };

const mapsLink = (lat: number | null, lng: number | null) => (lat != null && lng != null ? `https://maps.google.com/?q=${lat},${lng}` : null);

/** Pedidos de delivery que llegaron del link público: caja, recepción o administración los acepta o rechaza. */
export function DeliveryRequests({ branchId, currency, onChanged, flash }: {
  branchId: string; currency: string; onChanged?: () => Promise<void> | void; flash: Flash;
}) {
  const { t, lang } = useT();
  const [list, setList] = useState<Req[]>([]);
  const [busy, setBusy] = useState('');
  const fmt = (n: number) => money(Number(n), currency, lang);
  const load = useCallback(async () => {
    if (!branchId) return;
    try { setList(await rpc<Req[]>('delivery_requests_list', { p_branch: branchId }) ?? []); } catch { /* sin conexión o sin permiso */ }
  }, [branchId]);
  useEffect(() => { load(); }, [load]);
  useSync(load, 8_000);

  const accept = async (r: Req) => {
    setBusy(r.id);
    try {
      await rpc('delivery_request_resolve', { p_request: r.id, p_accept: true, p_reason: null });
      flash(true, t('dl.acceptedOk', { name: r.customer }));
      await load(); await onChanged?.();
    } catch (e) {
      flash(false, /PRODUCT|disponible|stock/i.test((e as Error).message) ? t('tq.errUnavailable') : t('err.generic'));
    }
    setBusy('');
  };
  const reject = async (r: Req) => {
    const reason = window.prompt(t('tq.rejectReason'));
    if (reason === null) return;
    setBusy(r.id);
    try { await rpc('delivery_request_resolve', { p_request: r.id, p_accept: false, p_reason: reason }); flash(true, t('tq.rejectedOk')); await load(); }
    catch { flash(false, t('err.generic')); }
    setBusy('');
  };

  if (list.length === 0) return null;
  return (
    <Card className="space-y-3 border-2 !border-amber-400">
      <h2 className="font-bold">🛵 {t('dl.pending')} · {list.length}</h2>
      <ul className="space-y-3">
        {list.map((r) => {
          const map = mapsLink(r.lat, r.lng);
          return (
            <li key={r.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
              <div className="flex items-start justify-between gap-2">
                <p className="font-extrabold">{r.customer} <a href={`tel:${r.phone}`} className="font-normal text-blue-600 dark:text-blue-400">· {r.phone}</a></p>
                <p className="font-extrabold">{fmt(r.subtotal + r.fee)}</p>
              </div>
              <p className="text-sm">📍 {r.address}{r.reference ? ` (${r.reference})` : ''} {map && <a href={map} target="_blank" rel="noreferrer" className="font-semibold text-blue-600 dark:text-blue-400">· {t('dl.map')}</a>}</p>
              <p className={`text-xs ${ui.muted}`}>{r.zone} · {r.fee > 0 ? `${t('dl.fee')} ${fmt(r.fee)}` : t('dl.free')}{r.eta_min ? ` · ~${r.eta_min} min` : ''}</p>
              <ul className="mt-1 text-sm">{r.items.map((i, k) => <li key={k}>{i.qty} × {i.name}{i.notes ? <span className={ui.muted}> — {i.notes}</span> : null}</li>)}</ul>
              {r.notes && <p className={`mt-1 text-sm ${ui.muted}`}>📝 {r.notes}</p>}
              <p className={`mt-1 text-xs ${ui.muted}`}>{r.pay_pref === 'qr' ? `📲 ${t('tq.prefQr')}` : `💵 ${t('tq.prefCash')}`}</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button type="button" disabled={busy === r.id} onClick={() => accept(r)} className={`${ui.btnPrimary} !py-2 text-sm`}>✅ {t('tq.accept')}</button>
                <button type="button" disabled={busy === r.id} onClick={() => reject(r)} className={`${ui.btnGhost} !py-2 text-sm`}>✖ {t('tq.reject')}</button>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** Entregas en curso: el repartidor toma un pedido, lo entrega y ve cuánto debe cobrar. */
export function DeliveryBoard({ branchId, currency, flash, showEmpty = false }: { branchId: string; currency: string; flash: Flash; showEmpty?: boolean }) {
  const { t, lang } = useT();
  const [tab, setTab] = useState<'live' | 'done'>('live');
  const [list, setList] = useState<Del[]>([]);
  const [busy, setBusy] = useState('');
  const fmt = (n: number) => money(Number(n), currency, lang);
  const load = useCallback(async () => {
    if (!branchId) return;
    try { setList(await rpc<Del[]>('delivery_orders_list', { p_branch: branchId, p_done: tab === 'done' }) ?? []); } catch { /* */ }
  }, [branchId, tab]);
  useEffect(() => { load(); }, [load]);
  useSync(load, 10_000);

  const setStatus = async (o: Del, st: 'dispatched' | 'delivered' | 'failed') => {
    setBusy(o.id);
    try { await rpc('delivery_set_status', { p_order: o.id, p_status: st }); await load(); }
    catch (e) { flash(false, /TAKEN/.test((e as Error).message) ? t('dl.taken') : t('err.generic')); await load(); }
    setBusy('');
  };

  if (!showEmpty && tab === 'live' && list.length === 0) return null;
  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-bold">🚚 {t('dl.board')}</h2>
        <div className="flex gap-1 text-xs font-bold">
          {(['live', 'done'] as const).map((k) => (
            <button key={k} type="button" onClick={() => setTab(k)} className={`rounded-full px-3 py-1 cursor-pointer ${tab === k ? 'bg-blue-600 text-white' : 'border border-slate-300 dark:border-slate-700'}`}>
              {k === 'live' ? t('dl.live') : t('dl.done')}
            </button>
          ))}
        </div>
      </div>
      {list.length === 0 && <p className={`text-sm ${ui.muted}`}>{t('dl.empty')}</p>}
      <ul className="space-y-3">
        {list.map((o) => {
          const due = Math.max(0, Number(o.total) - Number(o.paid));
          return (
            <li key={o.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-bold">📍 {o.address}</p>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${o.status === 'delivered' ? 'bg-emerald-100 text-emerald-800' : o.status === 'failed' ? 'bg-red-100 text-red-800' : o.status === 'dispatched' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'}`}>
                  {t(`dl.st.${o.status}` as never)}
                </span>
              </div>
              {o.notes && <p className={`text-xs ${ui.muted}`}>{o.notes}</p>}
              <ul className="mt-1 text-sm">{o.items.map((i, k) => <li key={k}>{i.qty} × {i.description}</li>)}</ul>
              <p className="mt-1 text-sm font-extrabold">{due > 0 ? `💵 ${t('dl.collect')}: ${fmt(due)}` : `✅ ${t('dl.paid')}`}</p>
              <p className={`text-xs ${ui.muted}`}>{shortTime(o.at, lang)}{o.eta_min ? ` · ~${o.eta_min} min` : ''}{o.driver ? ` · 🛵 ${o.driver}` : ''}</p>
              {o.status === 'pending' && (
                <button type="button" disabled={busy === o.id} onClick={() => setStatus(o, 'dispatched')} className={`${ui.btnPrimary} mt-2 w-full !py-2 text-sm`}>🛵 {t('dl.take')}</button>
              )}
              {o.status === 'dispatched' && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button type="button" disabled={busy === o.id} onClick={() => setStatus(o, 'delivered')} className={`${ui.btnPrimary} !py-2 text-sm`}>✅ {t('dl.delivered')}</button>
                  <button type="button" disabled={busy === o.id} onClick={() => setStatus(o, 'failed')} className={`${ui.btnGhost} !py-2 text-sm`}>❌ {t('dl.failed')}</button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** El administrador activa el delivery y define las zonas con su precio (o gratis). */
export function DeliverySetup({ branchId, flash }: { branchId: string; flash: Flash }) {
  const { t } = useT();
  const [enabled, setEnabled] = useState(false);
  const [zones, setZones] = useState<Zone[]>([]);
  const [f, setF] = useState({ name: '', fee: '', free_over: '', eta: '40' });

  const apply = (d: { enabled: boolean; zones: Zone[] }) => { setEnabled(!!d.enabled); setZones(d.zones ?? []); };
  const load = useCallback(async () => {
    try { apply(await rpc('delivery_admin', { p_branch: branchId, p_enabled: null, p_zone: null })); } catch { /* */ }
  }, [branchId]);
  useEffect(() => { load(); }, [load]);

  const toggle = async () => {
    try { apply(await rpc('delivery_admin', { p_branch: branchId, p_enabled: !enabled, p_zone: null })); } catch { flash(false, t('err.generic')); }
  };
  const save = async (z: Partial<Zone> & { name: string }) => {
    try { apply(await rpc('delivery_admin', { p_branch: branchId, p_enabled: null, p_zone: z })); return true; } catch { flash(false, t('err.generic')); return false; }
  };
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.name.trim()) return;
    const ok = await save({ name: f.name, fee: Number(f.fee) || 0, free_over: Number(f.free_over) || null, eta_min: parseInt(f.eta, 10) || 40, active: true });
    if (ok) setF({ name: '', fee: '', free_over: '', eta: '40' });
  };

  return (
    <Card className="space-y-3 lg:col-span-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-bold">🛵 {t('dl.setupTitle')}</h2>
        <button type="button" onClick={toggle} className={`rounded-full px-4 py-1.5 text-sm font-bold cursor-pointer ${enabled ? 'bg-emerald-600 text-white' : 'border border-slate-300 dark:border-slate-700'}`}>
          {enabled ? t('dl.on') : t('dl.off')}
        </button>
      </div>
      <p className={`text-xs ${ui.muted}`}>{t('dl.setupHint')}</p>
      <form onSubmit={add} className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={t('dl.zoneName')} className={`${ui.input} col-span-2`} />
        <input inputMode="decimal" value={f.fee} onChange={(e) => setF({ ...f, fee: e.target.value })} placeholder={t('dl.zoneFee')} className={ui.input} />
        <input inputMode="decimal" value={f.free_over} onChange={(e) => setF({ ...f, free_over: e.target.value })} placeholder={t('dl.zoneFreeOver')} className={ui.input} />
        <input inputMode="numeric" value={f.eta} onChange={(e) => setF({ ...f, eta: e.target.value })} placeholder={t('dl.zoneEta')} className={ui.input} />
        <button type="submit" className={`${ui.btnPrimary} col-span-2 sm:col-span-5`}>+ {t('dl.addZone')}</button>
      </form>
      <ul className="divide-y divide-slate-200 dark:divide-slate-800">
        {zones.map((z) => (
          <li key={z.id} className={`flex items-center gap-2 py-2 text-sm ${z.active ? '' : 'opacity-50'}`}>
            <span className="flex-1 font-semibold">{z.name} <span className={`font-normal ${ui.muted}`}>· {Number(z.fee) > 0 ? Number(z.fee).toFixed(2) : t('dl.free')}{z.free_over ? ` · ${t('dl.freeOver')} ${Number(z.free_over).toFixed(2)}` : ''} · ~{z.eta_min} min</span></span>
            <button type="button" onClick={() => save({ ...z, active: !z.active })} className={`${ui.btnGhost} !px-3 !py-1 text-xs`}>{z.active ? t('prod.hide') : t('prod.show')}</button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

type Br = { id: string; name: string; company: string; currency: string; enabled: boolean };

/** Pantalla del repartidor. */
export function DeliveryScreen() {
  const { t } = useT();
  const [branches, setBranches] = useState<Br[] | null>(null);
  const [branchId, setBranchId] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    rpc<Br[]>('delivery_branches').then((b) => { setBranches(b ?? []); if (b?.length) setBranchId(b[0].id); }).catch(() => setBranches([]));
  }, []);
  const flash: Flash = (ok, text) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 5000); };
  const br = branches?.find((b) => b.id === branchId);
  if (branches === null) return <p className={`text-sm ${ui.muted}`}>{t('common.wait')}</p>;
  if (branches.length === 0) return <Card><p className={`text-sm ${ui.muted}`}>{t('pos.noBranches')}</p></Card>;
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-extrabold">🚚 {t('dl.board')}</h1>
      {branches.length > 1 && (
        <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={ui.input}>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.company} · {b.name}</option>)}
        </select>
      )}
      {msg && <p className={`rounded-xl border p-3 text-sm font-semibold ${msg.ok ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-red-300 bg-red-50 text-red-700'}`}>{msg.text}</p>}
      <DeliveryBoard branchId={branchId} currency={br?.currency ?? 'USD'} flash={flash} showEmpty />
    </div>
  );
}
