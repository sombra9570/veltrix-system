'use client';
import { useCallback, useEffect, useState } from 'react';
import { rpc } from '../../../../lib/supabase';
import { Card } from '../../shell';
import { ui } from '../../../site-header';
import { usePaged, ShowMore } from '../../paged';
import { useT } from '../../../i18n';
import { money, shortTime } from '../../format';
import { Sheet, BranchOpt, isoDay } from '../../sheet';
import { friendlyError } from '../owner-context';
import { SkuTag } from '../../sku-tag';

type Row = {
  id: string; at: string; status: 'confirmed' | 'cancelled'; condition: 'cash' | 'credit';
  approval: string | null; type: string; total: number; paid: number;
  customer: string | null; vendor: string | null; items: number;
};
type List = {
  currency: string;
  summary: { count: number; total: number; paid: number; cash_sales: number; credit_sales: number; cancelled: number };
  by_vendor: { name: string; count: number; total: number }[];
  orders: Row[];
  truncated: boolean;
};
type Detail = {
  id: string; at: string; status: string; condition: string; approval: string | null; total: number; paid: number;
  currency: string; notes: string | null; customer: string | null; vendor: string | null;
  items: { description: string; qty: number; price: number; total: number; sku?: string | null }[];
  installments: { number: number; due: string; amount: number; paid: number }[];
  payments: { at: string; method: string; amount: number; by: string | null; origin: string }[];
};
type Period = 'today' | 'week' | 'month' | 'custom';

const errBox = 'border-red-300 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400';
const okBox = 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300';

function range(p: Period): [string, string] {
  const now = new Date();
  const to = isoDay(now);
  if (p === 'today') return [to, to];
  if (p === 'week') return [isoDay(new Date(now.getTime() - 6 * 86_400_000)), to];
  return [isoDay(new Date(now.getFullYear(), now.getMonth(), 1)), to];
}

