'use client';
import { useEffect, useState } from 'react';
import { rpc } from '../../../lib/supabase';
import { ui } from '../../site-header';
import { useT } from '../../i18n';
import type { DictKey } from '../../i18n/es';
import { IconClose } from '../../icons';

/* ---------- Corte de caja: se cuenta el efectivo, se registran las salidas por rubro y la caja queda cuadrada ---------- */
const CATS: Record<'op_expense' | 'payment_out', string[]> = {
  op_expense: ['fuel', 'food', 'transport', 'phone', 'maintenance', 'stationery', 'other'],
  payment_out: ['collector_pay', 'third_party', 'other'],
};
type Line = { kind: 'op_expense' | 'payment_out'; category: string; amount: string; note: string };

export type Period = { since: string | null; opening: number; investments: number; withdrawals: number; collected_cash: number;
  collected_digital: number; lent: number; collector_expenses: number; expected: number };

export function CutForm({ routeId, routeName, period, m, onCancel, onDone, onError }: {
  routeId: string; routeName: string; period: Period; m: (n: number) => string;
  onCancel: () => void; onDone: (text: string) => void; onError: (text: string) => void;
}) {
  const { t } = useT();
  const p = period;
  const [counted, setCounted] = useState(String(Number(p.expected)));
  const [lines, setLines] = useState<Line[]>([]);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [allow, setAllow] = useState<{ expenses: boolean; pay_out: boolean }>({ expenses: false, pay_out: false });
  useEffect(() => { rpc<{ expenses: boolean; pay_out: boolean }>('route_cut_perms', { p_route: routeId }).then((r) => r && setAllow(r)).catch(() => undefined); }, [routeId]);
  const kinds = (Object.keys(CATS) as Line['kind'][]).filter((k) => (k === 'op_expense' ? allow.expenses : allow.pay_out));
  const num = (x: string) => { const n = Number(x.replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
  const c = num(counted);
  const diff = Number.isNaN(c) ? 0 : Math.round((c - Number(p.expected)) * 100) / 100;
  const out = lines.reduce((a, l) => a + (Number.isNaN(num(l.amount)) ? 0 : num(l.amount)), 0);
  const closing = Number.isNaN(c) ? 0 : Math.round((c - out) * 100) / 100;
  const bad = Number.isNaN(c) || c < 0 || out > c + 0.004 || lines.some((l) => !(num(l.amount) > 0));
  const set = (i: number, patch: Partial<Line>) => setLines(lines.map((l, k) => (k === i ? { ...l, ...patch } : l)));

  const save = async () => {
    setBusy(true);
    try {
      const r = await rpc<{ closing: number; difference: number }>('liquidate_route', {
        p_route: routeId, p_counted: c, p_notes: notes || null,
        p_lines: lines.map((l) => ({ kind: l.kind, category: l.category, amount: num(l.amount), note: l.note || null })),
      });
      onDone(t('liq.done', { amount: m(r.closing) }));
    } catch (e) {
      const msg = (e as Error).message;
      onError(msg.includes('LIQ_OUT_EXCEEDS') ? t('liq.outExceeds') : msg.includes('ROUTE_NO_PERMISSION') ? t('loan.e.perm') : msg);
    } finally { setBusy(false); }
  };

  const row = (label: string, v: number, cls = '') => (
    <li className="flex justify-between"><span>{label}</span><b className={cls}>{m(v)}</b></li>
  );
  return (
    <div className="space-y-3 rounded-xl border-2 border-blue-400 p-3">
      <p className="font-bold">✂️ {t('liq.cut')} · {routeName}</p>
      <ul className="space-y-1 text-sm">
        {row(t('liq.opening'), Number(p.opening))}
        {Number(p.investments) > 0 && row(`+ ${t('fund.t.investment')}`, Number(p.investments))}
        {Number(p.withdrawals) > 0 && row(`− ${t('fund.t.withdrawal')}`, Number(p.withdrawals))}
        {row(`+ ${t('col.cash')}`, Number(p.collected_cash))}
        {row(`− ${t('loan.lent')}`, Number(p.lent), 'text-violet-600 dark:text-violet-400')}
        {row(`− ${t('liq.collectorExp')}`, Number(p.collector_expenses), 'text-red-600 dark:text-red-400')}
        <li className="flex justify-between border-t border-slate-200 pt-1 font-bold dark:border-slate-800"><span>{t('liq.expected')}</span><span>{m(Number(p.expected))}</span></li>
        {Number(p.collected_digital) > 0 && <li className={`flex justify-between text-xs ${ui.muted}`}><span>{t('col.digital')}</span><span>{m(Number(p.collected_digital))}</span></li>}
      </ul>
      <label className="block">
        <span className={ui.label}>{t('liq.counted')}</span>
        <input inputMode="decimal" value={counted} onChange={(e) => setCounted(e.target.value)} className={`${ui.input} text-xl font-bold`} />
      </label>
      {diff !== 0 && !Number.isNaN(c) && (
        <p className={`text-sm font-bold ${diff < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
          {diff < 0 ? t('liq.shortage', { amount: m(-diff) }) : t('liq.surplus', { amount: m(diff) })}
        </p>
      )}

      <div className="space-y-2">
        <p className="text-sm font-bold">{t('liq.outs')}</p>
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-2 sm:grid-cols-[9rem_1fr_7rem_1fr_auto] dark:bg-slate-800/50">
            <select value={l.kind} onChange={(e) => { const kind = e.target.value as Line['kind']; set(i, { kind, category: CATS[kind][0] }); }} className={ui.input}>
              {kinds.map((k) => <option key={k} value={k}>{t(`liq.k.${k}` as DictKey)}</option>)}
            </select>
            <select value={l.category} onChange={(e) => set(i, { category: e.target.value })} className={ui.input}>
              {CATS[l.kind].map((cat) => <option key={cat} value={cat}>{t(`liq.c.${cat}` as DictKey)}</option>)}
            </select>
            <input inputMode="decimal" placeholder={t('cash.amount')} value={l.amount} onChange={(e) => set(i, { amount: e.target.value })} className={ui.input} />
            <input placeholder={t('cust.notes')} value={l.note} onChange={(e) => set(i, { note: e.target.value })} className={ui.input} />
            <button type="button" onClick={() => setLines(lines.filter((_, k) => k !== i))} className="text-sm font-bold text-red-600 cursor-pointer" aria-label="✕"><IconClose /></button>
          </div>
        ))}
        {kinds.length > 0 && <button type="button" onClick={() => setLines([...lines, { kind: kinds[0], category: CATS[kinds[0]][0], amount: '', note: '' }])} className={`${ui.btnGhost} !py-1.5 text-xs`}>➕ {t('liq.addLine')}</button>}
      </div>

      <input placeholder={t('liq.notes')} value={notes} onChange={(e) => setNotes(e.target.value)} className={ui.input} />
      <ul className="space-y-1 rounded-lg bg-slate-50 p-2 text-sm dark:bg-slate-800/50">
        {row(t('liq.counted'), Number.isNaN(c) ? 0 : c)}
        {row(`− ${t('liq.outs')}`, out)}
        <li className="flex justify-between border-t border-slate-200 pt-1 text-base font-extrabold dark:border-slate-700"><span>💼 {t('liq.closing')}</span><span>{m(closing)}</span></li>
      </ul>
      {out > c + 0.004 && <p className="text-sm font-semibold text-red-600 dark:text-red-400">{t('liq.outExceeds')}</p>}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={onCancel} className={ui.btnGhost}>{t('card.cancel')}</button>
        <button type="button" disabled={bad || busy} onClick={save} className={ui.btnPrimary}>✂️ {t('liq.save')}</button>
      </div>
    </div>
  );
}
