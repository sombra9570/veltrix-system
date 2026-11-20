'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { rpc } from '../../../lib/supabase';
import { useOwner } from './owner-context';
import { Card, UsageBar } from '../shell';
import { ApprovalsTray } from '../approvals';
import { ui } from '../../site-header';
import { useT } from '../../i18n';

function money(amount: number, currency: string, lang: string) {
  try {
    return new Intl.NumberFormat(lang, { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

type CFund = { id: string; name: string; collector: string | null; currency: string; balance: number; portfolio: number; days?: { day: string; cash: number; digital: number }[] };

/** Inicio de una empresa de cobranza: lo cobrado hoy, la cartera y cada ruta de un vistazo */
function CobranzaHome() {
  const { overview, userName, orgId } = useOwner();
  const { t, lang } = useT();
  const [funds, setFunds] = useState<CFund[] | null>(null);
  useEffect(() => { if (orgId) rpc<CFund[]>('route_funds_admin', { p_org: orgId }).then((f) => setFunds(f ?? [])).catch(() => setFunds([])); }, [orgId]);
  const cur = funds?.[0]?.currency ?? 'USD';
  const todayOf = (f: CFund) => { const d = f.days?.[0]; return d ? Number(d.cash) + Number(d.digital) : 0; };
  const sum = (fn: (f: CFund) => number) => (funds ?? []).reduce((a, f) => a + fn(f), 0);
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold sm:text-2xl">{t('owner.welcome', { name: userName.split(' ')[0] || '' })}</h1>
        <p className={`text-sm ${ui.muted}`}>{t('rep.cobSubtitle')}</p>
      </div>
      <ApprovalsTray />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card><p className={`text-xs font-semibold uppercase tracking-wide ${ui.muted}`}>{t('owner.collectedToday')}</p>
          <p className="mt-2 text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">{money(sum(todayOf), cur, lang)}</p></Card>
        <Card><p className={`text-xs font-semibold uppercase tracking-wide ${ui.muted}`}>{t('cx.sum.portfolio')}</p>
          <p className="mt-2 text-2xl font-extrabold">{money(sum((f) => Number(f.portfolio)), cur, lang)}</p></Card>
        <Card><p className={`text-xs font-semibold uppercase tracking-wide ${ui.muted}`}>{t('cx.sum.current')}</p>
          <p className="mt-2 text-2xl font-extrabold">{money(sum((f) => Number(f.balance)), cur, lang)}</p></Card>
        <Card><p className={`text-xs font-semibold uppercase tracking-wide ${ui.muted}`}>{t('owner.toReview')}</p>
          <p className="mt-2 text-2xl font-extrabold">{(overview?.pending_reversals ?? 0) + (overview?.pending_settlements ?? 0)}</p></Card>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {funds === null ? <p className={`text-sm ${ui.muted}`}>{t('common.wait')}</p> : funds.length === 0 ? <Card><p className={`text-sm ${ui.muted}`}>{t('routes.empty')}</p></Card> : funds.map((f) => (
          <Link key={f.id} href={`/dashboard/owner/ruta?r=${f.id}`} className="block">
            <Card className="space-y-2 transition hover:shadow-md">
              <div><p className="font-bold">🛵 {f.name}</p><p className={`text-xs ${ui.muted}`}>{f.collector ?? t('routes.noCollector')}</p></div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <p><span className={ui.muted}>{t('owner.collectedToday')}</span><br /><b>{money(todayOf(f), f.currency, lang)}</b></p>
                <p><span className={ui.muted}>{t('cx.sum.current')}</span><br /><b>{money(Number(f.balance), f.currency, lang)}</b></p>
                <p><span className={ui.muted}>{t('cx.sum.portfolio')}</span><br /><b>{money(Number(f.portfolio), f.currency, lang)}</b></p>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function OwnerHome() {
  const { cobranza } = useOwner();
  return cobranza ? <CobranzaHome /> : <GenericHome />;
}

function GenericHome() {
  const { overview, userName } = useOwner();
  const { t, lang } = useT();
  const firstName = userName.split(' ')[0] || '';

  if (!overview) {
    return <p className={`text-sm ${ui.muted}`}>{t('common.wait')}</p>;
  }
  const u = overview.usage;
  const plan = overview.org.plan_name;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-extrabold sm:text-2xl">{t('owner.welcome', { name: firstName })}</h1>
        <p className={`text-sm ${ui.muted}`}>{t('owner.subtitle')}</p>
      </div>

      <ApprovalsTray />

      {/* HOY */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Card className="col-span-2">
          <p className={`text-xs font-semibold uppercase tracking-wide ${ui.muted}`}>{t('owner.collectedToday')}</p>
          {overview.today.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{t('owner.noPaymentsToday')}</p>
          ) : (
            <div className="mt-2 space-y-1">
              {overview.today.map((x) => (
                <p key={x.currency} className="text-2xl font-extrabold sm:text-3xl">
                  {money(Number(x.amount), x.currency, lang)}
                  <span className={`block text-sm font-semibold sm:ml-2 sm:inline ${ui.muted}`}>{t('owner.payments', { n: x.count })}</span>
                </p>
              ))}
            </div>
          )}
        </Card>
        <Card>
          <p className={`text-xs font-semibold uppercase tracking-wide ${ui.muted}`}>{t('owner.openShifts')}</p>
          <p className="mt-2 text-2xl font-extrabold sm:text-3xl">{overview.open_shifts}</p>
        </Card>
        <Card>
          <p className={`text-xs font-semibold uppercase tracking-wide ${ui.muted}`}>{t('owner.toReview')}</p>
          <p className="mt-2 text-2xl font-extrabold sm:text-3xl">{overview.pending_reversals + overview.pending_settlements}</p>
          <p className={`mt-1 text-xs ${ui.muted}`}>
            {t('owner.pendingReversals', { n: overview.pending_reversals })} · {t('owner.pendingSettlements', { n: overview.pending_settlements })}
          </p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* USO DEL PLAN */}
        <Card className="lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold">{t('owner.planUsage')}</h2>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
              {t('owner.planName', { plan })}
            </span>
          </div>
          <div className="mt-4 space-y-4">
            <UsageBar label={t('owner.usageBranches')} used={u.branches.used} max={u.branches.max} />
            <UsageBar label={t('owner.usageUsers')} used={u.users.used} max={u.users.max} />
            <UsageBar label={t('owner.usageCompanies')} used={u.companies.used} max={u.companies.max} />
          </div>
          <p className={`mt-4 text-xs ${ui.muted}`}>{t('owner.extrasHint')}</p>
        </Card>

        {/* ACCESOS RÁPIDOS */}
        <Card>
          <h2 className="font-bold">{t('owner.quickActions')}</h2>
          <div className="mt-4 grid gap-2">
            <Link href="/dashboard/owner/equipo" className={`${ui.btnPrimary} justify-start`}>👥 {t('owner.addWorker')}</Link>
            <Link href="/dashboard/owner/sucursales" className={`${ui.btnGhost} justify-start`}>🏢 {t('owner.addBranch')}</Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
