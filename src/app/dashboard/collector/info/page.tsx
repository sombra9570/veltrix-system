'use client';
import { useEffect, useMemo, useState } from 'react';
import { rpc } from '../../../../lib/supabase';
import { Card } from '../../shell';
import { ui } from '../../../site-header';
import { useT } from '../../../i18n';
import { money } from '../../format';
import { useStaff } from '../../staff-context';
import { PageTitle, Pill, Empty } from '../../kit';

/* Información de la ruta: cifras del período abierto (desde el último cierre o liquidación hasta el próximo).
   Lee lo guardado en el teléfono (sirve sin internet) y se actualiza si hay señal. */
type Row = [number, string, number, number, string | null];
// Según de dónde vengan los datos (servidor o lo guardado por la pantalla de cobro) las cuotas llegan como `i` o como `installments`
type Credit = { id: string; total: number; every_days: number | null; i?: Row[]; installments?: { n: number; due: string; amount: number; paid: number; last_at: string | null }[] };
const rowsOf = (k: Credit): Row[] => k.i ?? (k.installments ?? []).map((x) => [x.n, x.due, Number(x.amount), Number(x.paid), x.last_at] as Row);
type Cust = { id: string; name: string; balance: number; credits?: Credit[] };
type R = {
  id: string; name: string; branch: string; currency: string; today: string;
  unsettled_cash: number; unsettled_digital: number; unsettled_expenses: number; unsettled_loans?: number;
  fund_balance?: number; commission_pct?: number; period?: { investments: number };
  customers: Cust[];
};
type D = { generated_at: string; routes: R[] };
type Split = Record<string, { daily: { collected: number; lent: number }; weekly: { collected: number; lent: number } }>;
type Freq = 'daily' | 'weekly';

// Diario = se paga cada 1 a 3 días; semanal = el resto (misma regla que usa la base de datos)
const freqOf = (c: Credit): Freq => ((c.every_days ?? 7) <= 3 ? 'daily' : 'weekly');
const left = (row: Row) => Math.max(Number(row[2]) - Number(row[3]), 0);

