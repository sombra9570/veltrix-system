'use client';
import { PayQrSetup, ShiftProofs } from '../../sale-files';
import { useCallback, useEffect, useState } from 'react';
import { rpc } from '../../../../lib/supabase';
import { Card } from '../../shell';
import { ui } from '../../../site-header';
import { useSync } from '../../sync';
import { useT } from '../../../i18n';
import { money, shortTime } from '../../format';
import { Sheet, BranchOpt } from '../../sheet';
import { friendlyError, useOwnerOptional } from '../owner-context';

type OpenShift = { id: string; cashier: string | null; opened_at: string; opening: number; expected: number; cash_in: number; digital_in: number; count: number };
type Register = { id: string; name: string; active: boolean; shift: OpenShift | null };
type Closed = { id: string; register: string; cashier: string | null; opened_at: string; closed_at: string; expected: number; declared: number; difference: number; status: string };
type Reversal = { id: string; at: string; reason: string; requested_by: string | null; amount: number; method: string; customer: string; paid_at: string };
type Overview = { currency: string; registers: Register[]; closed: Closed[]; reversals: Reversal[] };
type Shift = {
  id: string; status: string; opened_at: string; closed_at: string | null; opening: number; expected: number;
  declared: number | null; difference: number | null; cashier: string | null; register: string;
  payments: { at: string; customer: string; walk_in: boolean; method: string; amount: number; reversal: boolean }[];
  movements: { at: string; type: string; amount: number; description: string }[];
  settlements: { at: string; collector: string | null; expected: number; declared: number; difference: number }[];
};

const errBox = 'border-red-300 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400';
const okBox = 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300';

