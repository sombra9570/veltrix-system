'use client';
import { useT } from '../../i18n';
import type { DictKey } from '../../i18n/es';
import { ui } from '../../site-header';
import { CreditCard, freqOf, type Credit, type Freq, type Method } from './credit-card';
import type { LoanPolicy } from './loan-form';

export function Credits({ only, c, filter, today, policy, fmt, onSave, locked = false, onReverse }: {
  only?: string; locked?: boolean; onReverse?: (order: string, ns: number[]) => Promise<void> | void;
  c: { credits?: Credit[] }; filter: Freq | 'all'; today: string; policy?: LoanPolicy; fmt: (n: number) => string;
  onSave: (order: string, amount: number, method: Method) => void;
}) {
  const { t, lang } = useT();
  const all = c.credits ?? [];
  const list = all.filter((k) => (only ? k.id === only : filter === 'all' || freqOf(k) === filter));
  if (all.length === 0) return <p className={`text-xs ${ui.muted}`}>{t('card.noCards')}</p>;
  return (
    <div className="space-y-4">
      {list.map((k) => {
        // Atraso contado desde las fechas del crédito: borde rojo al llegar al tope de su frecuencia
        const late = k.installments.filter((i) => i.due < today && Number(i.amount) - Number(i.paid) > 0.004).length;
        const f = freqOf(k);
        const limit = Number((policy as Record<string, number> | undefined)?.[`late_${f}`] ?? ({ daily: 10, weekly: 2, biweekly: 1, monthly: 1 })[f]);
        const border = late >= limit && limit > 0 ? 'border-4 border-red-500' : late > 0 ? 'border-2 border-amber-400' : 'border border-slate-200 dark:border-slate-800';
        return (
        <div key={k.id} className={`space-y-2 rounded-xl p-3 ${border}`}>
          {late > 0 && (
            <p className={`text-xs font-bold ${late >= limit ? 'text-red-600 dark:text-red-400' : 'text-amber-700 dark:text-amber-300'}`}>
              {late >= limit ? '🚨' : '⚠️'} {t('card.lateN', { n: late })}
            </p>
          )}
          {all.length > 1 && (
            <p className="text-xs font-bold">💳 {t('card.creditN', { n: all.indexOf(k) + 1, total: all.length })}</p>
          )}
          {/* Encabezado como la tarjeta de papel: fecha, valor de cada cuota y total */}
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-lg bg-slate-50 px-3 py-2 text-xs dark:bg-slate-800/50">
            <p><span className={ui.muted}>{t('card.hDate')}: </span><span className="font-bold">{new Date(k.created).toLocaleDateString(lang)}</span></p>
            <p className="text-right"><span className={ui.muted}>{t('card.hValue')}: </span><span className="font-bold">{fmt(Number(k.installments[0]?.amount ?? 0))}</span></p>
            <p className="col-span-2"><span className={ui.muted}>{t('loan.count')}: </span><span className="font-bold">{k.installments.length}</span><span className={ui.muted}> · {t(`card.f.${f}` as DictKey)} · </span><span className="font-bold">{fmt(Number(k.total))}</span></p>
          </div>
          <CreditCard credit={k} today={today} fmt={fmt} readOnly={locked} onReverse={onReverse ? (ns) => onReverse(k.id, ns) : undefined} onSave={(amount, method) => onSave(k.id, amount, method)} />
        </div>
        );
      })}
    </div>
  );
}