export default function RouteInfoPage() {
  const { t, lang } = useT();
  const { userId } = useStaff();
  const [day, setDay] = useState<D | null>(null);
  const [split, setSplit] = useState<Split>({});
  const [rid, setRid] = useState('');
  const [freq, setFreq] = useState<Freq>('daily');
  const [open, setOpen] = useState<'clients' | 'credits' | null>(null);

  useEffect(() => {
    try {
      const d = JSON.parse(localStorage.getItem(`vx_collector_day_${userId}`) ?? 'null') as D | null;
      if (d) { setDay(d); setRid(d.routes[0]?.id ?? ''); }
      const s = JSON.parse(localStorage.getItem(`vx_collector_split_${userId}`) ?? 'null') as Split | null;
      if (s) setSplit(s);
    } catch { /* sin datos guardados */ }
    rpc<D>('collector_day').then((d) => { setDay(d); setRid((r) => r || d.routes[0]?.id || ''); }).catch(() => undefined);
    rpc<Split>('collector_info').then((s) => {
      setSplit(s);
      try { localStorage.setItem(`vx_collector_split_${userId}`, JSON.stringify(s)); } catch { /* sin espacio */ }
    }).catch(() => undefined);
  }, [userId]);

  const r = day?.routes.find((x) => x.id === rid) ?? day?.routes[0];

  // Clientes con créditos del tipo elegido, y esos créditos
  const { clients, credits } = useMemo(() => {
    const cl: { id: string; name: string; balance: number; overdue: number }[] = [];
    const cr: { id: string; name: string; total: number; paid: number; count: number; balance: number; next: string | null }[] = [];
    if (!r) return { clients: cl, credits: cr };
    for (const c of r.customers) {
      let balance = 0; let overdue = 0; let any = false;
      for (const k of c.credits ?? []) {
        if (freqOf(k) !== freq) continue;
        any = true;
        const rows = rowsOf(k);
        const bal = rows.reduce((s, x) => s + left(x), 0);
        balance += bal;
        overdue += rows.filter((x) => x[1] < r.today).reduce((s, x) => s + left(x), 0);
        const next = rows.find((x) => left(x) > 0.004)?.[1] ?? null;
        cr.push({ id: k.id, name: c.name, total: Number(k.total), paid: rows.filter((x) => left(x) <= 0.004).length, count: rows.length, balance: bal, next });
      }
      if (any) cl.push({ id: c.id, name: c.name, balance, overdue });
    }
    cl.sort((a, b) => b.overdue - a.overdue || a.name.localeCompare(b.name));
    return { clients: cl, credits: cr };
  }, [r, freq]);

  if (!r) return <Card><p className={`text-sm ${ui.muted}`}>{t('common.wait')}</p></Card>;

  const fmt = (n: number) => money(Number(n), r.currency, lang);
  const sp = split[r.id]?.[freq] ?? { collected: 0, lent: 0 };
  const loans = Number(r.unsettled_loans ?? 0);
  const fund = r.fund_balance === undefined ? null : Number(r.fund_balance);
  const inHand = Number(r.unsettled_cash) - Number(r.unsettled_expenses) - loans;
  const opening = fund === null ? 0 : fund - inHand;
  const pct = Number(r.commission_pct ?? 3);

  const rows: [string, string, string?][] = [
    ...(r.period?.investments ? [[t('cx.sum.invest'), fmt(Number(r.period.investments))] as [string, string]] : []),
    ...(fund !== null ? [[t('cx.sum.prev'), fmt(opening)] as [string, string]] : []),
    [t('cx.sum.collected'), fmt(sp.collected)],
    [t('cx.sum.lent'), fmt(sp.lent), 'text-violet-600 dark:text-violet-400'],
    [t('cx.sum.expenses'), fmt(Number(r.unsettled_expenses)), 'text-red-600 dark:text-red-400'],
    [t('rt.commission', { pct }), fmt(sp.collected * pct / 100), 'text-blue-600 dark:text-blue-400'],
  ];
  const date = (s: string) => new Date(`${s}T12:00:00`).toLocaleDateString(lang, { day: 'numeric', month: 'short' });

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <PageTitle title={`ℹ️ ${t('nav.routeInfo')}`} subtitle={`🛵 ${r.name} · ${r.branch}`} />
      <p className={`-mt-2 text-xs ${ui.muted}`}>
        {t('info.period')} · {t('col.updated', { time: new Date(day!.generated_at).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' }) })}
      </p>
      {day!.routes.length > 1 && (
        <select value={r.id} onChange={(e) => setRid(e.target.value)} className={ui.input}>
          {day!.routes.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      )}

      <div className="grid grid-cols-2 gap-2">
        {(['daily', 'weekly'] as Freq[]).map((f) => (
          <button key={f} type="button" onClick={() => setFreq(f)} aria-pressed={freq === f} className={freq === f ? ui.btnPrimary : ui.btnGhost}>
            {t(f === 'daily' ? 'card.f.daily' : 'card.f.weekly')}
          </button>
        ))}
      </div>

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
      <p className={`text-xs ${ui.muted}`}>{t('info.note')}</p>

      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setOpen(open === 'clients' ? null : 'clients')} aria-expanded={open === 'clients'} className={open === 'clients' ? ui.btnPrimary : ui.btnGhost}>
          👥 {t('info.clients')} ({clients.length})
        </button>
        <button type="button" onClick={() => setOpen(open === 'credits' ? null : 'credits')} aria-expanded={open === 'credits'} className={open === 'credits' ? ui.btnPrimary : ui.btnGhost}>
          💳 {t('info.credits')} ({credits.length})
        </button>
      </div>

      {open === 'clients' && (clients.length === 0 ? <Empty icon="👥" title={t('info.noClients')} /> : (
        <Card className="!p-0">
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {clients.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">{c.name}</p>
                  <p className={`text-xs ${ui.muted}`}>{t('info.balance')}: {fmt(c.balance)}</p>
                </div>
                {c.overdue > 0.004 && <Pill tone="error">{t('rep.overdue')} {fmt(c.overdue)}</Pill>}
              </li>
            ))}
          </ul>
        </Card>
      ))}

      {open === 'credits' && (credits.length === 0 ? <Empty icon="💳" title={t('info.noCredits')} /> : (
        <Card className="!p-0">
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {credits.map((c) => (
              <li key={c.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="min-w-0 truncate text-sm font-bold">{c.name}</p>
                  <span className="shrink-0 text-sm font-extrabold">{fmt(c.total)}</span>
                </div>
                <p className={`text-xs ${ui.muted}`}>
                  {t('info.paidOf', { a: c.paid, b: c.count })} · {t('info.balance')}: {fmt(c.balance)}{c.next ? ` · ${t('info.next', { date: date(c.next) })}` : ''}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}
