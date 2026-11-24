'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStaff } from '../staff-context';
import { ROLE_NAV } from '../role-nav';
import { rpc } from '../../../lib/supabase';
import { Card, navHas } from '../shell';
import { ui } from '../../site-header';
import { useT } from '../../i18n';
import { money, parseAmount } from '../format';
import { DaysTable } from '../collector/days-table';
import { CutForm } from '../collector/cut-form';
import { RouteTrail } from '../route-trail';
import { ApprovalsTray } from '../approvals';
import { StoreOrdersBanner } from '../store-orders-alert';
import SupPanel from './panel';
import { useBoard, type SRoute, type SBranch } from './board';

// Panel del supervisor: cajas de ruta de sus sucursales, cobrado y prestado por día,
// cierre de caja e inversión según los permisos que le dio el administrador.
function BranchBoard() {
  const { t } = useT();
  const { board, error, load } = useBoard();
  const { modules } = useStaff();
  const router = useRouter();
  const noRoutes = modules !== null && !modules.includes('field_collection');
  useEffect(() => {
    if (!noRoutes) return;
    const first = ROLE_NAV.supervisor.find((n) => n.href !== '/dashboard/supervisor' && navHas(modules, n.module));
    if (first) router.replace(first.href);
  }, [noRoutes, modules, router]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const flash = (ok: boolean, text: string) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 6000); };

  if (noRoutes) return <Card><p className={`text-sm ${ui.muted}`}>{t('common.wait')}</p></Card>;
  if (!board) return <Card><p className={`text-sm ${ui.muted}`}>{error || t('common.wait')}</p></Card>;
  const pending = board.loans.filter((l) => l.approval === 'pending_supervisor' && l.status === 'confirmed').length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold sm:text-2xl">🛵 {t('sup.title')}</h1>
        <p className={`text-sm ${ui.muted}`}>{t('sup.subtitle')}</p>
      </div>
      <StoreOrdersBanner />
      <ApprovalsTray />
      {msg && <p className={`rounded-xl border p-3 text-sm font-semibold ${msg.ok ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300' : 'border-red-300 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400'}`}>{msg.text}</p>}
      {pending > 0 && (
        <a href="/dashboard/supervisor/prestamos" className="block rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-bold text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          ⏳ {t('loan.toApprove', { n: pending })} →
        </a>
      )}
      {board.branches.length === 0 && <Card><p className={`text-sm ${ui.muted}`}>{t('sup.noBranches')}</p></Card>}
      {board.branches.map((b) => {
        const routes = board.routes.filter((r) => r.branch_id === b.id);
        return (
          <section key={b.id} className="space-y-3">
            <h2 className="font-bold">🏬 {b.name} <span className={`text-xs font-normal ${ui.muted}`}>· {b.company}</span></h2>
            {routes.length === 0 ? <Card><p className={`text-sm ${ui.muted}`}>{t('fund.noRoutes')}</p></Card>
              : routes.map((r) => <RouteCard key={r.id} r={r} b={b} onChanged={async (text) => { flash(true, text); await load(); }} onError={(text) => flash(false, text)} />)}
          </section>
        );
      })}
    </div>
  );
}

