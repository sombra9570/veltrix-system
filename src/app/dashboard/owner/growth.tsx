'use client';
import { useEffect, useMemo, useState } from 'react';
import { rpc } from '../../../lib/supabase';
import { Card } from '../shell';
import { ui } from '../../site-header';
import { useT, type TFunction } from '../../i18n';

type DictKey = Parameters<TFunction>[0];
import { useOwner } from './owner-context';

type Row = { d: string; sales: number; orders: number; collected: number; expenses: number; lent: number };
type Cur = { currency: string; rows: Row[] };
type Metric = 'sales' | 'orders' | 'collected' | 'expenses' | 'lent';
const METRICS: { key: Metric; label: DictKey; color: string; money: boolean }[] = [
  { key: 'sales', label: 'gr2.sales', color: '#2563eb', money: true },
  { key: 'orders', label: 'gr2.orders', color: '#7c3aed', money: false },
  { key: 'collected', label: 'gr2.collected', color: '#10b981', money: true },
  { key: 'lent', label: 'gr2.lent', color: '#f59e0b', money: true },
  { key: 'expenses', label: 'gr2.expenses', color: '#ef4444', money: true },
];

function fmtMoney(v: number, cur: string, lang: string) {
  try { return new Intl.NumberFormat(lang, { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(v); } catch { return `${cur} ${Math.round(v)}`; }
}

/** Curvas de crecimiento del negocio: por día, semana o mes. Solo muestra lo que el negocio realmente mueve. */
export function GrowthCurves() {
  const { orgId } = useOwner();
  const { t, lang } = useT();
  const [gran, setGran] = useState<'day' | 'week' | 'month'>('day');
  const [data, setData] = useState<Cur[] | null>(null);
  const [cur, setCur] = useState('');
  const [metric, setMetric] = useState<Metric | ''>('');
  const [pick, setPick] = useState<number | null>(null);

  useEffect(() => {
    if (!orgId) return;
    let live = true;
    setData(null); setPick(null);
    rpc<Cur[]>('business_growth', { p_org: orgId, p_gran: gran, p_n: gran === 'day' ? 14 : gran === 'week' ? 12 : 12 })
      .then((r) => { if (live) setData(r ?? []); }).catch(() => { if (live) setData([]); });
    return () => { live = false; };
  }, [orgId, gran]);

  const sel = useMemo(() => (data ?? []).find((c) => c.currency === cur) ?? data?.[0], [data, cur]);
  const used = useMemo(() => METRICS.filter((m) => (sel?.rows ?? []).some((r) => Number(r[m.key]) !== 0)), [sel]);
  const active = used.find((m) => m.key === metric) ?? used[0];

  if (data === null) return <Card><p className={`text-sm ${ui.muted}`}>{t('common.wait')}</p></Card>;
  const seg = (on: boolean) => `rounded-lg px-3 py-1.5 text-sm font-semibold cursor-pointer ${on ? 'bg-blue-600 text-white' : ''}`;
  const head = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="font-bold">📈 {t('gr2.title')}</h2>
      <div className="grid grid-cols-3 gap-1 rounded-xl border border-slate-300 p-1 dark:border-slate-700">
        {(['day', 'week', 'month'] as const).map((g) => (
          <button key={g} type="button" className={seg(gran === g)} onClick={() => setGran(g)}>{t(g === 'day' ? 'cx.sum.day' : g === 'week' ? 'cx.sum.week' : 'gr2.month')}</button>
        ))}
      </div>
    </div>
  );
  if (!sel || !active) return <Card className="space-y-3">{head}<p className={`text-sm ${ui.muted}`}>{t('gr2.empty')}</p></Card>;

  const vals = sel.rows.map((r) => Number(r[active.key]));
  const max = Math.max(...vals, 1);
  const W = 100, H = 40;
  const pts = vals.map((v, i) => [(i / Math.max(vals.length - 1, 1)) * W, H - 3 - (v / max) * (H - 8)] as const);
  const line = pts.map((p) => p.join(',')).join(' ');
  const area = `0,${H} ${line} ${W},${H}`;
  const last = vals[vals.length - 1], prev = vals[vals.length - 2];
  const pct = prev > 0 ? Math.round(((last - prev) / prev) * 100) : null;
  const total = vals.reduce((a, b) => a + b, 0);
  const shown = pick ?? vals.length - 1;
  const show = (v: number) => (active.money ? fmtMoney(v, sel.currency, lang) : String(Math.round(v)));
  const label = (d: string) => {
    const dt = new Date(d + 'T12:00:00');
    if (gran === 'month') return new Intl.DateTimeFormat(lang, { month: 'short' }).format(dt);
    return gran === 'day' ? String(dt.getDate()) : `${dt.getDate()}/${dt.getMonth() + 1}`;
  };
  const full = (d: string) => new Intl.DateTimeFormat(lang, gran === 'month' ? { month: 'long', year: 'numeric' } : { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(d + 'T12:00:00'));
  const step = Math.ceil(vals.length / 7);

  return (
    <Card className="space-y-4">
      {head}
      <div className="flex flex-wrap items-center gap-2">
        {used.map((m) => (
          <button key={m.key} type="button" onClick={() => setMetric(m.key)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold cursor-pointer ${active.key === m.key ? 'border-transparent text-white' : 'border-slate-300 dark:border-slate-700'}`}
            style={active.key === m.key ? { background: m.color } : undefined}>{t(m.label)}</button>
        ))}
        {data.length > 1 && (
          <select value={sel.currency} onChange={(e) => setCur(e.target.value)} className={`${ui.input} !w-auto !py-1 text-xs`}>
            {data.map((c) => <option key={c.currency} value={c.currency}>{c.currency}</option>)}
          </select>
        )}
      </div>
      <div>
        <p className="text-2xl font-extrabold sm:text-3xl">{show(vals[shown])}</p>
        <p className={`text-xs ${ui.muted}`}>
          {full(sel.rows[shown].d)}
          {pick === null && pct !== null && <> · {pct >= 0 ? <b className="text-emerald-600 dark:text-emerald-400">{t('gr.up', { pct })}</b> : <b className="text-red-600 dark:text-red-400">{t('gr.down', { pct: Math.abs(pct) })}</b>}</>}
        </p>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-40 w-full touch-none" role="img" aria-label={t(active.label)}
        onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setPick(Math.min(vals.length - 1, Math.max(0, Math.round(((e.clientX - r.left) / r.width) * (vals.length - 1))))); }}
        onPointerLeave={() => setPick(null)}>
        <polygon points={area} fill={active.color} opacity="0.12" />
        <polyline points={line} fill="none" stroke={active.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {pick !== null && <line x1={pts[pick][0]} x2={pts[pick][0]} y1="0" y2={H} stroke={active.color} strokeWidth="1" vectorEffect="non-scaling-stroke" opacity="0.5" />}
      </svg>
      <div className="flex justify-between">
        {sel.rows.map((r, i) => <span key={r.d} className={`w-0 flex-1 text-center text-[10px] ${ui.muted} ${i % step === 0 || i === vals.length - 1 ? '' : 'invisible'}`}>{label(r.d)}</span>)}
      </div>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div><p className={ui.muted}>{t('gr2.total')}</p><p className="font-bold">{show(total)}</p></div>
        <div><p className={ui.muted}>{t('gr2.best')}</p><p className="font-bold">{show(max)} · {full(sel.rows[vals.indexOf(max)].d)}</p></div>
      </div>
    </Card>
  );
}
