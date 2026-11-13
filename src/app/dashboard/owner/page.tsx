'use client';
import Link from 'next/link';
import { useOwner } from './owner-context';
import { Card, UsageBar } from '../shell';
import { ui } from '../../site-header';
import { useT } from '../../i18n';

function money(amount: number, currency: string, lang: string) {
  try {
    return new Intl.NumberFormat(lang, { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export default function OwnerHome() {
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
        <h1 className="text-2xl font-extrabold">{t('owner.welcome', { name: firstName })}</h1>
        <p className={`text-sm ${ui.muted}`}>{t('owner.subtitle')}</p>
      </div>

      {/* HOY */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="sm:col-span-2">
          <p className={`text-xs font-semibold uppercase tracking-wide ${ui.muted}`}>{t('owner.collectedToday')}</p>
          {overview.today.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{t('owner.noPaymentsToday')}</p>
          ) : (
            <div className="mt-2 space-y-1">
              {overview.today.map((x) => (
                <p key={x.currency} className="text-3xl font-extrabold">
                  {money(Number(x.amount), x.currency, lang)}
                  <span className={`ml-2 text-sm font-semibold ${ui.muted}`}>{t('owner.payments', { n: x.count })}</span>
                </p>
              ))}
            </div>
          )}
        </Card>
        <Card>
          <p className={`text-xs font-semibold uppercase tracking-wide ${ui.muted}`}>{t('owner.openShifts')}</p>
          <p className="mt-2 text-3xl font-extrabold">{overview.open_shifts}</p>
        </Card>
        <Card>
          <p className={`text-xs font-semibold uppercase tracking-wide ${ui.muted}`}>{t('owner.toReview')}</p>
          <p className="mt-2 text-3xl font-extrabold">{overview.pending_reversals + overview.pending_settlements}</p>
          <p className={`mt-1 text-xs ${ui.muted}`}>
            {t('owner.pendingReversals', { n: overview.pending_reversals })} · {t('owner.pendingSettlements', { n: overview.pending_settlements })}
          </p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* USO DEL PLAN */}
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between">
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
