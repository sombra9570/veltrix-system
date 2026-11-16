'use client';
import { useCallback, useEffect, useState } from 'react';
import { rpc } from '../../lib/supabase';
import { Card } from './shell';
import { ui } from '../site-header';
import { useSync } from './sync';
import { useT } from '../i18n';
import { money } from './format';
import { ReceiptButtons } from './receipt-buttons';

type Branch = { id: string; name: string; company: string; currency: string };
type Sale = { id: string; at: string; status: string; total: number; currency: string; items: number; condition: string; customer: string | null; paid: boolean };
type Result = { summary: { count: number; total: number; cancelled: number; cancelled_total: number }; sales: Sale[] };

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return ymd(d); };

/** Historial propio de ventas: rango de fechas, búsqueda por cliente o N.º, totales y comprobante */
export function MySalesScreen() {
  const { t, lang } = useT();
  const [branches, setBranches] = useState<Branch[] | null>(null);
  const [branchId, setBranchId] = useState('');
  const [from, setFrom] = useState(daysAgo(6));
  const [to, setTo] = useState(daysAgo(0));
  const [q, setQ] = useState('');
  const [data, setData] = useState<Result | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    rpc<Branch[]>('seller_branches').then((b) => { setBranches(b ?? []); if (b?.length) setBranchId(b[0].id); }).catch(() => setBranches([]));
  }, []);

  const load = useCallback(async () => {
    if (!branchId || !from || !to) return;
    try {
      setErr(false);
      setData(await rpc<Result>('my_sales', { p_branch: branchId, p_from: from, p_to: to, p_search: q.trim() || null }));
    } catch { setErr(true); }
  }, [branchId, from, to, q]);
  useEffect(() => { const id = setTimeout(load, 250); return () => clearTimeout(id); }, [load]);
  useSync(load);

  const cur = branches?.find((b) => b.id === branchId)?.currency ?? 'USD';
  const fmt = (n: number, c = cur) => money(Number(n), c, lang);
  const quick = (n: number) => { setFrom(daysAgo(n)); setTo(daysAgo(0)); };

  if (branches === null) return <p className={`text-sm ${ui.muted}`}>{t('common.wait')}</p>;
  if (branches.length === 0) return <Card><p className={`text-sm ${ui.muted}`}>{t('pos.noBranches')}</p></Card>;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold sm:text-2xl">🧾 {t('ms.title')}</h1>
        <p className={`text-sm ${ui.muted}`}>{t('ms.subtitle')}</p>
      </div>

      <Card className="space-y-3">
        {branches.length > 1 && (
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={ui.input} aria-label={t('pos.branch')}>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.company} · {b.name}</option>)}
          </select>
        )}
        <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
          <label className="block"><span className={ui.label}>{t('ms.from')}</span>
            <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={ui.input} /></label>
          <label className="block"><span className={ui.label}>{t('ms.to')}</span>
            <input type="date" value={to} min={from} max={daysAgo(0)} onChange={(e) => setTo(e.target.value)} className={ui.input} /></label>
        </div>
        <div className="flex gap-2">
          {[[0, 'ms.today'], [6, 'ms.week'], [29, 'ms.month']].map(([n, k]) => (
            <button key={k as string} type="button" onClick={() => quick(n as number)} className={`${ui.btnGhost} !px-3 !py-1.5 text-xs`}>{t(k as 'ms.today')}</button>
          ))}
        </div>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('ms.search')} className={ui.input} />
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Card className="!p-3 sm:!p-4">
          <p className={`text-xs font-semibold ${ui.muted}`}>{t('ms.sold')}</p>
          <p className="mt-1 whitespace-nowrap text-base font-extrabold sm:text-xl">{data ? fmt(data.summary.total) : '—'}</p>
          <p className={`text-xs ${ui.muted}`}>{t('ms.salesN', { n: data?.summary.count ?? 0 })}</p>
        </Card>
        <Card className="!p-3 sm:!p-4">
          <p className={`text-xs font-semibold ${ui.muted}`}>{t('ms.cancelled')}</p>
          <p className="mt-1 whitespace-nowrap text-base font-extrabold sm:text-xl">{data ? fmt(data.summary.cancelled_total) : '—'}</p>
          <p className={`text-xs ${ui.muted}`}>{t('ms.salesN', { n: data?.summary.cancelled ?? 0 })}</p>
        </Card>
      </div>

      {err && <p className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">{t('err.generic')}</p>}

      <Card className="!p-0 overflow-hidden">
        {!data ? <p className={`p-5 text-sm ${ui.muted}`}>{t('common.wait')}</p>
          : data.sales.length === 0 ? <p className={`p-5 text-sm ${ui.muted}`}>{t('ms.empty')}</p> : (
            <ul className="divide-y divide-slate-200 dark:divide-slate-800">
              {data.sales.map((s) => {
                const voided = s.status === 'cancelled';
                return (
                  <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                    <div className="min-w-0 flex-1 basis-40">
                      <p className={`truncate text-sm font-semibold ${voided ? 'line-through opacity-60' : ''}`}>{s.customer ?? t('ms.walkIn')}</p>
                      <p className={`text-xs ${ui.muted}`}>{new Date(s.at).toLocaleString(lang, { dateStyle: 'short', timeStyle: 'short' })} · {t('pos.items', { n: s.items })} · #{s.id.slice(0, 8).toUpperCase()}</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${voided ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' : s.paid ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300'}`}>
                      {voided ? t('rc.voided') : s.paid ? t('pos.paid') : t('pos.pending')}
                    </span>
                    <span className={`w-24 text-right font-bold ${voided ? 'line-through opacity-60' : ''}`}>{fmt(s.total, s.currency)}</span>
                    <ReceiptButtons orderId={s.id} />
                  </li>
                );
              })}
            </ul>
          )}
      </Card>
    </div>
  );
}