export default function CashPage() {
  const { t, lang } = useT();
  const owner = useOwnerOptional();
  const reload = owner?.reload ?? (async () => {});
  const [branches, setBranches] = useState<BranchOpt[]>([]);
  const [branchId, setBranchId] = useState('');
  const [data, setData] = useState<Overview | null>(null);
  const [shift, setShift] = useState<Shift | null>(null);
  const [edit, setEdit] = useState<{ id: string | null; name: string; active: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    rpc<BranchOpt[]>('seller_branches').then((b) => {
      setBranches(b ?? []);
      if (b?.length) setBranchId(b[0].id);
    }).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    if (!branchId) return;
    try { setData(await rpc<Overview>('cash_overview', { p_branch: branchId })); }
    catch (e) { setMsg({ ok: false, text: friendlyError((e as Error).message, t) }); }
  }, [branchId, t]);

  useEffect(() => { load(); }, [load]);
  useSync(load);

  const fmt = (n: number) => money(Number(n), data?.currency ?? 'USD', lang);
  const when = (iso: string) => `${new Date(iso).toLocaleDateString(lang, { day: '2-digit', month: 'short' })} ${shortTime(iso, lang)}`;
  const flash = (ok: boolean, text: string) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 5000); };

  const openShift = async (id: string) => {
    try { setShift(await rpc<Shift>('shift_detail', { p_shift: id })); }
    catch (e) { flash(false, friendlyError((e as Error).message, t)); }
  };

  const saveRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!edit || !edit.name.trim()) return;
    setBusy(true);
    try {
      await rpc('save_register', { p_id: edit.id, p_branch: branchId, p_name: edit.name.trim(), p_active: edit.active });
      setEdit(null);
      flash(true, t('register.saved'));
      await load();
    } catch (err) {
      const m = (err as Error).message;
      flash(false, m.includes('REGISTER_NAME_TAKEN') ? t('register.nameTaken')
        : m.includes('REGISTER_HAS_OPEN_SHIFT') ? t('register.hasOpenShift')
        : m.includes('REGISTER_LIMIT') ? t('register.limit') : friendlyError(m, t));
    } finally { setBusy(false); }
  };

  const decide = async (r: Reversal, approve: boolean) => {
    if (approve && !window.confirm(t('register.reversalConfirm', { amount: fmt(r.amount) }))) return;
    setBusy(true);
    try {
      await rpc('decide_reversal', { p_reversal: r.id, p_approve: approve });
      flash(true, approve ? t('register.reversalApproved') : t('register.reversalRejected'));
      await Promise.all([load(), reload()]);
    } catch (err) { flash(false, friendlyError((err as Error).message, t)); }
    finally { setBusy(false); }
  };

  const diffCls = (d: number) => Number(d) === 0 ? 'text-emerald-600 dark:text-emerald-400' : Number(d) < 0 ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400';
  const diffLabel = (d: number) => Number(d) === 0 ? t('register.exact') : Number(d) < 0 ? t('register.short', { amount: fmt(-d) }) : t('register.over', { amount: fmt(d) });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-extrabold sm:text-2xl">💵 {t('nav.cash')}</h1>
          <p className={`text-sm ${ui.muted}`}>{t('register.subtitle')}</p>
        </div>
        <button type="button" onClick={() => setEdit({ id: null, name: '', active: true })} className={`${ui.btnPrimary} max-sm:w-full`}>+ {t('register.add')}</button>
      </div>

      {msg && <p className={`rounded-xl border p-3 text-sm font-semibold ${msg.ok ? okBox : errBox}`}>{msg.text}</p>}

      {branches.length > 1 && (
        <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={ui.input} aria-label={t('pos.branch')}>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.name} · {b.company}</option>)}
        </select>
      )}

      {edit && (
        <Card>
          <form onSubmit={saveRegister} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <div>
              <label className={ui.label}>{t('register.name')}</label>
              <input required autoFocus maxLength={60} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} className={ui.input} />
              {edit.id && (
                <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm">
                  <input type="checkbox" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} className="h-4 w-4" />
                  {t('register.activeLabel')}
                </label>
              )}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setEdit(null)} className={`${ui.btnGhost} max-sm:flex-1`}>{t('cash.cancel')}</button>
              <button type="submit" disabled={busy} className={`${ui.btnPrimary} max-sm:flex-1`}>{busy ? t('common.wait') : t('prod.save')}</button>
            </div>
          </form>
        </Card>
      )}

      {/* Reversos pendientes de aprobación */}
      {data && data.reversals.length > 0 && (
        <Card className="!border-amber-300 dark:!border-amber-500/40">
          <h2 className="mb-1 font-bold">↩️ {t('register.reversals')}</h2>
          <p className={`mb-3 text-xs ${ui.muted}`}>{t('register.reversalsHint')}</p>
          <ul className="space-y-3">
            {data.reversals.map((r) => (
              <li key={r.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                <div className="flex justify-between gap-3">
                  <p className="min-w-0 truncate font-semibold">{r.customer}</p>
                  <p className="shrink-0 font-bold">{fmt(r.amount)}</p>
                </div>
                <p className={`text-xs ${ui.muted}`}>{when(r.paid_at)} · {t(`cash.m.${r.method}` as 'cash.m.cash')} · {t('register.requestedBy', { name: r.requested_by ?? '—' })}</p>
                <p className="mt-1 text-sm">“{r.reason}”</p>
                <div className="mt-2 flex gap-2">
                  <button type="button" disabled={busy} onClick={() => decide(r, false)} className={`${ui.btnGhost} flex-1 !py-2`}>{t('register.reject')}</button>
                  <button type="button" disabled={busy} onClick={() => decide(r, true)} className={`${ui.btnPrimary} flex-1 !py-2`}>{t('register.approve')}</button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Cajas */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {!data ? (
          <Card><p className={`text-sm ${ui.muted}`}>{t('common.wait')}</p></Card>
        ) : data.registers.map((r) => (
          <Card key={r.id} className={r.active ? '' : 'opacity-60'}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-lg font-extrabold">{r.name}</p>
                <span className={`inline-block rounded-md px-1.5 py-0.5 text-[11px] font-bold ${r.shift ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}>
                  {!r.active ? t('register.inactive') : r.shift ? t('register.open') : t('register.closed')}
                </span>
              </div>
              <button type="button" onClick={() => setEdit({ id: r.id, name: r.name, active: r.active })} className={`${ui.btnGhost} !px-3 !py-1.5 text-xs`}>{t('prod.edit')}</button>
            </div>

            {r.shift ? (
              <div className="mt-3 space-y-1.5 text-sm">
                <p className={ui.muted}>👤 {r.shift.cashier ?? '—'} · {t('cash.openSince', { time: shortTime(r.shift.opened_at, lang) })}</p>
                <div className="flex justify-between"><span className={ui.muted}>{t('cash.openingCash')}</span><span>{fmt(r.shift.opening)}</span></div>
                <div className="flex justify-between"><span className={ui.muted}>{t('cash.m.cash')}</span><span>{fmt(r.shift.cash_in)}</span></div>
                <div className="flex justify-between"><span className={ui.muted}>{t('register.digital')}</span><span>{fmt(r.shift.digital_in)}</span></div>
                <div className="flex justify-between border-t border-slate-200 pt-1.5 font-bold dark:border-slate-800"><span>{t('register.expected')}</span><span>{fmt(r.shift.expected)}</span></div>
                <button type="button" onClick={() => openShift(r.shift!.id)} className={`${ui.btnGhost} mt-2 w-full !py-2`}>{t('register.viewDetail')}</button>
              </div>
            ) : (
              <p className={`mt-3 text-sm ${ui.muted}`}>{r.active ? t('register.noShift') : t('register.inactiveHint')}</p>
            )}

          </Card>
        ))}
      </div>

      {/* Últimos cierres */}
      <Card className="!p-0 overflow-hidden">
        <h2 className="border-b border-slate-200 p-4 font-bold dark:border-slate-800">{t('register.history')}</h2>
        {!data ? null : data.closed.length === 0 ? (
          <p className={`p-5 text-sm ${ui.muted}`}>{t('register.historyEmpty')}</p>
        ) : (
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {data.closed.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => openShift(c.id)} className="flex w-full items-center gap-3 p-4 text-start hover:bg-slate-50 cursor-pointer dark:hover:bg-slate-800/50">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{c.register} · {c.cashier ?? '—'}</p>
                    <p className={`truncate text-xs ${ui.muted}`}>{when(c.opened_at)} → {when(c.closed_at)}</p>
                  </div>
                  <div className="shrink-0 text-end">
                    <p className="font-bold">{fmt(c.declared)}</p>
                    <p className={`text-xs font-bold ${diffCls(c.difference)}`}>{diffLabel(c.difference)}</p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {branchId && <PayQrSetup branchId={branchId} />}

      {shift && (
        <Sheet onClose={() => setShift(null)} label={t('pos.close')}>
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-extrabold">{shift.register} · {shift.cashier ?? '—'}</h2>
              <p className={`text-sm ${ui.muted}`}>{when(shift.opened_at)}{shift.closed_at ? ` → ${when(shift.closed_at)}` : ` · ${t('register.open')}`}</p>
            </div>
            <div className="space-y-1.5 rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-800">
              <div className="flex justify-between"><span className={ui.muted}>{t('cash.openingCash')}</span><span>{fmt(shift.opening)}</span></div>
              <div className="flex justify-between font-bold"><span>{t('register.expected')}</span><span>{fmt(shift.expected)}</span></div>
              {shift.declared !== null && (
                <>
                  <div className="flex justify-between"><span className={ui.muted}>{t('register.declared')}</span><span>{fmt(shift.declared)}</span></div>
                  <div className={`flex justify-between font-bold ${diffCls(shift.difference ?? 0)}`}><span>{t('register.difference')}</span><span>{diffLabel(shift.difference ?? 0)}</span></div>
                </>
              )}
            </div>

            <div>
              <h3 className="mb-2 text-sm font-bold">{t('cash.tabPayments')} ({shift.payments.length})</h3>
              {shift.payments.length === 0 ? <p className={`text-sm ${ui.muted}`}>{t('register.nothing')}</p> : (
                <ul className="space-y-1 text-sm">
                  {shift.payments.map((p, k) => (
                    <li key={k} className="flex justify-between gap-3">
                      <span className="min-w-0 truncate">{shortTime(p.at, lang)} · {p.walk_in ? t('sales.walkIn') : p.customer} · {t(`cash.m.${p.method}` as 'cash.m.cash')}</span>
                      <span className={`shrink-0 font-semibold ${Number(p.amount) < 0 ? 'text-red-600 dark:text-red-400' : ''}`}>{fmt(p.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <ShiftProofs shiftId={shift.id} currency={data?.currency ?? 'USD'} />

            {shift.movements.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-bold">{t('cash.tabMovements')}</h3>
                <ul className="space-y-1 text-sm">
                  {shift.movements.map((m, k) => (
                    <li key={k} className="flex justify-between gap-3">
                      <span className="min-w-0 truncate">{shortTime(m.at, lang)} · {t(`cash.mov.${m.type}` as 'cash.mov.expense')} · {m.description}</span>
                      <span className="shrink-0 font-semibold">{['deposit', 'change_fund'].includes(m.type) ? '+' : '−'}{fmt(m.amount)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {shift.settlements.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-bold">{t('cash.tabSettlements')}</h3>
                <ul className="space-y-1 text-sm">
                  {shift.settlements.map((s, k) => (
                    <li key={k} className="flex justify-between gap-3">
                      <span className="min-w-0 truncate">{s.at ? shortTime(s.at, lang) : ''} · {s.collector ?? '—'}</span>
                      <span className="shrink-0 font-semibold">{fmt(s.declared)} <span className={`text-xs ${diffCls(s.difference)}`}>({diffLabel(s.difference)})</span></span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Sheet>
      )}
    </div>
  );
}
