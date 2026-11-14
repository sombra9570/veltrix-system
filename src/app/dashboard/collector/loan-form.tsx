'use client';
import { useEffect, useMemo, useState } from 'react';
import { rpc } from '../../../lib/supabase';
import { ui } from '../../site-header';
import { useT } from '../../i18n';
import type { DictKey } from '../../i18n/es';
import { parseAmount } from '../format';

/* ------------------------------------------------------------------
 * Préstamo en calle: el cobrador elige (o registra) al cliente, el monto, las cuotas y la frecuencia.
 * El interés es un % fijo sobre el capital que fija el administrador; solo quien tiene permiso lo cambia.
 * Si algo pasa las reglas, el préstamo queda pendiente de aprobación y el dinero no se entrega aún.
 * ------------------------------------------------------------------ */
export type LoanPolicy = {
  interest_default: number; interest_min: number; interest_max: number; max_installments: number;
  late_daily: number; late_weekly: number; late_biweekly: number; late_monthly: number;
};
type RouteCustomer = { id: string; name: string; phone: string | null; address: string | null; balance: number; rating: string };
const FREQS: [number, string][] = [[1, 'daily'], [7, 'weekly'], [15, 'biweekly'], [30, 'monthly']];

export const RATING_DOT: Record<string, string> = {
  green: 'bg-emerald-500', yellow: 'bg-yellow-400', orange: 'bg-orange-500', red: 'bg-red-600', new: 'bg-slate-400',
};

const addDays = (iso: string, n: number) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

