'use client';
import { useState, type ReactNode } from 'react';
import { rpc } from '../../../../lib/supabase';
import { Card } from '../../shell';
import { ui } from '../../../site-header';
import { useT } from '../../../i18n';
import type { DictKey } from '../../../i18n/es';
import { money } from '../../format';
import { RATING_DOT } from '../../collector/loan-form';
import { useBoard, type SLoan } from '../board';

const freqKey = (d: number) => (d <= 3 ? 'daily' : d <= 10 ? 'weekly' : d <= 20 ? 'biweekly' : 'monthly');

// Préstamos de las sucursales del supervisor: aprueba o rechaza si el administrador le dio el permiso.
export default function SupervisorLoans() {
  const { t, lang } = useT();
  const { board, error, load } = useBoard();
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (!board) return <Card><p className={`text-sm ${ui.muted}`}>{error || t('common.wait')}</p></Card>;
  const canApprove = (l: SLoan) => board.branches.find((b) => b.id === l.branch_id)?.can_approve;
  const pending = board.loans.filter((l) => l.approval === 'pending_supervisor' && l.status === 'confirmed');
  const others = board.loans.filter((l) => !(l.approval === 'pending_supervisor' && l.status === 'confirmed'));

  const decide = async (l: SLoan, ok: boolean) => {
    setBusy(l.order_id); setMsg(null);
    try {
      await rpc('decide_street_loan', { p_order: l.order_id, p_approve: ok, p_reason: ok ? null : t('cust.rejected') });
      setMsg({ ok: true, text: ok ? t('loan.approved') : t('loan.rejected') }); await load();
    } catch (e) {
      const m = (e as Error).message;
      setMsg({ ok: false, text: m.includes('ROUTE_NO_PERMISSION') ? t('loan.e.perm') : t('err.generic') });
    } finally { setBusy(''); }
  };

  const reschedule = async (order: string) => {
    const d = Number(window.prompt(t('loan.reschedulePrompt'), '7'));
    if (!Number.isInteger(d) || d < 1) return;
    setBusy(order); setMsg(null);
    try { const n = await rpc<number>('reschedule_loan', { p_order: order, p_days: d }); setMsg({ ok: true, text: t('loan.rescheduled', { n, days: d }) }); await load(); }
    catch (e) { const m = (e as Error).message; setMsg({ ok: false, text: m.includes('LOAN_NO_PERMISSION') ? t('loan.e.perm') : t('err.generic') }); }
    finally { setBusy(''); }
  };

  const row = (l: SLoan, actions?: ReactNode) => {
    const fmt = (n: number) => money(Number(n), l.currency, lang);
    return (
      <li key={l.order_id} className="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 font-bold"><span className={`inline-block h-2.5 w-2.5 rounded-full ${RATING_DOT[l.rating] ?? RATING_DOT.new}`} title={t(`rating.${l.rating}` as DictKey)} />{l.customer}</p>
            <p className={`text-xs ${ui.muted}`}>🛵 {l.route ?? '—'} · {l.collector ?? '—'} · {l.branch} · {new Date(l.created_at).toLocaleDateString(lang)}</p>
          </div>
          <div className="text-end">
            <p className="font-extrabold">{fmt(l.principal)} <span className={`text-xs font-semibold ${ui.muted}`}>+{Number(l.interest)} %</span></p>
            <p className={`text-xs ${ui.muted}`}>{l.installments} × {t(`card.f.${freqKey(l.every_days)}` as DictKey)} · {t('loan.total')} {fmt(l.total)}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 text-[11px] font-bold">
          {l.status === 'cancelled' ? <span className="rounded-full bg-slate-200 px-2 py-0.5 dark:bg-slate-800">{t('loan.st.cancelled')}</span>
            : l.approval === 'rejected' ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-700 dark:bg-red-500/15 dark:text-red-300">{t('loan.st.rejected')}</span>
            : l.approval === 'pending_supervisor' ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">{t('loan.st.pending')}</span>
            : Number(l.balance) <= 0 ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">{t('loan.st.paid')}</span>
            : <span className="rounded-full bg-blue-100 px-2 py-0.5 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">{t('loan.st.active', { amount: fmt(l.balance) })}</span>}
          {l.reasons.map((x) => <span key={x} className="rounded-full border border-amber-300 px-2 py-0.5 text-amber-700 dark:text-amber-300">{t(`loan.r.${x}` as DictKey)}</span>)}
        </div>
        {actions}
      </li>
    );
  };

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-extrabold sm:text-2xl">💸 {t('nav.loans')}</h1>
      {msg && <p className={`rounded-xl border p-3 text-sm font-semibold ${msg.ok ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300' : 'border-red-300 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400'}`}>{msg.text}</p>}
      {pending.length > 0 && (
        <Card className="space-y-3">
          <h2 className="font-bold">⏳ {t('loan.toApprove', { n: pending.length })}</h2>
          <ul className="space-y-2">
            {pending.map((l) => row(l, canApprove(l) ? (
              <div className="grid grid-cols-2 gap-2">
                <button type="button" disabled={busy === l.order_id} onClick={() => decide(l, false)} className={`${ui.btnGhost} !py-2 text-sm`}>✕ {t('loan.reject')}</button>
                <button type="button" disabled={busy === l.order_id} onClick={() => decide(l, true)} className={`${ui.btnPrimary} !py-2 text-sm`}>✓ {t('loan.approve')}</button>
              </div>
            ) : <p className={`text-[11px] ${ui.muted}`}>🔒 {t('sup.noApprove')}</p>))}
          </ul>
        </Card>
      )}
      <Card className="space-y-3">
        <h2 className="font-bold">📒 {t('loan.list')}</h2>
        {others.length === 0 ? <p className={`text-sm ${ui.muted}`}>{t('loan.none')}</p> : <ul className="space-y-2">{others.map((l) => row(l,
          l.status === 'confirmed' && l.approval !== 'rejected' && Number(l.balance) > 0 ? (
            <button type="button" disabled={busy === l.order_id} onClick={() => reschedule(l.order_id)} className="text-xs font-bold text-blue-600 cursor-pointer dark:text-blue-400">📅 {t('loan.reschedule')}</button>
          ) : undefined))}</ul>}
      </Card>
    </div>
  );
}
