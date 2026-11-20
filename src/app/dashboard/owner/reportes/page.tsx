'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { rpc } from '../../../../lib/supabase';
import { Card } from '../../shell';
import { ui } from '../../../site-header';
import { useT } from '../../../i18n';
import { money } from '../../format';
import { isoDay } from '../../sheet';
import { friendlyError, useOwner } from '../owner-context';

type MBranch = { id: string; name: string; company_id: string; company: string; currency: string; company_wide: boolean };
type Report = {
  currency: string;
  totals: { sales: number; count: number; avg_ticket: number; credit_sales: number; collected: number; cogs: number; expenses: number; gross_profit: number; net_estimate: number };
  daily: { day: string; sales: number; collected: number }[];
  by_hour: { hour: number; sales: number; count: number }[];
  methods: { method: string; amount: number }[];
  top_products: { name: string; qty: number; total: number }[];
  vendors: { name: string; count: number; total: number }[];
  credit: { portfolio: number; overdue: number; customers_overdue: number };
  branches: { id: string; name: string; sales: number }[];
};
type Period = 'today' | 'week' | 'month' | 'last_month' | 'custom';

function range(p: Period): [string, string] {
  const now = new Date();
  if (p === 'today') return [isoDay(now), isoDay(now)];
  if (p === 'week') return [isoDay(new Date(now.getTime() - 6 * 86_400_000)), isoDay(now)];
  if (p === 'last_month') return [isoDay(new Date(now.getFullYear(), now.getMonth() - 1, 1)), isoDay(new Date(now.getFullYear(), now.getMonth(), 0))];
  return [isoDay(new Date(now.getFullYear(), now.getMonth(), 1)), isoDay(now)];
}

