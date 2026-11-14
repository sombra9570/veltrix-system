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
type Fund = {
  id: string; name: string; branch: string; collector: string | null; currency: string; balance: number; invested: number;
  delivered: number; lent_open: number; portfolio: number;
  period: { since: string | null; opening: number; investments: number; withdrawals: number; collected_cash: number; collected_digital: number;
    lent: number; collector_expenses: number; expected: number };
  liquidations: { id: string; created_at: string; expected: number; counted: number; difference: number; closing: number;
    op_expenses: number; payments_out: number; withdrawals: number }[];
  moves: { at: string; type: string; amount: number; note: string | null }[];
};
const freqKey = (d: number) => (d <= 3 ? 'daily' : d <= 10 ? 'weekly' : d <= 20 ? 'biweekly' : 'monthly');

export default function LoansPage() {
  const { orgId } = useOwner();
  const { t, lang } = useT();
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [loans, setLoans] = useState<Loan[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState('');
  const [funds, setFunds] = useState<Fund[]>([]);
  const [cut, setCut] = useState<string | null>(null);
  const [mv, setMv] = useState<{ route: string; type: 'investment' | 'withdrawal'; amount: string; note: string } | null>(null);

  const load = useCallback(async () => {
    if (!orgId) return;
    try {
      const r = await rpc<{ policy: Policy; loans: Loan[] }>('loans_admin', { p_org: orgId });
      setPolicy(r.policy); setLoans(r.loans ?? []);
      setFunds(await rpc<Fund[]>('route_funds_admin', { p_org: orgId }) ?? []);
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

  const moveFund = async () => {
    if (!mv) return;
    const n = Number(mv.amount.replace(',', '.'));
    if (!(n > 0)) return;
    setBusy('fund'); setMsg(null);
    try {
      await rpc('route_fund_move', { p_route: mv.route, p_type: mv.type, p_amount: n, p_note: mv.note || null });
      setMv(null); await load(); setMsg({ ok: true, text: t('fund.saved') });
    } catch (e) {
      const m = (e as Error).message;
      setMsg({ ok: false, text: m.includes('ROUTE_FUND_LOW') ? t('fund.low') : friendlyError(m, t) });
    } finally { setBusy(''); }
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

      <Card className="space-y-3">
        <div>
          <h2 className="font-bold">💼 {t('fund.routesTitle')}</h2>
          <p className={`text-xs ${ui.muted}`}>{t('fund.routesHint')}</p>
        </div>
        {funds.length === 0 ? <p className={`text-sm ${ui.muted}`}>{t('fund.noRoutes')}</p> : (
          <ul className="space-y-2">
            {funds.map((f) => {
              const m = (n: number) => money(Number(n), f.currency, lang);
              return (
                <li key={f.id} className="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold">🛵 {f.name}</p>
                      <p className={`text-xs ${ui.muted}`}>{f.collector ?? '—'} · {f.branch}</p>
                    </div>
                    <div className="text-end">
                      <p className={`text-xl font-extrabold ${Number(f.balance) < 0 ? 'text-red-600 dark:text-red-400' : ''}`}>{m(f.balance)}</p>
                      <p className={`text-[11px] ${ui.muted}`}>{t('fund.inRoute')}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                    <p><span className={ui.muted}>{t('fund.invested')}</span><br /><b>{m(f.invested)}</b></p>
                    <p><span className={ui.muted}>{t('fund.lentOpen')}</span><br /><b>{m(f.lent_open)}</b></p>
                    <p><span className={ui.muted}>{t('fund.portfolio')}</span><br /><b>{m(f.portfolio)}</b></p>
                    <p><span className={ui.muted}>{t('fund.delivered')}</span><br /><b>{m(f.delivered)}</b></p>
                  </div>
                  {cut === f.id && (
                    <CutForm f={f} m={m} onCancel={() => setCut(null)}
                      onDone={async (text) => { setCut(null); await load(); setMsg({ ok: true, text }); }}
                      onError={(text) => setMsg({ ok: false, text })} />
                  )}
                  {cut !== f.id && (f.liquidations ?? []).length > 0 && (
                    <p className={`text-[11px] ${ui.muted}`}>✂️ {t('liq.last', { date: new Date(f.liquidations[0].created_at).toLocaleDateString(lang), amount: m(f.liquidations[0].closing) })}
                      {Number(f.liquidations[0].difference) !== 0 && <b className={Number(f.liquidations[0].difference) < 0 ? ' text-red-600 dark:text-red-400' : ' text-emerald-600'}> · {t('liq.diff')} {m(f.liquidations[0].difference)}</b>}</p>
                  )}
                  {cut === f.id ? null : mv?.route === f.id ? (
                    <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                      <input inputMode="decimal" autoFocus placeholder={t('cash.amount')} value={mv.amount} onChange={(e) => setMv({ ...mv, amount: e.target.value })} className={ui.input} />
                      <input placeholder={t('cust.notes')} value={mv.note} onChange={(e) => setMv({ ...mv, note: e.target.value })} className={ui.input} />
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setMv(null)} className={`${ui.btnGhost} !py-2 text-sm`}>✕</button>
                        <button type="button" disabled={busy === 'fund'} onClick={moveFund} className={`${ui.btnPrimary} !py-2 text-sm`}>
                          {mv.type === 'investment' ? `➕ ${t('fund.invest')}` : `➖ ${t('fund.withdraw')}`}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setMv({ route: f.id, type: 'investment', amount: '', note: '' })} className={`${ui.btnGhost} !py-1.5 text-xs`}>➕ {t('fund.invest')}</button>
                      <button type="button" onClick={() => setMv({ route: f.id, type: 'withdrawal', amount: '', note: '' })} className={`${ui.btnGhost} !py-1.5 text-xs`}>➖ {t('fund.withdraw')}</button>
                      <button type="button" onClick={() => { setMv(null); setCut(f.id); }} className={`${ui.btnPrimary} !py-1.5 text-xs`}>✂️ {t('liq.cut')}</button>
                    </div>
                  )}
                  {f.moves.length > 0 && (
                    <ul className={`divide-y divide-slate-100 text-[11px] dark:divide-slate-800 ${ui.muted}`}>
                      {f.moves.slice(0, 4).map((x, k) => (
                        <li key={k} className="flex justify-between gap-2 py-1">
                          <span>{new Date(x.at).toLocaleDateString(lang)} · {t(`fund.t.${x.type}` as DictKey)}{x.note ? ` · ${x.note}` : ''}</span>
                          <b>{x.type === 'investment' ? '+' : '−'}{m(x.amount)}</b>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

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

/* ---------- Corte de caja: se cuenta el efectivo, se registran las salidas por rubro y la caja queda cuadrada ---------- */
const CATS: Record<'op_expense' | 'payment_out' | 'withdrawal', string[]> = {
  op_expense: ['fuel', 'food', 'transport', 'phone', 'maintenance', 'stationery', 'other'],
  payment_out: ['collector_pay', 'third_party', 'other'],
  withdrawal: ['owner', 'bank', 'other'],
};
type Line = { kind: 'op_expense' | 'payment_out' | 'withdrawal'; category: string; amount: string; note: string };

function CutForm({ f, m, onCancel, onDone, onError }: {
  f: Fund; m: (n: number) => string; onCancel: () => void; onDone: (text: string) => void; onError: (text: string) => void;
}) {
  const { t } = useT();
  const p = f.period;
  const [counted, setCounted] = useState(String(Number(p.expected)));
  const [lines, setLines] = useState<Line[]>([]);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
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
        p_route: f.id, p_counted: c, p_notes: notes || null,
        p_lines: lines.map((l) => ({ kind: l.kind, category: l.category, amount: num(l.amount), note: l.note || null })),
      });
      onDone(t('liq.done', { amount: m(r.closing) }));
    } catch (e) {
      const msg = (e as Error).message;
      onError(msg.includes('LIQ_OUT_EXCEEDS') ? t('liq.outExceeds') : msg);
    } finally { setBusy(false); }
  };

  const row = (label: string, v: number, cls = '') => (
    <li className="flex justify-between"><span>{label}</span><b className={cls}>{m(v)}</b></li>
  );
  return (
    <div className="space-y-3 rounded-xl border-2 border-blue-400 p-3">
      <p className="font-bold">✂️ {t('liq.cut')} · {f.name}</p>
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
              {(Object.keys(CATS) as Line['kind'][]).map((k) => <option key={k} value={k}>{t(`liq.k.${k}` as DictKey)}</option>)}
            </select>
            <select value={l.category} onChange={(e) => set(i, { category: e.target.value })} className={ui.input}>
              {CATS[l.kind].map((cat) => <option key={cat} value={cat}>{t(`liq.c.${cat}` as DictKey)}</option>)}
            </select>
            <input inputMode="decimal" placeholder={t('cash.amount')} value={l.amount} onChange={(e) => set(i, { amount: e.target.value })} className={ui.input} />
            <input placeholder={t('cust.notes')} value={l.note} onChange={(e) => set(i, { note: e.target.value })} className={ui.input} />
            <button type="button" onClick={() => setLines(lines.filter((_, k) => k !== i))} className="text-sm font-bold text-red-600 cursor-pointer" aria-label="✕">✕</button>
          </div>
        ))}
        <button type="button" onClick={() => setLines([...lines, { kind: 'op_expense', category: 'fuel', amount: '', note: '' }])} className={`${ui.btnGhost} !py-1.5 text-xs`}>➕ {t('liq.addLine')}</button>
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
