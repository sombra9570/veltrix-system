'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { rpc } from '../../lib/supabase';
import { Card } from './shell';
import { ui } from '../site-header';
import { useT } from '../i18n';
import type { DictKey } from '../i18n/es';
import { money, parseAmount } from './format';
import { WorkshopFiles } from './sale-files';
import { IconClose } from '../icons';

type Branch = { id: string; name: string; currency: string };
type Status = 'received' | 'diagnosing' | 'waiting_approval' | 'waiting_parts' | 'in_progress' | 'done' | 'delivered' | 'cancelled';
type WO = {
  id: string; status: Status; problem: string; received_at: string; promised_at: string | null;
  customer: string; phone: string | null; asset: string; kind: string | null; technician: string | null;
  total: number; invoiced: boolean; paid: boolean;
};
type Board = { technicians: { id: string; name: string }[]; orders: WO[] };
type Detail = {
  id: string; status: Status; problem: string; diagnosis: string | null; received_at: string; promised_at: string | null;
  technician_id: string | null; currency: string; invoiced: boolean; total: number; paid: boolean;
  customer: { name: string; phone: string | null };
  asset: { kind: string; brand: string | null; model: string | null; identifier: string | null } | null;
  lines: { id: string; kind: string; description: string; qty: number; price: number; total: number }[];
};
type Product = { id: string; name: string; price: number; stock: number | null; type: string };

const STATUSES: Status[] = ['received', 'diagnosing', 'waiting_approval', 'waiting_parts', 'in_progress', 'done', 'delivered', 'cancelled'];
const KINDS = ['vehicle', 'motorcycle', 'equipment', 'device', 'other'] as const;
const okBox = 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300';
const errBox = 'border-red-300 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400';
const pill: Record<Status, string> = {
  received: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  diagnosing: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300',
  waiting_approval: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
  waiting_parts: 'bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-300',
  in_progress: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300',
  done: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
  delivered: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  cancelled: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300',
};

function woError(msg: string, t: (k: DictKey) => string) {
  if (/facturada/i.test(msg)) return t('shop.alreadyInvoiced');
  if (/factura|confirma/i.test(msg)) return t('shop.invoiceFirst');
  if (/suspendida/i.test(msg)) return t('err.suspended');
  return t('err.generic');
}

