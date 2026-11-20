'use client';
import { useMemo, useState } from 'react';
import { ui } from '../../site-header';
import { useT } from '../../i18n';
import type { DictKey } from '../../i18n/es';
import { parseAmount } from '../format';

/* ------------------------------------------------------------------
 * Tarjeta de cobro: una casilla por cuota, numeradas del 1 al total elegido al dar el crédito.
 *  - Se marcan en orden: tocar una casilla selecciona desde la primera pendiente hasta ella.
 *  - Abono: un monto libre que llena las casillas en orden; la que queda a medias guarda lo abonado
 *    y se completa con el siguiente pago.
 *  - Cada casilla pagada muestra su número y la fecha en que se completó.
 * ------------------------------------------------------------------ */
export type Inst = { id: string; n: number; due: string; amount: number; paid: number; last_at: string | null };
export type Credit = { id: string; created: string; total: number; every_days: number | null; installments: Inst[] };
export type Freq = 'daily' | 'weekly' | 'biweekly' | 'monthly';
export type Method = 'cash' | 'qr_transfer' | 'card';

export const freqOf = (c: Credit): Freq => {
  const d = c.every_days ?? 30;
  return d <= 3 ? 'daily' : d <= 10 ? 'weekly' : d <= 20 ? 'biweekly' : 'monthly';
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const bal = (i: Inst) => r2(Number(i.amount) - Number(i.paid));

/** Reparte un pago en las cuotas, en orden (igual que el servidor) */
export function applyPayment(c: Credit, amount: number, at: string): Credit {
  let left = amount;
  const installments = [...c.installments].sort((a, b) => a.n - b.n).map((i) => {
    const b = bal(i);
    if (left <= 0 || b <= 0) return i;
    const take = Math.min(left, b);
    left = r2(left - take);
    return { ...i, paid: r2(Number(i.paid) + take), last_at: at };
  });
  return { ...c, installments };
}

export function CreditCard({ credit, today, fmt, onSave, readOnly = false, onReverse }: {
  credit: Credit; today: string; fmt: (n: number) => string;
  onSave: (amount: number, method: Method) => void; readOnly?: boolean;
  /** Borrar cuota = revertir un cobro ya hecho; solo si quien mira tiene ese permiso */
  onReverse?: (n: number) => Promise<void> | void;
}) {
  const { t, lang } = useT();
  const list = useMemo(() => [...credit.installments].sort((a, b) => a.n - b.n), [credit]);
  const firstOpen = list.findIndex((i) => bal(i) > 0);
  const [upTo, setUpTo] = useState(-1);          // índice de la última casilla seleccionada
  const [abono, setAbono] = useState<string | null>(null);
  const [method, setMethod] = useState<Method>('cash');
  const [revN, setRevN] = useState<number | null>(null);
  const [revBusy, setRevBusy] = useState(false);

  const open = list.reduce((s, i) => s + Math.max(0, bal(i)), 0);
  const paidCount = list.filter((i) => bal(i) <= 0).length;
  const selAmount = upTo >= firstOpen && firstOpen >= 0 ? r2(list.slice(firstOpen, upTo + 1).reduce((s, i) => s + bal(i), 0)) : 0;
  const abonoN = abono === null ? NaN : parseAmount(abono);
  const amount = abono !== null ? (Number.isNaN(abonoN) ? 0 : r2(abonoN)) : selAmount;
  const invalid = amount <= 0 || amount > r2(open);
  const preview = useMemo(() => (abono !== null && !invalid ? applyPayment(credit, amount, '') : null), [abono, invalid, credit, amount]);

  const tap = (idx: number) => {
    if (readOnly || firstOpen < 0 || idx < firstOpen) return;
    setAbono(null);
    setUpTo((u) => (u === idx ? idx - 1 : idx)); // tocar la última seleccionada la quita
  };
  const reset = () => { setUpTo(-1); setAbono(null); };
  const short = (s: string) => new Date(s.length === 10 ? s + 'T12:00:00' : s).toLocaleDateString(lang, { day: '2-digit', month: '2-digit' });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="rounded-full bg-slate-100 px-2 py-0.5 font-bold dark:bg-slate-800">{t(`card.f.${freqOf(credit)}` as DictKey)}</span>
        <span className={ui.muted}>{t('card.progress', { done: paidCount, total: list.length })} · {t('card.owes', { amount: fmt(open) })}</span>
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(3.4rem,1fr))] gap-1.5">
        {list.map((i, idx) => {
          const pv = preview?.installments.find((x) => x.id === i.id);
          const paid = pv ? Number(pv.paid) : Number(i.paid);
          const full = paid >= Number(i.amount) - 0.004;
          const was = bal(i) <= 0;
          const partial = !full && paid > 0;
          const selected = abono === null && firstOpen >= 0 && idx >= firstOpen && idx <= upTo;
          const willFill = !!pv && !was && (full || paid > Number(i.paid));
          const late = !was && i.due < today;
          const cls = was ? 'border-emerald-400 bg-emerald-500 text-white'
            : selected || willFill ? 'border-blue-500 bg-blue-600 text-white'
            : partial ? 'border-amber-400 bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300'
            : late ? 'border-red-400 bg-white text-red-600 dark:bg-slate-900 dark:text-red-400'
            : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900';
          return (
            <button key={i.id} type="button" onClick={() => (was ? setRevN((v) => (v === i.n ? null : i.n)) : tap(idx))} disabled={was && !onReverse}
              title={`${t('card.inst', { n: i.n })} · ${fmt(Number(i.amount))}`}
              className={`relative flex aspect-square flex-col items-center justify-center overflow-hidden rounded-lg border-2 text-center leading-tight transition cursor-pointer disabled:cursor-default ${cls}`}>
              {partial && !selected && !willFill && (
                <span className="absolute inset-x-0 bottom-0 bg-amber-300/60" style={{ height: `${(paid / Number(i.amount)) * 100}%` }} />
              )}
              <span className="relative text-sm font-extrabold">{i.n}</span>
              <span className="relative text-[9px] font-semibold opacity-90">
                {was && i.last_at ? short(i.last_at) : partial && !willFill ? fmt(paid) : short(i.due)}
              </span>
            </button>
          );
        })}
      </div>

      {onReverse && revN !== null && (
        <div className="space-y-2 rounded-xl border border-red-300 bg-red-50 p-3 text-sm dark:border-red-500/30 dark:bg-red-500/10">
          <p className="font-semibold text-red-700 dark:text-red-300">{t('card.delInstHint', { n: revN })}</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled={revBusy} onClick={() => setRevN(null)} className={`${ui.btnGhost} !py-2 text-xs`}>✕ {t('card.cancel')}</button>
            <button type="button" disabled={revBusy}
              onClick={async () => { setRevBusy(true); try { await onReverse(revN); } finally { setRevBusy(false); setRevN(null); } }}
              className="rounded-xl bg-red-600 px-3 py-2 text-xs font-bold text-white cursor-pointer disabled:opacity-50">🗑️ {t('card.delInst', { n: revN })}</button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-3 text-[11px] text-slate-500">
        <span>🟩 {t('card.legPaid')}</span><span>🟦 {t('card.legSel')}</span><span>🟨 {t('card.legPartial')}</span><span className="text-red-500">▢ {t('card.legLate')}</span>
      </div>

      {!readOnly && abono !== null && (
        <div>
          <label className={ui.label}>{t('card.abonoAmount')}</label>
          <input inputMode="decimal" autoFocus value={abono} onChange={(e) => setAbono(e.target.value)} className={`${ui.input} text-xl font-bold`} />
          {amount > r2(open) && <p className="mt-1 text-sm font-semibold text-red-600 dark:text-red-400">{t('cash.exceeds')}</p>}
          <p className={`mt-1 text-xs ${ui.muted}`}>{t('card.abonoHint')}</p>
        </div>
      )}

      {!readOnly && (amount > 0 || abono !== null) && (
        <div className="grid grid-cols-3 gap-2">
          {(['cash', 'qr_transfer', 'card'] as Method[]).map((m) => (
            <button key={m} type="button" onClick={() => setMethod(m)}
              className={`rounded-xl px-2 py-2 text-xs font-bold transition cursor-pointer ${method === m ? 'bg-blue-600 text-white' : 'border border-slate-300 dark:border-slate-700'}`}>
              {t(`cash.m.${m}` as DictKey)}
            </button>
          ))}
        </div>
      )}

      {!readOnly && <div className="grid grid-cols-3 gap-2">
        <button type="button" disabled={firstOpen < 0} onClick={() => { setUpTo(-1); setAbono(abono === null ? '' : null); }}
          className={`${ui.btnGhost} !px-2 text-sm`}>➗ {t('card.abono')}</button>
        <button type="button" disabled={amount <= 0 && abono === null} onClick={reset} className={`${ui.btnGhost} !px-2 text-sm`}>✕ {t('card.cancel')}</button>
        <button type="button" disabled={invalid} onClick={() => { onSave(amount, method); reset(); }}
          className={`${ui.btnPrimary} !px-2 text-sm`}>💾 {t('card.save')}{invalid ? '' : ` ${fmt(amount)}`}</button>
      </div>}
    </div>
  );
}