function Bars({ rows, fmt }: { rows: { label: string; value: number; sub?: string }[]; fmt: (n: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => Number(r.value)));
  return (
    <ul className="space-y-2">
      {rows.map((r, k) => (
        <li key={k}>
          <div className="flex justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-semibold">{r.label}{r.sub && <span className="font-normal text-slate-500 dark:text-slate-400"> · {r.sub}</span>}</span>
            <span className="shrink-0 font-bold">{fmt(r.value)}</span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-slate-200 dark:bg-slate-800">
            <div className="h-1.5 rounded-full bg-blue-600" style={{ width: `${(Number(r.value) / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function SalesReports() {
  const { t, lang } = useT();
  const [branches, setBranches] = useState<MBranch[]>([]);
  const [scope, setScope] = useState('');       // "company:<id>" o "branch:<id>"
  const [period, setPeriod] = useState<Period>('month');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [r, setR] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [canExport, setCanExport] = useState(true);

  useEffect(() => {
    const [f, tt] = range('month');
    setFrom(f); setTo(tt);
    rpc<MBranch[]>('reader_branches').catch(() => rpc<MBranch[]>('manager_branches')).then((b) => {
      const list = b ?? [];
      setBranches(list);
      if (list.length) rpc<Record<string, boolean>>('my_permissions', { p_branch: list[0].id })
        .then((p) => setCanExport(p?.['reports.export'] !== false)).catch(() => undefined);
      if (list.length) setScope(list[0].company_wide && list.filter((x) => x.company_id === list[0].company_id).length > 1 ? `company:${list[0].company_id}` : `branch:${list[0].id}`);
    }).catch(() => {});
  }, []);

  const companies = useMemo(() => {
    const m = new Map<string, { id: string; name: string; wide: boolean; branches: MBranch[] }>();
    branches.forEach((b) => {
      if (!m.has(b.company_id)) m.set(b.company_id, { id: b.company_id, name: b.company, wide: b.company_wide, branches: [] });
      m.get(b.company_id)!.branches.push(b);
    });
    return [...m.values()];
  }, [branches]);

  const pick = (p: Period) => { setPeriod(p); if (p !== 'custom') { const [f, tt] = range(p); setFrom(f); setTo(tt); } };

  const load = useCallback(async () => {
    if (!scope || !from || !to) return;
    const [kind, id] = scope.split(':');
    const company = kind === 'company' ? id : branches.find((b) => b.id === id)?.company_id;
    if (!company) return;
    setLoading(true); setErr('');
    try {
      setR(await rpc<Report>('report_summary', { p_company: company, p_branch: kind === 'branch' ? id : null, p_from: from, p_to: to }));
    } catch (e) { setErr(friendlyError((e as Error).message, t)); }
    finally { setLoading(false); }
  }, [scope, from, to, branches, t]);
  useEffect(() => { load(); }, [load]);

  const fmt = (n: number) => money(Number(n), r?.currency ?? 'USD', lang);
  const tot = r?.totals;
  const margin = tot && Number(tot.sales) > 0 ? Math.round((Number(tot.gross_profit) / Number(tot.sales)) * 100) : null;
  const dayMax = Math.max(1, ...(r?.daily ?? []).map((d) => Math.max(Number(d.sales), Number(d.collected))));
  const hourMax = Math.max(1, ...(r?.by_hour ?? []).map((h) => Number(h.sales)));
  const scopeName = (() => {
    const [kind, id] = scope.split(':');
    return kind === 'company' ? `${companies.find((c) => c.id === id)?.name ?? ''} · ${t('rep.allBranches')}` : branches.find((b) => b.id === id)?.name ?? '';
  })();

  const exportCsv = () => {
    if (!r) return;
    const q = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const rows: (string | number)[][] = [
      [t('rep.report'), scopeName], [t('sales.from'), from], [t('sales.to'), to], [],
      [t('rep.kSales'), Number(tot!.sales)], [t('rep.kTickets'), Number(tot!.count)], [t('rep.kCollected'), Number(tot!.collected)],
      [t('rep.kCost'), Number(tot!.cogs)], [t('rep.kGross'), Number(tot!.gross_profit)], [t('rep.kExpenses'), Number(tot!.expenses)],
      [t('rep.kNet'), Number(tot!.net_estimate)], [],
      [t('rep.day'), t('rep.kSales'), t('rep.kCollected')], ...r.daily.map((d) => [d.day, Number(d.sales), Number(d.collected)]), [],
      [t('rep.topProducts'), t('inv.qty'), t('rep.kSales')], ...r.top_products.map((p) => [p.name, Number(p.qty), Number(p.total)]),
    ];
    const csv = '﻿' + rows.map((row) => row.map(q).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `veltrix-reporte-${from}_${to}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const periods: [Period, string][] = [['today', t('sales.p.today')], ['week', t('sales.p.week')], ['month', t('sales.p.month')], ['last_month', t('rep.lastMonth')], ['custom', t('sales.p.custom')]];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-extrabold sm:text-2xl">📊 {t('nav.reports')}</h1>
          <p className={`text-sm ${ui.muted}`}>{t('rep.subtitle')}</p>
        </div>
        {canExport && <button type="button" disabled={!r} onClick={exportCsv} className={`${ui.btnGhost} max-sm:w-full`}>⬇️ {t('rep.export')}</button>}
      </div>

      <div className="space-y-3">
        {branches.length > 1 && (
          <select value={scope} onChange={(e) => setScope(e.target.value)} className={ui.input} aria-label={t('pos.branch')}>
            {companies.map((c) => (
              <optgroup key={c.id} label={c.name}>
                {c.wide && c.branches.length > 1 && <option value={`company:${c.id}`}>{t('rep.allBranches')}</option>}
                {c.branches.map((b) => <option key={b.id} value={`branch:${b.id}`}>{b.name}</option>)}
              </optgroup>
            ))}
          </select>
        )}
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
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
      </div>

      {err && <p className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">{err}</p>}

      <div className={`grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6 ${loading ? 'opacity-60' : ''}`}>
        {[
          [t('rep.kSales'), tot ? fmt(tot.sales) : '—', tot ? t('rep.ticketsAvg', { n: tot.count, avg: fmt(tot.avg_ticket) }) : ''],
          [t('rep.kCollected'), tot ? fmt(tot.collected) : '—', ''],
          [t('rep.kCost'), tot ? fmt(tot.cogs) : '—', ''],
          [t('rep.kGross'), tot ? fmt(tot.gross_profit) : '—', margin !== null ? t('rep.marginN', { n: margin }) : ''],
          [t('rep.kExpenses'), tot ? fmt(tot.expenses) : '—', ''],
          [t('rep.kNet'), tot ? fmt(tot.net_estimate) : '—', ''],
        ].map(([label, value, sub], i) => (
          <Card key={i} className={`!p-4 ${i === 5 ? '!border-blue-300 dark:!border-blue-500/40' : ''}`}>
            <p className={`text-xs font-semibold ${ui.muted}`}>{label}</p>
            <p className={`mt-1 truncate text-lg font-extrabold sm:text-xl ${i === 5 && tot && Number(tot.net_estimate) < 0 ? 'text-red-600 dark:text-red-400' : ''}`}>{value}</p>
            {sub && <p className={`text-xs ${ui.muted}`}>{sub}</p>}
          </Card>
        ))}
      </div>
      <p className={`-mt-2 text-xs ${ui.muted}`}>{t('rep.costNote')}</p>

      {r && (
        <>
          {/* Ventas y cobros por día */}
          <Card>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-bold">{t('rep.daily')}</h2>
              <div className="flex gap-3 text-xs">
                <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-blue-600" />{t('rep.kSales')}</span>
                <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />{t('rep.kCollected')}</span>
              </div>
            </div>
            <div className="overflow-x-auto overscroll-x-contain">
              <div className="flex h-44 items-end gap-1" style={{ minWidth: r.daily.length > 62 ? `${r.daily.length * 6}px` : undefined }}>
                {r.daily.map((d) => (
                  <div key={d.day} className="flex h-full min-w-0 flex-1 flex-col justify-end" title={`${d.day} · ${fmt(d.sales)} / ${fmt(d.collected)}`}>
                    <div className="flex h-full items-end gap-px">
                      <div className="flex-1 rounded-t bg-blue-600" style={{ height: `${(Number(d.sales) / dayMax) * 100}%` }} />
                      <div className="flex-1 rounded-t bg-emerald-500" style={{ height: `${(Number(d.collected) / dayMax) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-1 flex justify-between text-[11px] text-slate-500 dark:text-slate-400">
                <span>{new Date(from + 'T12:00:00').toLocaleDateString(lang, { day: '2-digit', month: 'short' })}</span>
                <span>{new Date(to + 'T12:00:00').toLocaleDateString(lang, { day: '2-digit', month: 'short' })}</span>
              </div>
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <h2 className="mb-3 font-bold">{t('rep.topProducts')}</h2>
              {r.top_products.length === 0 ? <p className={`text-sm ${ui.muted}`}>{t('sales.empty')}</p>
                : <Bars fmt={fmt} rows={r.top_products.map((p) => ({ label: p.name, value: p.total, sub: `×${Number(p.qty).toLocaleString(lang, { maximumFractionDigits: 3 })}` }))} />}
            </Card>

            <Card>
              <h2 className="mb-3 font-bold">{t('rep.byHour')}</h2>
              {r.by_hour.length === 0 ? <p className={`text-sm ${ui.muted}`}>{t('sales.empty')}</p> : (
                <>
                  <div className="flex h-32 items-end gap-0.5">
                    {Array.from({ length: 24 }, (_, h) => {
                      const x = r.by_hour.find((b) => Number(b.hour) === h);
                      return <div key={h} className="flex-1 rounded-t bg-violet-500" title={`${h}:00 · ${x ? fmt(x.sales) : fmt(0)}`}
                        style={{ height: `${x ? Math.max(4, (Number(x.sales) / hourMax) * 100) : 0}%` }} />;
                    })}
                  </div>
                  <div className="mt-1 flex justify-between text-[11px] text-slate-500 dark:text-slate-400"><span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>23h</span></div>
                  {(() => {
                    const best = [...r.by_hour].sort((a, b) => Number(b.sales) - Number(a.sales))[0];
                    return best ? <p className={`mt-2 text-xs ${ui.muted}`}>{t('rep.bestHour', { h: `${best.hour}:00–${Number(best.hour) + 1}:00` })}</p> : null;
                  })()}
                </>
              )}
            </Card>

            <Card>
              <h2 className="mb-3 font-bold">{t('rep.methods')}</h2>
              {r.methods.length === 0 ? <p className={`text-sm ${ui.muted}`}>{t('sales.noPayments')}</p>
                : <Bars fmt={fmt} rows={r.methods.map((m) => ({ label: t(`cash.m.${m.method}` as 'cash.m.cash'), value: m.amount }))} />}
            </Card>

            <Card>
              <h2 className="mb-3 font-bold">{t('sales.byVendor')}</h2>
              {r.vendors.length === 0 ? <p className={`text-sm ${ui.muted}`}>{t('sales.empty')}</p>
                : <Bars fmt={fmt} rows={r.vendors.map((v) => ({ label: v.name, value: v.total, sub: t('sales.countN', { n: v.count }) }))} />}
            </Card>

            <Card>
              <h2 className="mb-1 font-bold">{t('rep.credit')}</h2>
              <p className={`mb-3 text-xs ${ui.muted}`}>{t('rep.creditHint')}</p>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div><p className={`text-xs ${ui.muted}`}>{t('rep.portfolio')}</p><p className="font-extrabold">{fmt(r.credit.portfolio)}</p></div>
                <div><p className={`text-xs ${ui.muted}`}>{t('rep.overdue')}</p><p className={`font-extrabold ${Number(r.credit.overdue) > 0 ? 'text-red-600 dark:text-red-400' : ''}`}>{fmt(r.credit.overdue)}</p></div>
                <div><p className={`text-xs ${ui.muted}`}>{t('rep.lateCustomers')}</p><p className="font-extrabold">{r.credit.customers_overdue}</p></div>
              </div>
            </Card>

            {r.branches.length > 1 && (
              <Card>
                <h2 className="mb-3 font-bold">{t('rep.byBranch')}</h2>
                <Bars fmt={fmt} rows={r.branches.map((b) => ({ label: b.name, value: b.sales }))} />
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  );
}

type Liq = { id: string; route: string; at: string; opening: number; collected: number; lent: number; expenses: number; expected: number; counted: number; difference: number; closing: number; currency: string };
type Rep = { id: string; route: string; at: string; body: string; author: string | null };

/** Reportes de una empresa de cobranza: solo liquidaciones anteriores y reportes enviados por los supervisores */
function CobranzaReports() {
  const { t, lang } = useT();
  const { orgId } = useOwner();
  const [liqs, setLiqs] = useState<Liq[] | null>(null);
  const [reps, setReps] = useState<Rep[] | null>(null);
  useEffect(() => {
    if (!orgId) return;
    rpc<Liq[]>('liquidations_admin', { p_org: orgId }).then((r) => setLiqs(r ?? [])).catch(() => setLiqs([]));
    rpc<Rep[]>('supervisor_reports_admin', { p_org: orgId }).then((r) => setReps(r ?? [])).catch(() => setReps([]));
  }, [orgId]);
  return (
    <div className="space-y-5">
      <div className="min-w-0">
        <h1 className="text-xl font-extrabold sm:text-2xl">📊 {t('nav.reports')}</h1>
        <p className={`text-sm ${ui.muted}`}>{t('rep.cobSubtitle')}</p>
      </div>
      <Card className="space-y-3">
        <h2 className="font-bold">✂️ {t('rt.liqHist')}</h2>
        {liqs === null ? <p className={`text-sm ${ui.muted}`}>{t('common.wait')}</p> : liqs.length === 0 ? <p className={`text-sm ${ui.muted}`}>{t('rt.liqNone')}</p> : (
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {liqs.map((l) => {
              const m = (n: number) => money(Number(n), l.currency, lang);
              return (
                <li key={l.id} className="space-y-1.5 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-bold">🛵 {l.route}</p>
                    <p className={`text-xs ${ui.muted}`}>{new Date(l.at).toLocaleString(lang)}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
                    <p><span className={ui.muted}>{t('cx.sum.prev')}</span><br /><b>{m(l.opening)}</b></p>
                    <p><span className={ui.muted}>{t('cx.sum.collected')}</span><br /><b>{m(l.collected)}</b></p>
                    <p><span className={ui.muted}>{t('cx.sum.lent')}</span><br /><b>{m(l.lent)}</b></p>
                    <p><span className={ui.muted}>{t('cx.sum.expenses')}</span><br /><b>{m(l.expenses)}</b></p>
                    <p><span className={ui.muted}>{t('cx.sum.current')}</span><br /><b>{m(l.closing)}</b></p>
                    <p><span className={ui.muted}>{t('liq.diff')}</span><br /><b className={Number(l.difference) < 0 ? 'text-red-600 dark:text-red-400' : Number(l.difference) > 0 ? 'text-emerald-600' : ''}>{m(l.difference)}</b></p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <Card className="space-y-3">
        <h2 className="font-bold">📝 {t('rep.supTitle')}</h2>
        {reps === null ? <p className={`text-sm ${ui.muted}`}>{t('common.wait')}</p> : reps.length === 0 ? <p className={`text-sm ${ui.muted}`}>{t('rep.supNone')}</p> : (
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {reps.map((r) => (
              <li key={r.id} className="space-y-1 py-3">
                <p className="text-xs"><b>🛵 {r.route}</b> · {r.author ?? '—'} · <span className={ui.muted}>{new Date(r.at).toLocaleString(lang)}</span></p>
                <p className="whitespace-pre-wrap text-sm">{r.body}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

export default function ReportsPage() {
  const { cobranza } = useOwner();
  return cobranza ? <CobranzaReports /> : <SalesReports />;
}