export function LoanForm({ routeId, today, policy, canInterest, canCustomers, fmt, onDone }: {
  routeId: string; today: string; policy: LoanPolicy; canInterest: boolean; canCustomers: boolean;
  fmt: (n: number) => string; onDone: (text: string, ok: boolean) => void;
}) {
  const { t, lang } = useT();
  const [customers, setCustomers] = useState<RouteCustomer[]>([]);
  const [q, setQ] = useState('');
  const [cid, setCid] = useState('');
  const [newC, setNewC] = useState<{ name: string; phone: string; address: string; doc: string } | null>(null);
  const [amount, setAmount] = useState('');
  const [interest, setInterest] = useState(String(policy.interest_default));
  const [count, setCount] = useState('24');
  const [every, setEvery] = useState(1);
  const [first, setFirst] = useState(addDays(today, 1));
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => { rpc<RouteCustomer[]>('route_customers', { p_route: routeId }).then((x) => setCustomers(x ?? [])).catch(() => {}); }, [routeId]);
  useEffect(() => { setFirst(addDays(today, every)); }, [every, today]);

  const p = parseAmount(amount);
  const i = canInterest ? parseAmount(interest) : Number(policy.interest_default);
  const n = parseInt(count, 10);
  const valid = !Number.isNaN(p) && p > 0 && !Number.isNaN(i) && i >= 0 && n >= 1 && n <= 120 && first >= today
    && (cid || (newC && newC.name.trim()));
  const total = valid ? Math.round(p * (1 + i / 100) * 100) / 100 : 0;
  const each = valid ? Math.trunc((total / n) * 100) / 100 : 0;
  const last = valid ? addDays(first, every * (n - 1)) : '';
  const warn: string[] = [];
  if (valid && (i < Number(policy.interest_min) || i > Number(policy.interest_max))) warn.push(t('loan.r.interest'));
  if (valid && n > Number(policy.max_installments)) warn.push(t('loan.r.installments'));

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (s ? customers.filter((c) => c.name.toLowerCase().includes(s) || (c.phone ?? '').includes(s)) : customers).slice(0, 30);
  }, [customers, q]);

  const submit = async () => {
    setBusy(true); setErr('');
    try {
      let customer = cid;
      if (!customer && newC) {
        customer = await rpc<string>('collector_save_customer', {
          p_route: routeId, p_name: newC.name, p_phone: newC.phone || null, p_address: newC.address || null, p_tax_id: newC.doc || null,
        });
      }
      const r = await rpc<{ approval: string; reasons: string[] }>('create_street_loan', {
        p_route: routeId, p_customer: customer, p_principal: p, p_interest: canInterest ? i : null,
        p_count: n, p_every_days: every, p_first_due: first, p_notes: notes || null,
      });
      onDone(r.approval === 'pending_supervisor'
        ? t('loan.pending', { reasons: r.reasons.map((x) => t(`loan.r.${x}` as DictKey)).join(', ') })
        : t('loan.created', { amount: fmt(p) }), true);
    } catch (e) {
      const m = (e as Error).message;
      setErr(m.includes('LOAN_INTEREST_LOCKED') ? t('loan.e.interest') : m.includes('LOAN_NO_PERMISSION') ? t('loan.e.perm')
        : m.includes('LOAN_MAX_CUSTOMERS') ? t('loan.e.maxCustomers') : m.includes('LOAN_OTHER_ROUTE') ? t('loan.e.otherRoute')
        : /fetch|network|Failed/i.test(m) ? t('loan.e.offline') : m);
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold">💸 {t('loan.title')}</h2>

      {/* Cliente */}
      {!newC ? (
        <div className="space-y-2">
          <label className={ui.label}>{t('loan.customer')}</label>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('loan.search')} className={ui.input} />
          <ul className="max-h-48 space-y-1 overflow-y-auto">
            {list.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => setCid(c.id)}
                  className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm cursor-pointer ${cid === c.id ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10' : 'border-slate-200 dark:border-slate-800'}`}>
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${RATING_DOT[c.rating] ?? RATING_DOT.new}`} title={t(`rating.${c.rating}` as DictKey)} />
                  <span className="min-w-0 flex-1 truncate font-semibold">{c.name}</span>
                  {Number(c.balance) > 0 && <span className={`text-xs ${ui.muted}`}>{fmt(c.balance)}</span>}
                </button>
              </li>
            ))}
            {list.length === 0 && <li className={`text-xs ${ui.muted}`}>{t('loan.noCustomers')}</li>}
          </ul>
          {canCustomers && <button type="button" onClick={() => { setCid(''); setNewC({ name: '', phone: '', address: '', doc: '' }); }} className={`${ui.btnGhost} w-full text-sm`}>➕ {t('loan.newCustomer')}</button>}
        </div>
      ) : (
        <div className="space-y-2 rounded-xl border border-blue-200 p-3 dark:border-blue-500/30">
          <div className="flex items-center justify-between"><p className="text-sm font-bold">➕ {t('loan.newCustomer')}</p>
            <button type="button" onClick={() => setNewC(null)} className="text-xs font-bold text-blue-600 cursor-pointer">{t('card.cancel')}</button></div>
          <input value={newC.name} onChange={(e) => setNewC({ ...newC, name: e.target.value })} placeholder={t('loan.cName')} className={ui.input} />
          <div className="grid grid-cols-2 gap-2">
            <input value={newC.phone} onChange={(e) => setNewC({ ...newC, phone: e.target.value })} placeholder={t('loan.cPhone')} inputMode="tel" className={ui.input} />
            <input value={newC.doc} onChange={(e) => setNewC({ ...newC, doc: e.target.value })} placeholder={t('loan.cDoc')} className={ui.input} />
          </div>
          <input value={newC.address} onChange={(e) => setNewC({ ...newC, address: e.target.value })} placeholder={t('loan.cAddress')} className={ui.input} />
        </div>
      )}

      {/* Condiciones */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={ui.label}>{t('loan.amount')}</label>
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${ui.input} text-lg font-bold`} />
        </div>
        <div>
          <label className={ui.label}>{t('loan.interest')}</label>
          <input inputMode="decimal" value={canInterest ? interest : String(policy.interest_default)} disabled={!canInterest}
            onChange={(e) => setInterest(e.target.value)} className={`${ui.input} text-lg font-bold disabled:opacity-70`} />
          {!canInterest && <p className={`mt-0.5 text-[11px] ${ui.muted}`}>🔒 {t('loan.interestFixed')}</p>}
        </div>
        <div>
          <label className={ui.label}>{t('loan.count')}</label>
          <input inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value.replace(/\D/g, ''))} className={ui.input} />
        </div>
        <div>
          <label className={ui.label}>{t('loan.every')}</label>
          <select value={every} onChange={(e) => setEvery(Number(e.target.value))} className={ui.input}>
            {FREQS.map(([d, k]) => <option key={d} value={d}>{t(`card.f.${k}` as DictKey)}</option>)}
          </select>
        </div>
        <div className="col-span-2">
          <label className={ui.label}>{t('loan.firstDue')}</label>
          <input type="date" min={today} value={first} onChange={(e) => setFirst(e.target.value)} className={ui.input} />
        </div>
        <div className="col-span-2">
          <label className={ui.label}>{t('cust.notes')}</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} className={ui.input} />
        </div>
      </div>

      {valid && (
        <div className="space-y-1 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/50">
          <p className="flex justify-between"><span>{t('loan.total')}</span><b>{fmt(total)}</b></p>
          <p className="flex justify-between"><span>{t('loan.each', { n })}</span><b>{fmt(each)}</b></p>
          <p className={`flex justify-between text-xs ${ui.muted}`}><span>{t('loan.ends')}</span><span>{new Date(last + 'T12:00:00').toLocaleDateString(lang)}</span></p>
          <p className={`text-xs ${ui.muted}`}>{t('loan.fromCash')}</p>
        </div>
      )}
      {warn.length > 0 && <p className="rounded-xl border border-amber-300 bg-amber-50 p-2 text-xs font-semibold text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">⏳ {t('loan.willPend', { reasons: warn.join(', ') })}</p>}
      {err && <p className="text-sm font-semibold text-red-600 dark:text-red-400">{err}</p>}
      <button type="button" disabled={!valid || busy} onClick={submit} className={`${ui.btnPrimary} w-full py-3`}>
        {busy ? t('common.wait') : t('loan.submit')}
      </button>
    </div>
  );
}
