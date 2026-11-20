'use client';
import { useEffect, useState } from 'react';
import { rpc } from '../../../../lib/supabase';
import { Card } from '../../shell';
import { ui } from '../../../site-header';
import { useT } from '../../../i18n';
import { money } from '../../format';
import { useStaff } from '../../staff-context';

/* Información de la ruta: lee lo guardado en el teléfono (sirve sin internet) y se actualiza si hay señal */
type Row = { day: string; cash: number; digital: number; lent: number; expenses: number };
type R = {
  id: string; name: string; branch: string; currency: string; today: string;
  unsettled_cash: number; unsettled_digital: number; unsettled_expenses: number; unsettled_loans?: number;
  fund_balance?: number; days?: Row[]; can_portfolio?: boolean; commission_pct?: number;
  period?: { investments: number };
  customers: { balance: number; overdue: number; due_today: number; paid_today?: boolean }[];
};
type D = { generated_at: string; routes: R[] };

export default function RouteInfoPage() {
  const { t, lang } = useT();
  const { userId } = useStaff();
  const [day, setDay] = useState<D | null>(null);
  const [rid, setRid] = useState('');

  useEffect(() => {
    try {
      const d = JSON.parse(localStorage.getItem(`vx_collector_day_${userId}`) ?? 'null') as D | null;
      if (d) { setDay(d); setRid(d.routes[0]?.id ?? ''); }
    } catch { /* sin datos guardados */ }
    rpc<D>('collector_day').then((d) => { setDay(d); setRid((r) => r || d.routes[0]?.id || ''); }).catch(() => undefined);
  }, [userId]);

  const r = day?.routes.find((x) => x.id === rid) ?? day?.routes[0];
  if (!r) return <Card><p className={`text-sm ${ui.muted}`}>{t('common.wait')}</p></Card>;

  const fmt = (n: number) => money(Number(n), r.currency, lang);
  const loans = Number(r.unsettled_loans ?? 0);
  const fund = r.fund_balance === undefined ? null : Number(r.fund_balance);
  const inHand = Number(r.unsettled_cash) - Number(r.unsettled_expenses) - loans;
  const opening = fund === null ? 0 : fund - inHand;
  const today = r.days?.find((d) => d.day === r.today);
  const dayCollected = Number(today?.cash ?? 0) + Number(today?.digital ?? 0);
  const weekCollected = Number(r.unsettled_cash) + Number(r.unsettled_digital);
  const portfolio = r.customers.reduce((s, c) => s + Number(c.balance), 0);
  const pending = r.customers.filter((c) => !c.paid_today && Number(c.overdue) + Number(c.due_today) > 0.004).length;

  const rows: [string, string, string?][] = [
    ...(r.period?.investments ? [[t('cx.sum.invest'), fmt(Number(r.period.investments))] as [string, string]] : []),
    ...(fund !== null ? [
      [t('cx.sum.prev'), fmt(opening)] as [string, string],
      [t('cx.sum.current'), fmt(fund), fund < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'] as [string, string, string],
    ] : []),
    [`${t('cx.sum.collected')} · ${t('cx.sum.day')}`, fmt(dayCollected)],
    [`${t('cx.sum.collected')} · ${t('cx.sum.week')}`, fmt(weekCollected)],
    [`${t('cx.sum.lent')} · ${t('cx.sum.day')}`, fmt(Number(today?.lent ?? 0)), 'text-violet-600 dark:text-violet-400'],
    [`${t('cx.sum.lent')} · ${t('cx.sum.week')}`, fmt(loans), 'text-violet-600 dark:text-violet-400'],
    [t('cx.sum.expenses'), fmt(Number(r.unsettled_expenses)), 'text-red-600 dark:text-red-400'],
    [t('rt.commission', { pct: Number(r.commission_pct ?? 3) }), fmt(weekCollected * Number(r.commission_pct ?? 3) / 100), 'text-blue-600 dark:text-blue-400'],
    ...(r.can_portfolio ? [[t('cx.sum.portfolio'), fmt(portfolio)] as [string, string]] : []),
  ];

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="min-w-0">
        <h1 className="break-words text-xl font-extrabold">ℹ️ {t('nav.routeInfo')}</h1>
        <p className={`text-sm ${ui.muted}`}>🛵 {r.name} · {r.branch}</p>
        <p className={`text-xs ${ui.muted}`}>{t('col.updated', { time: new Date(day!.generated_at).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' }) })}</p>
      </div>
      {day!.routes.length > 1 && (
        <select value={r.id} onChange={(e) => setRid(e.target.value)} className={ui.input}>
          {day!.routes.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      )}
      <Card className="!p-0">
        <ul className="divide-y divide-slate-200 dark:divide-slate-800">
          {rows.map(([label, value, cls]) => (
            <li key={label} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="min-w-0 text-sm font-semibold">{label}</span>
              <span className={`shrink-0 whitespace-nowrap text-base font-extrabold ${cls ?? ''}`}>{value}</span>
            </li>
          ))}
        </ul>
      </Card>
      <Card className="!p-0">
        <ul className="divide-y divide-slate-200 dark:divide-slate-800">
          <li className="flex items-center justify-between gap-3 px-4 py-3"><span className="text-sm font-semibold">{t('cx.pending')}</span><b>{pending}</b></li>
          <li className="flex items-center justify-between gap-3 px-4 py-3"><span className="text-sm font-semibold">{t('cx.list')}</span><b>{r.customers.length}</b></li>
        </ul>
      </Card>
    </div>
  );
}