/** Taller: órdenes de trabajo. Lo usan el técnico y el dueño. */
export function WorkshopScreen() {
  const { t, lang } = useT();
  const [branches, setBranches] = useState<Branch[] | null>(null);
  const [branchId, setBranchId] = useState('');
  const [board, setBoard] = useState<Board | null>(null);
  const [filter, setFilter] = useState<'open' | Status>('open');
  const [detail, setDetail] = useState<Detail | null>(null);
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    rpc<Branch[]>('seller_branches').then((b) => { setBranches(b ?? []); if (b?.length) setBranchId(b[0].id); }).catch(() => setBranches([]));
  }, []);
  const branch = branches?.find((b) => b.id === branchId);
  const fmt = (n: number, cur?: string) => money(Number(n), cur ?? branch?.currency ?? 'USD', lang);
  const flash = (ok: boolean, text: string) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 5000); };

  const load = useCallback(async () => {
    if (!branchId) return;
    try { setBoard(await rpc<Board>('workshop_board', { p_branch: branchId })); } catch { /* */ }
  }, [branchId]);
  useEffect(() => { load(); }, [load]);

  const open = async (id: string) => {
    try { setDetail(await rpc<Detail>('wo_detail', { p_wo: id })); setCreating(false); } catch { flash(false, t('err.generic')); }
  };

  const orders = useMemo(() => (board?.orders ?? []).filter((o) =>
    filter === 'open' ? !['delivered', 'cancelled'].includes(o.status) : o.status === filter), [board, filter]);

  if (branches === null) return <p className={`text-sm ${ui.muted}`}>{t('common.wait')}</p>;
  if (branches.length === 0) return <Card><p className={`text-sm ${ui.muted}`}>{t('pos.noBranches')}</p></Card>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-extrabold sm:text-2xl">🔧 {t('shop.title')}</h1>
          <p className={`text-sm ${ui.muted}`}>{t('shop.subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2 max-sm:w-full">
          {branches.length > 1 && (
            <select value={branchId} onChange={(e) => { setBranchId(e.target.value); setDetail(null); }} className={`${ui.input} !w-auto max-sm:!w-full`}>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
          <button type="button" onClick={() => { setCreating(true); setDetail(null); }} className={`${ui.btnPrimary} max-sm:w-full`}>+ {t('shop.new')}</button>
        </div>
      </div>

      {msg && <p className={`rounded-xl border p-3 text-sm font-semibold ${msg.ok ? okBox : errBox}`}>{msg.text}</p>}

      {creating && board && (
        <NewOrder branchId={branchId} technicians={board.technicians} onCancel={() => setCreating(false)}
          onCreated={async (id) => { flash(true, t('shop.created')); await load(); await open(id); }} flash={flash} />
      )}

      {/* Filtro por estado */}
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex w-max gap-2">
          {(['open', ...STATUSES] as const).map((s) => {
            const n = s === 'open' ? (board?.orders ?? []).filter((o) => !['delivered', 'cancelled'].includes(o.status)).length
              : (board?.orders ?? []).filter((o) => o.status === s).length;
            return (
              <button key={s} type="button" onClick={() => setFilter(s)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition cursor-pointer ${filter === s ? 'bg-blue-600 text-white' : 'border border-slate-300 dark:border-slate-700'}`}>
                {s === 'open' ? t('shop.open') : t(`shop.s.${s}` as DictKey)} · {n}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        <ul className={`min-w-0 space-y-2 lg:col-span-2 ${detail ? 'max-lg:hidden' : ''}`}>
          {orders.length === 0 && <Card><p className={`text-sm ${ui.muted}`}>{t('shop.empty')}</p></Card>}
          {orders.map((o) => (
            <li key={o.id}>
              <button type="button" onClick={() => open(o.id)}
                className={`w-full rounded-2xl p-4 text-left transition cursor-pointer ${ui.card} ${detail?.id === o.id ? 'ring-2 ring-blue-500' : 'hover:border-blue-400'}`}>
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 truncate font-bold">{o.asset || o.customer}</p>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${pill[o.status]}`}>{t(`shop.s.${o.status}` as DictKey)}</span>
                </div>
                <p className={`truncate text-xs ${ui.muted}`}>{o.customer} · {o.problem}</p>
                <div className="mt-1 flex items-center justify-between text-xs">
                  <span className={ui.muted}>🔧 {o.technician ?? t('shop.unassigned')}</span>
                  <span className="font-bold">{fmt(o.total)} {o.paid ? '✅' : o.invoiced ? '🧾' : ''}</span>
                </div>
              </button>
            </li>
          ))}
        </ul>

        {detail && board && (
          <div className="min-w-0 lg:col-span-3">
            <OrderDetail d={detail} technicians={board.technicians} branchId={branchId} fmt={(n) => fmt(n, detail.currency)}
              onClose={() => setDetail(null)}
              onChanged={async () => { await open(detail.id); await load(); }} flash={flash} />
          </div>
        )}
      </div>
    </div>
  );
}

function NewOrder({ branchId, technicians, onCancel, onCreated, flash }: {
  branchId: string; technicians: { id: string; name: string }[];
  onCancel: () => void; onCreated: (id: string) => Promise<void>; flash: (ok: boolean, text: string) => void;
}) {
  const { t } = useT();
  const [f, setF] = useState({ name: '', phone: '', kind: 'vehicle', brand: '', model: '', identifier: '', problem: '', tech: '', promised: '' });
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const id = await rpc<string>('wo_create', {
        p_branch: branchId, p_customer: null, p_customer_name: f.name, p_customer_phone: f.phone,
        p_kind: f.kind, p_brand: f.brand, p_model: f.model, p_identifier: f.identifier, p_problem: f.problem,
        p_technician: f.tech || null, p_promised_at: f.promised ? new Date(f.promised).toISOString() : null,
      });
      await onCreated(id);
    } catch (err) { flash(false, woError((err as Error).message, t)); } finally { setBusy(false); }
  };
  return (
    <Card>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <h2 className="font-bold sm:col-span-2">{t('shop.new')}</h2>
        <div><label className={ui.label}>{t('cust.name')}</label><input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={ui.input} /></div>
        <div><label className={ui.label}>{t('cust.phone')}</label><input type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} className={ui.input} /></div>
        <div>
          <label className={ui.label}>{t('shop.kind')}</label>
          <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} className={ui.input}>
            {KINDS.map((k) => <option key={k} value={k}>{t(`shop.k.${k}` as DictKey)}</option>)}
          </select>
        </div>
        <div><label className={ui.label}>{t('shop.identifier')}</label><input value={f.identifier} onChange={(e) => setF({ ...f, identifier: e.target.value })} className={ui.input} /></div>
        <div><label className={ui.label}>{t('shop.brand')}</label><input value={f.brand} onChange={(e) => setF({ ...f, brand: e.target.value })} className={ui.input} /></div>
        <div><label className={ui.label}>{t('shop.model')}</label><input value={f.model} onChange={(e) => setF({ ...f, model: e.target.value })} className={ui.input} /></div>
        <div className="sm:col-span-2"><label className={ui.label}>{t('shop.problem')}</label><textarea required rows={2} value={f.problem} onChange={(e) => setF({ ...f, problem: e.target.value })} className={ui.input} /></div>
        <div>
          <label className={ui.label}>{t('shop.technician')}</label>
          <select value={f.tech} onChange={(e) => setF({ ...f, tech: e.target.value })} className={ui.input}>
            <option value="">{t('shop.unassigned')}</option>
            {technicians.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </div>
        <div><label className={ui.label}>{t('shop.promised')}</label><input type="datetime-local" value={f.promised} onChange={(e) => setF({ ...f, promised: e.target.value })} className={ui.input} /></div>
        <div className="flex gap-2 sm:col-span-2 sm:justify-end">
          <button type="button" onClick={onCancel} className={`${ui.btnGhost} max-sm:flex-1`}>{t('prod.cancel')}</button>
          <button type="submit" disabled={busy} className={`${ui.btnPrimary} max-sm:flex-1`}>{busy ? t('common.wait') : t('shop.create')}</button>
        </div>
      </form>
    </Card>
  );
}