export default function SalesPage() {
  const { t, lang } = useT();
  const [branches, setBranches] = useState<BranchOpt[]>([]);
  const [branchId, setBranchId] = useState('');
  const [period, setPeriod] = useState<Period>('today');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [query, setQuery] = useState('');
  const [data, setData] = useState<List | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [cancelReason, setCancelReason] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    const [f, tt] = range('today');
    setFrom(f); setTo(tt);
    rpc<BranchOpt[]>('reader_branches').catch(() => rpc<BranchOpt[]>('seller_branches')).then((b) => {
      setBranches(b ?? []);
      if (b?.length) setBranchId(b[0].id);
    }).catch(() => {});
  }, []);

  const pick = (p: Period) => {
    setPeriod(p);
    if (p !== 'custom') { const [f, tt] = range(p); setFrom(f); setTo(tt); }
  };

  const load = useCallback(async () => {
    if (!branchId || !from || !to) return;
    try {
      setData(await rpc<List>('sales_list', { p_branch: branchId, p_from: from, p_to: to, p_search: query || null }));
    } catch (e) {
      setMsg({ ok: false, text: friendlyError((e as Error).message, t) });
    }
  }, [branchId, from, to, query, t]);

  useEffect(() => {
    const h = setTimeout(load, query ? 350 : 0);
    return () => clearTimeout(h);
  }, [load, query]);

  const cur = data?.currency ?? branches.find((b) => b.id === branchId)?.currency ?? 'USD';
  const fmt = (n: number) => money(Number(n), cur, lang);
  const multiDay = from !== to;

  const open = async (id: string) => {
    try { setDetail(await rpc<Detail>('sale_detail', { p_order: id })); setCancelReason(null); }
    catch (e) { setMsg({ ok: false, text: friendlyError((e as Error).message, t) }); }
  };

  const doCancel = async () => {
    if (!detail || !cancelReason?.trim()) return;
    setBusy(true);
    try {
      await rpc('cancel_sale', { p_order: detail.id, p_reason: cancelReason.trim() });
      setDetail(null);
      setMsg({ ok: true, text: t('sales.cancelled') });
      await load();
    } catch (e) {
      const m = (e as Error).message;
      setMsg({ ok: false, text: m.includes('SALE_HAS_PAYMENTS') ? t('sales.hasPayments') : friendlyError(m, t) });
    } finally { setBusy(false); }
  };

  const state = (r: { status: string; approval: string | null; total: number; paid: number }) => {
    if (r.status === 'cancelled') return { label: t('sales.st.cancelled'), cls: 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400' };
    if (r.approval === 'rejected') return { label: t('sales.st.rejected'), cls: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300' };
    if (r.approval === 'pending_supervisor') return { label: t('sales.st.pendingApproval'), cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' };
    if (Number(r.paid) >= Number(r.total)) return { label: t('sales.st.paid'), cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' };
    if (Number(r.paid) > 0) return { label: t('sales.st.partial'), cls: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300' };
    return { label: t('sales.st.unpaid'), cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' };
  };

  const paged = usePaged(data?.orders ?? [], 30, data);
  const s = data?.summary;
  const periods: [Period, string][] = [['today', t('sales.p.today')], ['week', t('sales.p.week')], ['month', t('sales.p.month')], ['custom', t('sales.p.custom')]];

  return (
    <div className="space-y-5">
      <div className="min-w-0">
        <h1 className="text-xl font-extrabold sm:text-2xl">🧾 {t('nav.sales')}</h1>
        <p className={`text-sm ${ui.muted}`}>{t('sales.subtitle')}</p>
      </div>

      {msg && <p className={`rounded-xl border p-3 text-sm font-semibold ${msg.ok ? okBox : errBox}`} onClick={() => setMsg(null)}>{msg.text}</p>}

      <div className="space-y-3">
        {branches.length > 1 && (
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={ui.input} aria-label={t('pos.branch')}>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name} · {b.company}</option>)}
          </select>
        )}
        <div className="grid grid-cols-4 gap-2">
          {periods.map(([p, label]) => (
            <button key={p} type="button" onClick={() => pick(p)}
              className={`rounded-xl px-2 py-2 text-xs font-semibold transition cursor-pointer sm:text-sm ${period === p ? 'bg-blue-600 text-white' : 'border border-slate-300 dark:border-slate-700'}`}>
              {label}
            </button>
          ))}
        </div>
        {period === 'custom' && (
          <div className="grid grid-cols-2 gap-2">
            <div><label className={ui.label}>{t('sales.from')}</label><input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={ui.input} /></div>
            <div><label className={ui.label}>{t('sales.to')}</label><input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={ui.input} /></div>
          </div>
        )}
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('sales.search')} className={ui.input} />
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          [t('sales.total'), s ? fmt(s.total) : '—', t('sales.countN', { n: s?.count ?? 0 })],
          [t('sales.collected'), s ? fmt(s.paid) : '—', ''],
          [t('sales.pending'), s ? fmt(Math.max(0, Number(s.total) - Number(s.paid))) : '—', ''],
          [t('sales.credit'), s ? fmt(s.credit_sales) : '—', s?.cancelled ? t('sales.cancelledN', { n: s.cancelled }) : ''],
        ].map(([label, value, sub], i) => (
          <Card key={i} className="!p-4">
            <p className={`text-xs font-semibold ${ui.muted}`}>{label}</p>
            <p className="mt-1 truncate text-lg font-extrabold sm:text-xl">{value}</p>
            {sub && <p className={`text-xs ${ui.muted}`}>{sub}</p>}
          </Card>
        ))}
      </div>

      {data && data.by_vendor.length > 1 && (
        <Card>
          <h2 className="mb-3 font-bold">{t('sales.byVendor')}</h2>
          <ul className="space-y-2">
            {data.by_vendor.map((v) => {
              const pct = Number(s?.total) > 0 ? (Number(v.total) / Number(s!.total)) * 100 : 0;
              return (
                <li key={v.name}>
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="truncate font-semibold">{v.name} <span className={ui.muted}>· {v.count}</span></span>
                    <span className="font-bold">{fmt(v.total)}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-slate-200 dark:bg-slate-800">
                    <div className="h-1.5 rounded-full bg-blue-600" style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Card className="!p-0 overflow-hidden">
        {!data ? (
          <p className={`p-5 text-sm ${ui.muted}`}>{t('common.wait')}</p>
        ) : data.orders.length === 0 ? (
          <p className={`p-5 text-sm ${ui.muted}`}>{t('sales.empty')}</p>
        ) : (
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {paged.visible.map((o) => {
              const st = state(o);
              return (
                <li key={o.id}>
                  <button type="button" onClick={() => open(o.id)} className="flex w-full items-center gap-3 p-4 text-start hover:bg-slate-50 cursor-pointer dark:hover:bg-slate-800/50">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">
                        {o.customer ?? t('sales.walkIn')}
                        {o.condition === 'credit' && <span className="ms-2 rounded-md bg-violet-100 px-1.5 py-0.5 text-[11px] font-bold text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">{t('sales.creditTag')}</span>}
                      </p>
                      <p className={`truncate text-xs ${ui.muted}`}>
                        {multiDay ? new Date(o.at).toLocaleDateString(lang, { day: '2-digit', month: 'short' }) + ' · ' : ''}
                        {shortTime(o.at, lang)} · {o.vendor ?? '—'} · {t('sales.itemsN', { n: o.items })} · #{o.id.slice(0, 6).toUpperCase()}
                      </p>
                    </div>
                    <div className="shrink-0 text-end">
                      <p className={`font-bold ${o.status === 'cancelled' ? 'line-through opacity-60' : ''}`}>{fmt(o.total)}</p>
                      <span className={`inline-block rounded-md px-1.5 py-0.5 text-[11px] font-bold ${st.cls}`}>{st.label}</span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {data?.truncated && <p className={`border-t border-slate-200 p-3 text-center text-xs dark:border-slate-800 ${ui.muted}`}>{t('sales.truncated')}</p>}
      </Card>
      <ShowMore rest={paged.rest} onClick={paged.more} />

      {detail && (
        <Sheet onClose={() => setDetail(null)} label={t('pos.close')}>
          <div className="space-y-4">
            <div>
              <p className={`text-xs ${ui.muted}`}>#{detail.id.slice(0, 8).toUpperCase()} · {new Date(detail.at).toLocaleString(lang, { dateStyle: 'medium', timeStyle: 'short' })}</p>
              <h2 className="text-lg font-extrabold">{detail.customer ?? t('sales.walkIn')}</h2>
              <p className={`text-sm ${ui.muted}`}>{t('cash.soldBy', { name: detail.vendor ?? '—' })} · {detail.condition === 'credit' ? t('sales.creditTag') : t('sales.cashTag')}</p>
              <span className={`mt-2 inline-block rounded-md px-2 py-0.5 text-xs font-bold ${state(detail).cls}`}>{state(detail).label}</span>
            </div>

            <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
              {detail.items.map((i, k) => (
                <li key={k} className="flex justify-between gap-3 p-3 text-sm">
                  <span className="min-w-0"><span className="font-semibold">{Number(i.qty)} ×</span> {i.description}<SkuTag sku={i.sku} /> <span className={ui.muted}>({fmt(i.price)})</span></span>
                  <span className="shrink-0 font-semibold">{fmt(i.total)}</span>
                </li>
              ))}
              <li className="flex justify-between p-3 font-extrabold"><span>{t('sales.total')}</span><span>{fmt(detail.total)}</span></li>
            </ul>

            {detail.installments.length > 1 && (
              <div>
                <h3 className="mb-2 text-sm font-bold">{t('sales.installments')}</h3>
                <ul className="space-y-1 text-sm">
                  {detail.installments.map((i) => (
                    <li key={i.number} className="flex justify-between gap-3">
                      <span>#{i.number} · {new Date(i.due + 'T12:00:00').toLocaleDateString(lang)}</span>
                      <span className={Number(i.paid) >= Number(i.amount) ? 'text-emerald-600 dark:text-emerald-400' : ''}>{fmt(i.paid)} / {fmt(i.amount)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <h3 className="mb-2 text-sm font-bold">{t('sales.payments')}</h3>
              {detail.payments.length === 0 ? (
                <p className={`text-sm ${ui.muted}`}>{t('sales.noPayments')}</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {detail.payments.map((p, k) => (
                    <li key={k} className="flex justify-between gap-3">
                      <span className="min-w-0 truncate">{new Date(p.at).toLocaleDateString(lang, { day: '2-digit', month: 'short' })} {shortTime(p.at, lang)} · {t(`cash.m.${p.method}` as 'cash.m.cash')} · {p.by ?? '—'}</span>
                      <span className={`shrink-0 font-semibold ${Number(p.amount) < 0 ? 'text-red-600 dark:text-red-400' : ''}`}>{fmt(p.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {detail.notes && <p className={`whitespace-pre-line rounded-xl bg-slate-100 p-3 text-sm dark:bg-slate-800 ${ui.muted}`}>{detail.notes}</p>}

            {detail.status === 'confirmed' && (
              Number(detail.paid) !== 0 ? (
                <p className={`text-xs ${ui.muted}`}>{t('sales.hasPayments')}</p>
              ) : cancelReason === null ? (
                <button type="button" onClick={() => setCancelReason('')} className={`${ui.btnGhost} w-full !border-red-300 !text-red-600 dark:!border-red-500/40 dark:!text-red-400`}>{t('sales.cancel')}</button>
              ) : (
                <div className="space-y-2 rounded-xl border border-red-300 p-3 dark:border-red-500/40">
                  <label className={ui.label}>{t('sales.cancelReason')}</label>
                  <input autoFocus value={cancelReason} maxLength={300} onChange={(e) => setCancelReason(e.target.value)} className={ui.input} />
                  <p className={`text-xs ${ui.muted}`}>{t('sales.cancelHint')}</p>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setCancelReason(null)} className={`${ui.btnGhost} flex-1`}>{t('cash.cancel')}</button>
                    <button type="button" disabled={busy || !cancelReason.trim()} onClick={doCancel} className={`${ui.btnPrimary} flex-1 !bg-red-600 hover:!bg-red-500`}>{busy ? t('common.wait') : t('sales.cancelConfirm')}</button>
                  </div>
                </div>
              )
            )}
          </div>
        </Sheet>
      )}
    </div>
  );
}
