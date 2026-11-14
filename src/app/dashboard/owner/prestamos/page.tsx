'use client';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { rpc } from '../../../../lib/supabase';
import { Card } from '../../shell';
import { ui } from '../../../site-header';
import { useT } from '../../../i18n';
import type { DictKey } from '../../../i18n/es';
import { money } from '../../format';
import { useOwner, friendlyError } from '../owner-context';
import { RATING_DOT } from '../../collector/loan-form';

// Préstamos en calle: reglas que fija el administrador, aprobaciones pendientes y préstamos de las rutas.
type Policy = Record<string, number>;
type Loan = {
  order_id: string; created_at: string; customer: string; route: string | null; collector: string | null; branch: string; currency: string;
  principal: number; interest: number; total: number; installments: number; every_days: number; first_due: string;
  reasons: string[]; approval: string; status: string; balance: number; paid_any: boolean; rating: string;
};
const FIELDS: [string, string][] = [
  ['interest_default', 'loan.p.interestDefault'], ['interest_min', 'loan.p.interestMin'], ['interest_max', 'loan.p.interestMax'],
  ['max_installments', 'loan.p.maxInstallments'], ['max_amount_customer', 'loan.p.maxAmount'], ['max_active_loans_customer', 'loan.p.maxActive'],
  ['max_customers_collector', 'loan.p.maxCustomers'], ['max_daily_lent_collector', 'loan.p.maxDaily'],
];
const LATE: [string, string][] = [['late_daily', 'card.f.daily'], ['late_weekly', 'card.f.weekly'], ['late_biweekly', 'card.f.biweekly'], ['late_monthly', 'card.f.monthly']];
const freqKey = (d: number) => (d <= 3 ? 'daily' : d <= 10 ? 'weekly' : d <= 20 ? 'biweekly' : 'monthly');

