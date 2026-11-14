'use client';
import { ui } from '../../site-header';
import { useT } from '../../i18n';

export type DayRow = { day: string; cash: number; digital: number; payments: number; lent: number; expenses: number; cut_at: string | null };

/* ---------- Cobrado y prestado por día, y total de la semana / desde la liquidación ---------- */
export function DaysTable({ days, fmt }: { days: DayRow[]; fmt: (n: number) => string }) {
  const { t, lang } = useT();
  const tot = days.reduce((a, d) => ({ cash: a.cash + Number(d.cash), lent: a.lent + Number(d.lent), exp: a.exp + Number(d.expenses) }), { cash: 0, lent: 0, exp: 0 });
  const week = days.slice(0, 7).reduce((a, d) => ({ cash: a.cash + Number(d.cash), lent: a.lent + Number(d.lent) }), { cash: 0, lent: 0 });
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className={`text-left text-[11px] uppercase ${ui.muted}`}>
          <th className="py-1">{t('day.date')}</th><th className="py-1 text-end">{t('col.cash')}</th><th className="py-1 text-end">{t('loan.lent')}</th><th className="py-1 text-end">{t('col.expenses')}</th>
        </tr></thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {days.map((d) => (
            <tr key={d.day}>
              <td className="py-1 capitalize">{new Date(d.day + 'T12:00:00').toLocaleDateString(lang, { weekday: 'short', day: '2-digit', month: '2-digit' })}</td>
              <td className="py-1 text-end font-semibold">{fmt(d.cash)}</td>
              <td className="py-1 text-end font-semibold text-violet-600 dark:text-violet-400">{fmt(d.lent)}</td>
              <td className="py-1 text-end text-red-600 dark:text-red-400">{fmt(d.expenses)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="text-sm font-extrabold">
          <tr className="border-t border-slate-300 dark:border-slate-700"><td className="py-1">{t('day.week')}</td><td className="py-1 text-end">{fmt(week.cash)}</td><td className="py-1 text-end">{fmt(week.lent)}</td><td /></tr>
          <tr><td className="py-1">{t('day.sinceLiqShort')}</td><td className="py-1 text-end">{fmt(tot.cash)}</td><td className="py-1 text-end">{fmt(tot.lent)}</td><td className="py-1 text-end">{fmt(tot.exp)}</td></tr>
        </tfoot>
      </table>
    </div>
  );
}