function OrderDetail({ d, technicians, branchId, fmt, onClose, onChanged, flash }: {
  d: Detail; technicians: { id: string; name: string }[]; branchId: string; fmt: (n: number) => string;
  onClose: () => void; onChanged: () => Promise<void>; flash: (ok: boolean, text: string) => void;
}) {
  const { t, lang } = useT();
  const [status, setStatus] = useState<Status>(d.status);
  const [diag, setDiag] = useState(d.diagnosis ?? '');
  const [tech, setTech] = useState(d.technician_id ?? '');
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [part, setPart] = useState('');
  const [partQty, setPartQty] = useState('1');
  const [labor, setLabor] = useState('');
  const [laborPrice, setLaborPrice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { setStatus(d.status); setDiag(d.diagnosis ?? ''); setTech(d.technician_id ?? ''); }, [d]);
  useEffect(() => {
    rpc<Product[]>('pos_catalog', { p_branch: branchId }).then((c) => setCatalog(c ?? [])).catch(() => setCatalog([]));
  }, [branchId]);

  const call = async (fn: string, args: Record<string, unknown>, ok?: string) => {
    setBusy(true);
    try { await rpc(fn, args); if (ok) flash(true, ok); await onChanged(); }
    catch (err) { flash(false, woError((err as Error).message, t)); }
    finally { setBusy(false); }
  };

  const a = d.asset;
  // Estado de la orden por WhatsApp al cliente: vehículo/equipo, estado, diagnóstico, detalle y total
  const waText = () => {
    const L: string[] = [];
    const what = a ? [t(`shop.k.${a.kind}` as DictKey), a.brand, a.model, a.identifier].filter(Boolean).join(' · ') : '';
    L.push(`*${t('shop.waTitle')}* · ${t('rc.no')} ${d.id.slice(0, 8).toUpperCase()}`);
    L.push(t('shop.waHello', { name: d.customer.name }));
    if (what) L.push(`🔧 ${what}`);
    L.push(`📌 ${t('shop.status')}: *${t(`shop.s.${d.status}` as DictKey)}*`);
    if (d.diagnosis) L.push(`📝 ${t('shop.diagnosis')}: ${d.diagnosis}`);
    if (d.lines.length) {
      L.push('');
      for (const l of d.lines) L.push(`${Number(l.qty)} × ${l.description} — ${fmt(l.total)}`);
      L.push(`*${t('rc.total')}: ${fmt(d.total)}*`);
    }
    if (d.promised_at && !['done', 'delivered', 'cancelled'].includes(d.status)) {
      L.push(`📅 ${t('shop.promisedAt', { date: new Date(d.promised_at).toLocaleString(lang, { dateStyle: 'short', timeStyle: 'short' }) })}`);
    }
    if (d.status === 'done') L.push(`✅ ${t('shop.waReady')}`);
    if (d.status === 'waiting_approval') L.push(`❓ ${t('shop.waApprove')}`);
    return L.join('\n');
  };
  const sendWa = () => {
    const phone = (d.customer.phone ?? '').replace(/\D/g, '');
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(waText())}`, '_blank', 'noopener');
  };
  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-extrabold">{a ? [a.brand, a.model].filter(Boolean).join(' ') || t(`shop.k.${a.kind}` as DictKey) : d.customer.name}</h2>
            {a?.identifier && <p className="font-mono text-sm font-bold">{a.identifier}</p>}
            <p className={`text-sm ${ui.muted}`}>{d.customer.name}{d.customer.phone ? ` · ${d.customer.phone}` : ''}</p>
          </div>
          <div className="flex shrink-0 gap-2">
            {d.customer.phone && <a href={`tel:${d.customer.phone}`} className={`${ui.btnGhost} !px-3 !py-1.5 text-xs`}>📞</a>}
            <button type="button" onClick={sendWa} title={t('shop.waSend')} aria-label={t('shop.waSend')} className={`${ui.btnGhost} !px-3 !py-1.5 text-xs`}>💬</button>
            <button type="button" onClick={onClose} aria-label={t('pos.close')} className="grid h-8 w-8 place-items-center rounded-lg border border-slate-300 cursor-pointer dark:border-slate-700"><IconClose /></button>
          </div>
        </div>
        <p className="text-sm"><b>{t('shop.problem')}:</b> {d.problem}</p>
        <p className={`text-xs ${ui.muted}`}>
          {t('shop.receivedAt', { date: new Date(d.received_at).toLocaleString(lang, { dateStyle: 'short', timeStyle: 'short' }) })}
          {d.promised_at ? ` · ${t('shop.promisedAt', { date: new Date(d.promised_at).toLocaleString(lang, { dateStyle: 'short', timeStyle: 'short' }) })}` : ''}
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={ui.label}>{t('shop.status')}</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as Status)} className={ui.input}>
              {STATUSES.filter((s) => s !== 'delivered' || d.invoiced).map((s) => <option key={s} value={s}>{t(`shop.s.${s}` as DictKey)}</option>)}
            </select>
          </div>
          <div>
            <label className={ui.label}>{t('shop.technician')}</label>
            <select value={tech} onChange={(e) => setTech(e.target.value)} className={ui.input}>
              <option value="">{t('shop.unassigned')}</option>
              {technicians.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className={ui.label}>{t('shop.diagnosis')}</label>
            <textarea rows={2} value={diag} onChange={(e) => setDiag(e.target.value)} className={ui.input} />
          </div>
        </div>
        <button type="button" disabled={busy} className={`${ui.btnPrimary} w-full`}
          onClick={() => call('wo_update', { p_wo: d.id, p_status: status, p_diagnosis: diag, p_technician: tech || null }, t('shop.saved'))}>
          {t('prod.save')}
        </button>
      </Card>

      <WorkshopFiles woId={d.id} canEdit={d.status !== 'cancelled'} />

      <Card className="space-y-3">
        <h3 className="font-bold">{t('shop.lines')}</h3>
        {d.lines.length === 0 ? <p className={`text-sm ${ui.muted}`}>{t('shop.noLines')}</p> : (
          <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
            {d.lines.map((l) => (
              <li key={l.id} className="flex items-center gap-2 py-2">
                <span>{l.kind === 'labor' ? '🛠️' : '🔩'}</span>
                <span className="min-w-0 flex-1 truncate">{Number(l.qty)} × {l.description}</span>
                <span className="font-semibold">{fmt(l.total)}</span>
                {!d.invoiced && <button type="button" onClick={() => call('wo_remove_line', { p_item: l.id })} className={`text-xs ${ui.muted} hover:text-red-600 cursor-pointer`}><IconClose /></button>}
              </li>
            ))}
          </ul>
        )}

        {!d.invoiced && (
          <div className="grid gap-3 border-t border-slate-200 pt-3 dark:border-slate-800">
            <div className="flex gap-2">
              <select value={part} onChange={(e) => setPart(e.target.value)} className={`${ui.input} flex-1`}>
                <option value="">🔩 {t('shop.addPart')}</option>
                {catalog.map((p) => <option key={p.id} value={p.id}>{p.name} · {fmt(p.price)}{p.stock !== null ? ` (${Number(p.stock)})` : ''}</option>)}
              </select>
              <input inputMode="decimal" value={partQty} onChange={(e) => setPartQty(e.target.value)} className={`${ui.input} !w-16`} />
              <button type="button" disabled={!part || busy} onClick={() => { call('wo_add_line', { p_wo: d.id, p_product: part, p_description: null, p_qty: parseAmount(partQty) || 1, p_price: null }); setPart(''); setPartQty('1'); }}
                className={`${ui.btnGhost} !px-3`}>+</button>
            </div>
            <div className="flex gap-2">
              <input value={labor} onChange={(e) => setLabor(e.target.value)} placeholder={`🛠️ ${t('shop.labor')}`} className={`${ui.input} flex-1`} />
              <input inputMode="decimal" value={laborPrice} onChange={(e) => setLaborPrice(e.target.value)} placeholder={t('shop.price')} className={`${ui.input} !w-24`} />
              <button type="button" disabled={!labor.trim() || Number.isNaN(parseAmount(laborPrice)) || busy}
                onClick={() => { call('wo_add_line', { p_wo: d.id, p_product: null, p_description: labor, p_qty: 1, p_price: parseAmount(laborPrice) }); setLabor(''); setLaborPrice(''); }}
                className={`${ui.btnGhost} !px-3`}>+</button>
            </div>
          </div>
        )}

        <div className="flex items-baseline justify-between border-t border-slate-200 pt-3 dark:border-slate-800">
          <span className="font-semibold">{t('pos.total')}</span>
          <span className="text-2xl font-extrabold">{fmt(d.total)}</span>
        </div>

        {!d.invoiced ? (
          <button type="button" disabled={busy || d.lines.length === 0} onClick={() => call('wo_invoice', { p_wo: d.id }, t('shop.invoiced'))} className={`${ui.btnPrimary} w-full py-3`}>
            🧾 {t('shop.invoice')}
          </button>
        ) : d.paid ? (
          d.status !== 'delivered' ? (
            <button type="button" disabled={busy} onClick={() => call('wo_update', { p_wo: d.id, p_status: 'delivered', p_diagnosis: diag, p_technician: tech || null }, t('shop.deliveredOk'))} className={`${ui.btnPrimary} w-full py-3`}>
              🚗 {t('shop.deliver')}
            </button>
          ) : <p className="text-center text-sm font-semibold text-emerald-600 dark:text-emerald-400">✅ {t('shop.s.delivered')}</p>
        ) : (
          <p className="text-center text-sm font-semibold text-amber-700 dark:text-amber-300">🧾 {t('shop.waitingPayment')}</p>
        )}
      </Card>
    </div>
  );
}

