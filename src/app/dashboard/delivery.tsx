'use client';
import { useCallback, useEffect, useState } from 'react';
import { rpc } from '../../lib/supabase';
import { Card } from './shell';
import { ui } from '../site-header';
import { useSync } from './sync';
import { useT } from '../i18n';
import { money, shortTime, parseAmount } from './format';
import { DeliveryMap, directionsUrl, type MapPoint } from './delivery-map';
import { uploadSaleFile, useSignedUrls } from './sale-files';
import { compressImage } from './image';
import { PhotoPicker } from './photo-picker';
import { QrRequests } from './table-qr';
import Link from 'next/link';

type Flash = (ok: boolean, text: string) => void;
type Req = {
  id: string; at: string; customer: string; phone: string; address: string; reference: string | null; lat: number | null; lng: number | null;
  notes: string | null; pay_pref: 'qr' | 'cash'; zone: string | null; fee: number; eta_min: number | null; subtotal: number;
  items: { name: string; qty: number; notes: string | null }[];
};
type Del = {
  id: string; at: string; address: string; notes: string | null; status: 'pending' | 'dispatched' | 'delivered' | 'failed'; total: number; currency: string;
  paid: number; driver: string | null; mine: boolean; eta_min: number | null; items: { description: string; qty: number }[];
  lat: number | null; lng: number | null; phone: string | null; customer: string | null;
  cash_mode: 'none' | 'fee' | 'full'; expected: number; collected: { amount: number; status: 'with_driver' | 'received' } | null;
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
export function DeliveryBoard({ branchId, currency, flash, showEmpty = false, driver = false }: { branchId: string; currency: string; flash: Flash; showEmpty?: boolean; driver?: boolean }) {
  const { t, lang } = useT();
  const [tab, setTab] = useState<'live' | 'done'>('live');
  const [list, setList] = useState<Del[]>([]);
  const [busy, setBusy] = useState('');
  const [showMap, setShowMap] = useState(false);
  const fmt = (n: number) => money(Number(n), currency, lang);
  const load = useCallback(async () => {
    if (!branchId) return;
    try { setList(await rpc<Del[]>('delivery_orders_list', { p_branch: branchId, p_done: tab === 'done' }) ?? []); } catch { /* */ }
  }, [branchId, tab]);
  useEffect(() => { load(); }, [load]);
  useSync(load, 10_000);

  const setStatus = async (o: Del, st: 'dispatched' | 'delivered' | 'failed') => {
    let collected: number | null = null;
    if (st === 'delivered' && o.cash_mode !== 'none' && Number(o.expected) > 0) {
      const ans = window.prompt(t('dl.cashAsk'), String(Number(o.expected)));
      if (ans === null) return;
      const n = parseAmount(ans);
      collected = Number.isFinite(n) && n > 0 ? n : 0;
    }
    setBusy(o.id);
    try { await rpc('delivery_set_status', { p_order: o.id, p_status: st, p_collected: collected }); await load(); }
    catch (e) {
      const m = (e as Error).message;
      flash(false, /TAKEN/.test(m) ? t('dl.taken') : /OVER_LIMIT/.test(m) ? t('cash.exceeds') : t('err.generic'));
      await load();
    }
    setBusy('');
  };
  const pts: MapPoint[] = list.filter((o) => o.lat != null && o.lng != null && o.status !== 'delivered' && o.status !== 'failed')
    .map((o) => ({ lat: Number(o.lat), lng: Number(o.lng), label: o.address, icon: o.status === 'dispatched' ? '🛵' : '📍' }));

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
      {driver && (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setShowMap((v) => !v)} className={`${ui.btnGhost} !py-1.5 text-sm`}>🗺️ {t('dl.mapTitle')}</button>
          <Link href="/dashboard/collector/mensajes" className={`${ui.btnGhost} !py-1.5 text-sm`}>💬 {t('dl.msgCo')}</Link>
        </div>
      )}
      {driver && showMap && <DeliveryMap points={pts} />}
      {list.length === 0 && <p className={`text-sm ${ui.muted}`}>{t('dl.empty')}</p>}
      <ul className="space-y-3">
        {list.map((o) => {
          const due = o.cash_mode === 'none' ? 0 : Number(o.expected);
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
              {(o.customer || o.phone) && <p className="mt-1 text-sm">{o.customer}{o.phone && <a href={`tel:${o.phone}`} className="font-semibold text-blue-600 dark:text-blue-400"> · 📞 {o.phone}</a>}</p>}
              {o.lat != null && o.lng != null && (
                <a href={directionsUrl(Number(o.lat), Number(o.lng))} target="_blank" rel="noreferrer" className="mt-1 inline-block text-sm font-semibold text-blue-600 dark:text-blue-400">🧭 {t('dl.how')}</a>
              )}
              {o.collected ? (
                <p className="mt-1 text-sm font-extrabold">💵 {fmt(Number(o.collected.amount))} · {o.collected.status === 'received' ? `✅ ${t('dl.cashOk')}` : t('dl.cashWith')}</p>
              ) : (
                <p className="mt-1 text-sm font-extrabold">{due > 0 ? `💵 ${t('dl.collect')}: ${fmt(due)}` : o.cash_mode !== 'none' && Number(o.total) - Number(o.paid) <= 0 ? `✅ ${t('dl.paid')}` : ''}</p>
              )}
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
  const [cashMode, setCashMode] = useState<'none' | 'fee' | 'full'>('none');
  const [zones, setZones] = useState<Zone[]>([]);
  const [f, setF] = useState({ name: '', fee: '', free_over: '', eta: '40' });

  const apply = (d: { enabled: boolean; cash_mode?: 'none' | 'fee' | 'full'; zones: Zone[] }) => { setEnabled(!!d.enabled); setCashMode(d.cash_mode ?? 'none'); setZones(d.zones ?? []); };
  const load = useCallback(async () => {
    try { apply(await rpc('delivery_admin', { p_branch: branchId, p_enabled: null, p_zone: null })); } catch { /* */ }
  }, [branchId]);
  useEffect(() => { load(); }, [load]);

  const toggle = async () => {
    try { apply(await rpc('delivery_admin', { p_branch: branchId, p_enabled: !enabled, p_zone: null })); } catch { flash(false, t('err.generic')); }
  };
  const changeMode = async (m: 'none' | 'fee' | 'full') => {
    try { apply(await rpc('delivery_admin', { p_branch: branchId, p_enabled: null, p_zone: null, p_cash_mode: m })); } catch { flash(false, t('err.generic')); }
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
      <label className="block text-sm font-semibold">{t('dl.cashMode')}
        <select value={cashMode} onChange={(e) => changeMode(e.target.value as 'none' | 'fee' | 'full')} className={`${ui.input} mt-1`}>
          <option value="none">{t('dl.cashNone')}</option>
          <option value="fee">{t('dl.cashFee')}</option>
          <option value="full">{t('dl.cashFull')}</option>
        </select>
      </label>
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

type Br = { id: string; name: string; company: string; currency: string; enabled: boolean; org_id: string; cash_mode: string };

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
      <DeliveryBoard branchId={branchId} currency={br?.currency ?? 'USD'} flash={flash} showEmpty driver />
      <CourierBoard branchId={branchId} orgId={br?.org_id ?? ''} currency={br?.currency ?? 'USD'} flash={flash} />
    </div>
  );
}

/** Caja / recepción: recibe el efectivo que declararon los repartidores. */
export function CashReceive({ branchId, currency, flash, onChanged }: { branchId: string; currency: string; flash: Flash; onChanged?: () => void }) {
  const { t, lang } = useT();
  type Row = { order_id: string; amount: number; at: string; driver: string | null; address: string };
  const [list, setList] = useState<Row[]>([]);
  const [val, setVal] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const fmt = (n: number) => money(Number(n), currency, lang);
  const load = useCallback(async () => {
    if (!branchId) return;
    try { setList(await rpc<Row[]>('delivery_cash_list', { p_branch: branchId }) ?? []); } catch { /* */ }
  }, [branchId]);
  useEffect(() => { load(); }, [load]);
  useSync(load, 10_000);
  const receive = async (r: Row) => {
    const n = parseAmount(val[r.order_id] ?? String(r.amount));
    if (!Number.isFinite(n) || n < 0) return;
    setBusy(r.order_id);
    try { await rpc('delivery_cash_receive', { p_order: r.order_id, p_counted: n }); flash(true, t('dl.cashOk')); await load(); onChanged?.(); }
    catch (e) { flash(false, /SHIFT_REQUIRED/.test((e as Error).message) ? t('dl.cashShift') : t('err.generic')); }
    setBusy('');
  };
  if (list.length === 0) return null;
  return (
    <Card className="space-y-3 border-2 !border-emerald-400">
      <h2 className="font-bold">💵 {t('dl.cashPending')} · {list.length}</h2>
      <ul className="space-y-2">
        {list.map((r) => (
          <li key={r.order_id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
            <p className="text-sm font-bold">🛵 {r.driver ?? '—'} · {fmt(r.amount)}</p>
            <p className={`text-xs ${ui.muted}`}>📍 {r.address} · {shortTime(r.at, lang)}</p>
            <div className="mt-2 flex gap-2">
              <input inputMode="decimal" value={val[r.order_id] ?? String(r.amount)} onChange={(e) => setVal({ ...val, [r.order_id]: e.target.value })} aria-label={t('dl.cashCount')} className={`${ui.input} flex-1`} />
              <button type="button" disabled={busy === r.order_id} onClick={() => receive(r)} className={`${ui.btnPrimary} !py-2 text-sm`}>✅ {t('dl.cashReceive')}</button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Bandeja de caja/recepción: pedidos por QR de mesa, pedidos de delivery y efectivo de repartidores. */
export function RestaurantInbox() {
  const { t } = useT();
  const [branches, setBranches] = useState<Br[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { rpc<Br[]>('delivery_branches').then((b) => setBranches(b ?? [])).catch(() => setBranches([])); }, []);
  const flash: Flash = (ok, text) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 5000); };
  return (
    <div className="space-y-3">
      {msg && <p className={`rounded-xl border p-3 text-sm font-semibold ${msg.ok ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-red-300 bg-red-50 text-red-700'}`}>{msg.text}</p>}
      {branches.map((b) => (
        <div key={b.id} className="space-y-3" aria-label={`${t('dl.board')} ${b.name}`}>
          <QrRequests branchId={b.id} currency={b.currency} onChanged={() => {}} flash={flash} />
          {b.enabled && <DeliveryRequests branchId={b.id} currency={b.currency} flash={flash} />}
          <CashReceive branchId={b.id} currency={b.currency} flash={flash} />
        </div>
      ))}
    </div>
  );
}

type Task = {
  id: string; kind: 'purchase' | 'document' | 'errand'; title: string; details: string | null; status: 'open' | 'taken' | 'done' | 'cancelled'; budget: number;
  pickup_address: string | null; pickup_lat: number | null; pickup_lng: number | null; drop_address: string | null; drop_lat: number | null; drop_lng: number | null;
  driver: string | null; mine: boolean; at: string; spent: number | null; returned: number | null; receipt: string | null; note: string | null;
};
const KIND_ICON = { purchase: '🛒', document: '📄', errand: '📦' } as const;

/** Busca coordenadas de una dirección con OpenStreetMap (si falla, el encargo se crea igual, sin punto en el mapa). */
async function geocode(q: string): Promise<{ lat: number; lng: number } | null> {
  if (!q.trim()) return null;
  try {
    const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 4000);
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`, { signal: ctl.signal });
    clearTimeout(tm);
    const j = await r.json();
    return j?.[0] ? { lat: Number(j[0].lat), lng: Number(j[0].lon) } : null;
  } catch { return null; }
}

/** Encargos: compras para la empresa, entrega de documentos y recados. La empresa los crea; el repartidor los toma y reporta gasto y recibo. */
export function CourierBoard({ branchId, orgId, currency, flash, manager = false }: { branchId: string; orgId: string; currency: string; flash: Flash; manager?: boolean }) {
  const { t, lang } = useT();
  const [tab, setTab] = useState<'live' | 'done'>('live');
  const [list, setList] = useState<Task[]>([]);
  const [busy, setBusy] = useState('');
  const [open, setOpen] = useState('');
  const [showMap, setShowMap] = useState(false);
  const [f, setF] = useState({ kind: 'purchase', title: '', details: '', pickup: '', drop: '', budget: '' });
  const [fin, setFin] = useState({ spent: '', returned: '', note: '' });
  const [photo, setPhoto] = useState<File | null>(null);
  const fmt = (n: number) => money(Number(n), currency, lang);
  const load = useCallback(async () => {
    if (!branchId) return;
    try { setList(await rpc<Task[]>('courier_tasks_list', { p_branch: branchId, p_done: tab === 'done' }) ?? []); } catch { /* */ }
  }, [branchId, tab]);
  useEffect(() => { load(); }, [load]);
  useSync(load, 12_000);
  const urls = useSignedUrls(list.map((x) => x.receipt).filter((x): x is string => !!x));

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.title.trim()) return;
    setBusy('new');
    try {
      const [p, d] = await Promise.all([geocode(f.pickup), geocode(f.drop)]);
      await rpc('courier_task_save', { p_branch: branchId, p_task: {
        kind: f.kind, title: f.title, details: f.details, pickup_address: f.pickup, drop_address: f.drop, budget: parseAmount(f.budget) || 0,
        pickup_lat: p?.lat ?? null, pickup_lng: p?.lng ?? null, drop_lat: d?.lat ?? null, drop_lng: d?.lng ?? null,
      } });
      setF({ kind: 'purchase', title: '', details: '', pickup: '', drop: '', budget: '' });
      await load();
    } catch { flash(false, t('err.generic')); }
    setBusy('');
  };
  const act = async (x: Task, action: 'take' | 'cancel') => {
    setBusy(x.id);
    try { await rpc('courier_task_set', { p_task: x.id, p_action: action, p_data: null }); await load(); }
    catch (e) { flash(false, /TAKEN/.test((e as Error).message) ? t('cr.taken') : t('err.generic')); await load(); }
    setBusy('');
  };
  const finish = async (x: Task) => {
    setBusy(x.id);
    try {
      const path = photo ? await uploadSaleFile(orgId, branchId, 'task', await compressImage(photo)) : null;
      await rpc('courier_task_set', { p_task: x.id, p_action: 'done', p_data: { spent: parseAmount(fin.spent) || 0, returned: parseAmount(fin.returned) || 0, note: fin.note, receipt_path: path } });
      setOpen(''); setFin({ spent: '', returned: '', note: '' }); setPhoto(null); await load();
    } catch { flash(false, t('err.generic')); }
    setBusy('');
  };

  const pts: MapPoint[] = list.filter((x) => x.status !== 'done' && x.status !== 'cancelled').flatMap((x) => [
    ...(x.pickup_lat != null && x.pickup_lng != null ? [{ lat: Number(x.pickup_lat), lng: Number(x.pickup_lng), label: `${x.title} · ${x.pickup_address ?? ''}`, icon: '🏪' }] : []),
    ...(x.drop_lat != null && x.drop_lng != null ? [{ lat: Number(x.drop_lat), lng: Number(x.drop_lng), label: `${x.title} · ${x.drop_address ?? ''}`, icon: '📍' }] : []),
  ]);

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-bold">📦 {t('cr.title')}</h2>
        <div className="flex gap-1 text-xs font-bold">
          {(['live', 'done'] as const).map((k) => (
            <button key={k} type="button" onClick={() => setTab(k)} className={`rounded-full px-3 py-1 cursor-pointer ${tab === k ? 'bg-blue-600 text-white' : 'border border-slate-300 dark:border-slate-700'}`}>
              {k === 'live' ? t('dl.live') : t('dl.done')}
            </button>
          ))}
        </div>
      </div>
      {manager && (
        <form onSubmit={create} className="grid grid-cols-2 gap-2 rounded-xl border border-dashed border-slate-300 p-3 dark:border-slate-700">
          <p className="col-span-2 text-sm font-bold">+ {t('cr.new')}</p>
          <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} className={ui.input}>
            {(['purchase', 'document', 'errand'] as const).map((k) => <option key={k} value={k}>{KIND_ICON[k]} {t(`cr.k.${k}` as never)}</option>)}
          </select>
          <input inputMode="decimal" value={f.budget} onChange={(e) => setF({ ...f, budget: e.target.value })} placeholder={t('cr.budget')} className={ui.input} />
          <input required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder={t('cr.name')} className={`${ui.input} col-span-2`} />
          <input value={f.pickup} onChange={(e) => setF({ ...f, pickup: e.target.value })} placeholder={t('cr.pickup')} className={`${ui.input} col-span-2`} />
          <input value={f.drop} onChange={(e) => setF({ ...f, drop: e.target.value })} placeholder={t('cr.drop')} className={`${ui.input} col-span-2`} />
          <input value={f.details} onChange={(e) => setF({ ...f, details: e.target.value })} placeholder={t('cr.note')} className={`${ui.input} col-span-2`} />
          <button type="submit" disabled={busy === 'new'} className={`${ui.btnPrimary} col-span-2`}>{t('cr.create')}</button>
        </form>
      )}
      {!manager && (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setShowMap((v) => !v)} className={`${ui.btnGhost} !py-1.5 text-sm`}>🗺️ {t('dl.mapTitle')}</button>
        </div>
      )}
      {!manager && showMap && <DeliveryMap points={pts} />}
      {list.length === 0 && <p className={`text-sm ${ui.muted}`}>{t('cr.empty')}</p>}
      <ul className="space-y-3">
        {list.map((x) => (
          <li key={x.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-extrabold">{KIND_ICON[x.kind]} {x.title}</p>
              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700">{t(`cr.st.${x.status}` as never)}</span>
            </div>
            {x.details && <p className={`text-xs ${ui.muted}`}>{x.details}</p>}
            {x.pickup_address && <p className="text-sm">🏪 {x.pickup_address}{x.pickup_lat != null && x.pickup_lng != null && <a href={directionsUrl(Number(x.pickup_lat), Number(x.pickup_lng))} target="_blank" rel="noreferrer" className="font-semibold text-blue-600 dark:text-blue-400"> · 🧭 {t('dl.how')}</a>}</p>}
            {x.drop_address && <p className="text-sm">📍 {x.drop_address}{x.drop_lat != null && x.drop_lng != null && <a href={directionsUrl(Number(x.drop_lat), Number(x.drop_lng))} target="_blank" rel="noreferrer" className="font-semibold text-blue-600 dark:text-blue-400"> · 🧭 {t('dl.how')}</a>}</p>}
            {Number(x.budget) > 0 && <p className="text-sm font-bold">💰 {t('cr.budget')}: {fmt(Number(x.budget))}</p>}
            <p className={`text-xs ${ui.muted}`}>{shortTime(x.at, lang)}{x.driver ? ` · 🛵 ${x.driver}` : ''}</p>
            {x.status === 'done' && (
              <p className="mt-1 text-sm">{t('cr.spent')}: <b>{fmt(Number(x.spent ?? 0))}</b> · {t('cr.returned')}: <b>{fmt(Number(x.returned ?? 0))}</b>{x.note ? ` · ${x.note}` : ''}</p>
            )}
            {x.receipt && urls[x.receipt] && (
              // eslint-disable-next-line @next/next/no-img-element
              <a href={urls[x.receipt]} target="_blank" rel="noreferrer"><img src={urls[x.receipt]} alt={t('cr.receipt')} className="mt-2 max-h-40 rounded-lg border border-slate-200 dark:border-slate-700" /></a>
            )}
            {x.status === 'open' && !manager && (
              <button type="button" disabled={busy === x.id} onClick={() => act(x, 'take')} className={`${ui.btnPrimary} mt-2 w-full !py-2 text-sm`}>🛵 {t('cr.take')}</button>
            )}
            {x.status === 'taken' && x.mine && open !== x.id && (
              <button type="button" onClick={() => setOpen(x.id)} className={`${ui.btnPrimary} mt-2 w-full !py-2 text-sm`}>✅ {t('cr.done')}</button>
            )}
            {x.status === 'taken' && x.mine && open === x.id && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <input inputMode="decimal" value={fin.spent} onChange={(e) => setFin({ ...fin, spent: e.target.value })} placeholder={t('cr.spent')} className={ui.input} />
                <input inputMode="decimal" value={fin.returned} onChange={(e) => setFin({ ...fin, returned: e.target.value })} placeholder={t('cr.returned')} className={ui.input} />
                <input value={fin.note} onChange={(e) => setFin({ ...fin, note: e.target.value })} placeholder={t('cr.note')} className={`${ui.input} col-span-2`} />
                <div className="col-span-2"><p className={`mb-1 text-xs ${ui.muted}`}>{t('cr.receipt')}</p><PhotoPicker value={photo} onChange={setPhoto} disabled={busy === x.id} /></div>
                <button type="button" disabled={busy === x.id} onClick={() => finish(x)} className={`${ui.btnPrimary} col-span-2 !py-2 text-sm`}>✅ {t('cr.done')}</button>
              </div>
            )}
            {manager && (x.status === 'open' || x.status === 'taken') && (
              <button type="button" disabled={busy === x.id} onClick={() => act(x, 'cancel')} className={`${ui.btnGhost} mt-2 w-full !py-1.5 text-xs`}>✖ {t('cr.cancel')}</button>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