function RouteCard({ r, b, onChanged, onError }: { r: SRoute; b: SBranch; onChanged: (text: string) => Promise<void>; onError: (text: string) => void }) {
  const { t, lang } = useT();
  const m = (n: number) => money(Number(n), r.currency, lang);
  const [cutting, setCutting] = useState(false);
  const [mv, setMv] = useState<{ type: 'investment'; amount: string; note: string } | null>(null);
  const today = r.days[0];
  const tot = r.days.reduce((a, d) => ({ cash: a.cash + Number(d.cash), lent: a.lent + Number(d.lent) }), { cash: 0, lent: 0 });

  const moveFund = async () => {
    if (!mv) return;
    const n = parseAmount(mv.amount);
    if (Number.isNaN(n) || n <= 0) return;
    try {
      await rpc('route_fund_move', { p_route: r.id, p_type: mv.type, p_amount: n, p_note: mv.note || null });
      setMv(null); await onChanged(t('fund.saved'));
    } catch (e) {
      const x = (e as Error).message;
      onError(x.includes('ROUTE_FUND_LOW') ? t('fund.low') : x.includes('ROUTE_NO_PERMISSION') ? t('loan.e.perm') : t('err.generic'));
    }
  };

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold">🛵 {r.name}</p>
          <p className={`text-xs ${ui.muted}`}>{r.collector ?? '—'} · {t('sup.customers', { n: r.customers })}
            {r.late_customers > 0 && <b className="text-red-600 dark:text-red-400"> · {t('sup.late', { n: r.late_customers })}</b>}</p>
        </div>
        <div className="text-end">
          <p className={`text-xl font-extrabold ${Number(r.balance) < 0 ? 'text-red-600 dark:text-red-400' : ''}`}>{m(r.balance)}</p>
          <p className={`text-[11px] ${ui.muted}`}>💼 {t('fund.title')}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <p><span className={ui.muted}>📅 {t('day.today')} · {t('col.cash')}</span><br /><b>{m(today?.cash ?? 0)}</b></p>
        <p><span className={ui.muted}>📅 {t('day.today')} · {t('loan.lent')}</span><br /><b className="text-violet-600 dark:text-violet-400">{m(today?.lent ?? 0)}</b></p>
        <p><span className={ui.muted}>{t('day.sinceLiqShort')} · {t('col.cash')}</span><br /><b>{m(tot.cash)}</b></p>
        <p><span className={ui.muted}>{t('day.sinceLiqShort')} · {t('loan.lent')}</span><br /><b>{m(tot.lent)}</b></p>
        <p><span className={ui.muted}>{t('fund.lentOpen')}</span><br /><b>{m(r.lent_open)}</b></p>
        <p><span className={ui.muted}>{t('fund.portfolio')}</span><br /><b>{m(r.portfolio)}</b></p>
        {r.liquidations[0] && <p className="col-span-2"><span className={ui.muted}>✂️ {t('liq.last', { date: new Date(r.liquidations[0].created_at).toLocaleDateString(lang), amount: m(r.liquidations[0].closing) })}</span></p>}
      </div>
      <details className="rounded-lg bg-slate-50 px-3 py-2 text-xs dark:bg-slate-800/50">
        <summary className="cursor-pointer font-semibold">📅 {t('day.title')}</summary>
        <div className="mt-2"><DaysTable days={r.days} fmt={m} /></div>
      </details>

      {cutting ? (
        <CutForm routeId={r.id} routeName={r.name} period={r.period} m={m} onCancel={() => setCutting(false)}
          onDone={async (text) => { setCutting(false); await onChanged(text); }} onError={onError} />
      ) : mv ? (
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <input inputMode="decimal" autoFocus placeholder={t('cash.amount')} value={mv.amount} onChange={(e) => setMv({ ...mv, amount: e.target.value })} className={ui.input} />
          <input placeholder={t('cust.notes')} value={mv.note} onChange={(e) => setMv({ ...mv, note: e.target.value })} className={ui.input} />
          <div className="flex gap-2">
            <button type="button" onClick={() => setMv(null)} className={`${ui.btnGhost} !py-2 text-sm`}>✕</button>
            <button type="button" onClick={moveFund} className={`${ui.btnPrimary} !py-2 text-sm`}>{mv.type === 'investment' ? `➕ ${t('fund.invest')}` : `➖ ${t('fund.withdraw')}`}</button>
          </div>
        </div>
      ) : (b.can_liquidate || b.can_invest) ? (
        <div className="flex flex-wrap gap-2">
          {b.can_liquidate && <button type="button" onClick={() => setCutting(true)} className={`${ui.btnPrimary} !py-1.5 text-xs`}>✂️ {t('liq.cut')}</button>}
          {b.can_invest && <button type="button" onClick={() => setMv({ type: 'investment', amount: '', note: '' })} className={`${ui.btnGhost} !py-1.5 text-xs`}>➕ {t('fund.invest')}</button>}
        </div>
      ) : <p className={`text-[11px] ${ui.muted}`}>🔒 {t('sup.noActions')}</p>}
      <RouteTrail routeId={r.id} currency={r.currency} />
    </Card>
  );
}

export default function SupervisorHome() {
  const { modules } = useStaff();
  const { t } = useT();
  if (modules === null) return <Card><p className={`text-sm ${ui.muted}`}>{t('common.wait')}</p></Card>;
  const cobranza = modules.includes('field_collection') && !modules.some((m) => ['retail', 'restaurant', 'workshop'].includes(m));
  return cobranza ? <SupPanel /> : <BranchBoard />;
}