export default function LoansPage() {
  const { orgId } = useOwner();
  const { t, lang } = useT();
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [loans, setLoans] = useState<Loan[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    if (!orgId) return;
    try {
      const r = await rpc<{ policy: Policy; loans: Loan[] }>('loans_admin', { p_org: orgId });
      setPolicy(r.policy); setLoans(r.loans ?? []);
    } catch (e) { setMsg({ ok: false, text: friendlyError((e as Error).message, t) }); }
  }, [orgId, t]);
  useEffect(() => { load(); }, [load]);

  const val = (k: string) => edit[k] ?? String(policy?.[k] ?? '');
  const savePolicy = async () => {
    setBusy('policy'); setMsg(null);
    try {
      const body: Record<string, number> = {};
      for (const [k] of [...FIELDS, ...LATE]) body[k] = Number(val(k).replace(',', '.'));
      setPolicy(await rpc<Policy>('set_loan_policy', { p_org: orgId, p_policy: body }));
      setEdit({}); setMsg({ ok: true, text: t('loan.p.saved') });
    } catch (e) {
      const m = (e as Error).message;
      setMsg({ ok: false, text: m.includes('LOAN_POLICY_INVALID') ? t('loan.p.invalid') : friendlyError(m, t) });
    } finally { setBusy(''); }
  };
  const decide = async (l: Loan, ok: boolean) => {
    setBusy(l.order_id); setMsg(null);
    try { await rpc('decide_credit', { p_order: l.order_id, p_approve: ok, p_reason: ok ? null : t('cust.rejected') }); await load();
      setMsg({ ok: true, text: ok ? t('loan.approved') : t('loan.rejected') });
    } catch (e) { setMsg({ ok: false, text: friendlyError((e as Error).message, t) }); } finally { setBusy(''); }
  };
  const cancel = async (l: Loan) => {
    if (!window.confirm(t('loan.cancelConfirm', { name: l.customer }))) return;
    setBusy(l.order_id); setMsg(null);
    try { await rpc('cancel_street_loan', { p_order: l.order_id }); await load(); setMsg({ ok: true, text: t('loan.cancelled') }); }
    catch (e) { setMsg({ ok: false, text: friendlyError((e as Error).message, t) }); } finally { setBusy(''); }
  };

  const pending = loans.filter((l) => l.approval === 'pending_supervisor' && l.status === 'confirmed');
  const others = loans.filter((l) => !(l.approval === 'pending_supervisor' && l.status === 'confirmed'));
  const fmt = (l: Loan, n: number) => money(Number(n), l.currency, lang);

  const row = (l: Loan, actions: ReactNode) => (
    <li key={l.order_id} className="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 font-bold">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${RATING_DOT[l.rating] ?? RATING_DOT.new}`} title={t(`rating.${l.rating}` as DictKey)} />{l.customer}
          </p>
          <p className={`text-xs ${ui.muted}`}>🛵 {l.route ?? '—'} · {l.collector ?? '—'} · {l.branch} · {new Date(l.created_at).toLocaleDateString(lang)}</p>
        </div>
        <div className="text-end">
          <p className="font-extrabold">{fmt(l, l.principal)} <span className={`text-xs font-semibold ${ui.muted}`}>+{Number(l.interest)} %</span></p>
          <p className={`text-xs ${ui.muted}`}>{l.installments} × {t(`card.f.${freqKey(l.every_days)}` as DictKey)} · {t('loan.total')} {fmt(l, l.total)}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
        {l.status === 'cancelled' ? <span className="rounded-full bg-slate-200 px-2 py-0.5 dark:bg-slate-800">{t('loan.st.cancelled')}</span>
          : l.approval === 'rejected' ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-700 dark:bg-red-500/15 dark:text-red-300">{t('loan.st.rejected')}</span>
          : l.approval === 'pending_supervisor' ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">{t('loan.st.pending')}</span>
          : Number(l.balance) <= 0 ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">{t('loan.st.paid')}</span>
          : <span className="rounded-full bg-blue-100 px-2 py-0.5 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">{t('loan.st.active', { amount: fmt(l, l.balance) })}</span>}
        {l.reasons.map((r) => <span key={r} className="rounded-full border border-amber-300 px-2 py-0.5 text-amber-700 dark:text-amber-300">{t(`loan.r.${r}` as DictKey)}</span>)}
      </div>
      {actions}
    </li>
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold sm:text-2xl">💸 {t('nav.loans')}</h1>
        <p className={`text-sm ${ui.muted}`}>{t('loan.subtitle')}</p>
      </div>
      {msg && <p className={`rounded-xl border p-3 text-sm font-semibold ${msg.ok ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300' : 'border-red-300 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400'}`}>{msg.text}</p>}

      {pending.length > 0 && (
        <Card className="space-y-3">
          <h2 className="font-bold">⏳ {t('loan.toApprove', { n: pending.length })}</h2>
          <ul className="space-y-2">
            {pending.map((l) => row(l, (
              <div className="grid grid-cols-2 gap-2">
                <button type="button" disabled={busy === l.order_id} onClick={() => decide(l, false)} className={`${ui.btnGhost} !py-2 text-sm`}>✕ {t('loan.reject')}</button>
                <button type="button" disabled={busy === l.order_id} onClick={() => decide(l, true)} className={`${ui.btnPrimary} !py-2 text-sm`}>✓ {t('loan.approve')}</button>
              </div>
            )))}
          </ul>
        </Card>
      )}

      {policy && (
        <Card className="space-y-4">
          <div>
            <h2 className="font-bold">📏 {t('loan.p.title')}</h2>
            <p className={`text-xs ${ui.muted}`}>{t('loan.p.hint')}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {FIELDS.map(([k, label]) => (
              <label key={k} className="block">
                <span className={ui.label}>{t(label as DictKey)}</span>
                <input inputMode="decimal" value={val(k)} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} className={ui.input} />
              </label>
            ))}
          </div>
          <div>
            <p className="text-sm font-bold">🚨 {t('loan.p.lateTitle')}</p>
            <p className={`text-xs ${ui.muted}`}>{t('loan.p.lateHint')}</p>
            <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {LATE.map(([k, label]) => (
                <label key={k} className="block">
                  <span className={ui.label}>{t(label as DictKey)}</span>
                  <input inputMode="numeric" value={val(k)} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} className={ui.input} />
                </label>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className={`text-xs ${ui.muted}`}>{t('loan.p.permsHint')} <Link href="/dashboard/owner/permisos" className="font-bold text-blue-600 dark:text-blue-400">🔐 {t('nav.permissions')}</Link></p>
            <button type="button" disabled={busy === 'policy' || Object.keys(edit).length === 0} onClick={savePolicy} className={`${ui.btnPrimary} max-sm:w-full`}>{t('loan.p.save')}</button>
          </div>
        </Card>
      )}

      <Card className="space-y-3">
        <h2 className="font-bold">📒 {t('loan.list')}</h2>
        {others.length === 0 ? <p className={`text-sm ${ui.muted}`}>{t('loan.none')}</p> : (
          <ul className="space-y-2">
            {others.map((l) => row(l, l.status === 'confirmed' && l.approval !== 'rejected' && !l.paid_any ? (
              <button type="button" disabled={busy === l.order_id} onClick={() => cancel(l)} className="text-xs font-bold text-red-600 cursor-pointer dark:text-red-400">🗑️ {t('loan.cancel')}</button>
            ) : null))}
          </ul>
        )}
      </Card>
    </div>
  );
}
