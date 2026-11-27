'use client';
import { useCallback, useEffect, useState } from 'react';
import { supabase, rpc } from '../../../../lib/supabase';
import { Card } from '../../shell';
import { ui } from '../../../site-header';
import { useT } from '../../../i18n';
import type { DictKey } from '../../../i18n/es';
import { useOwner } from '../owner-context';
import { TransferPay } from './transfer-pay';
import { StreetPlan } from './street-plan';
import { usePlanMoney } from '../../../plan-money';
import { ExportData } from './export-data';

type PlanOpt = { code: string; name: string; price: number; max_branches: number; max_users: number; max_companies: number; max_storage_mb: number; max_store_products: number };
type Billing = {
  plan_code: string; status: 'active' | 'past_due_grace' | 'suspended'; region: 'latam' | 'global'; price_now: number;
  trial_ends_at: string | null; next_billing_date: string | null; grace_ends_at: string | null;
  is_pilot: boolean; founder_discount_pct: number; founder_until: string | null; founder_active: boolean; referral_credit_pct?: number;
  subscribed: boolean; portal_url: string | null; cancel_at: string | null;
  plans: PlanOpt[];
  history: { at: string; amount: number; status: string; gateway: string; period_end: string | null }[];
};


type Addons = {
  items: { code: 'user' | 'branch' | 'storage'; price: number; unit_mb: number; max: number; qty: number }[];
  monthly: number;
  used: { users: number; branches: number; storage_mb: number };
  limits: { users: number; branches: number; storage_mb: number };
};

export default function PlanPage() {
  const { t, lang } = useT();
  const { fmt: usd } = usePlanMoney();
  const { orgId, reload, overview } = useOwner();
  const isStreet = !!overview?.street; // cobranza en calle y microfinanzas: no se muestran planes, solo cobradores y supervisores contratados
  const [streetBs, setStreetBs] = useState<number | null>(null);
  const [b, setB] = useState<Billing | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [ad, setAd] = useState<Addons | null>(null);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [adBusy, setAdBusy] = useState(false);
  const k = (key: string) => t(key as DictKey);
  const day = (d: string | null) => (d ? new Date(d.length === 10 ? `${d}T12:00:00` : d).toLocaleDateString(lang, { day: 'numeric', month: 'long', year: 'numeric' }) : '—');

  const load = useCallback(async () => {
    if (!orgId) return;
    try { setB(await rpc<Billing>('my_billing', { p_org: orgId })); } catch { /* */ }
    try {
      const a = await rpc<Addons>('my_addons', { p_org: orgId });
      setAd(a); setQty(Object.fromEntries(a.items.map((i) => [i.code, i.qty])));
    } catch { /* */ }
  }, [orgId]);

  const saveAddons = async () => {
    if (!ad) return;
    setAdBusy(true); setMsg(null);
    try {
      await rpc('set_my_addons', { p_org: orgId, p_users: qty.user ?? 0, p_branches: qty.branch ?? 0, p_storage_units: qty.storage ?? 0 });
      const { data: s } = await supabase.auth.getSession();
      await fetch('/api/billing/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.session?.access_token ?? ''}` },
        body: JSON.stringify({ org_id: orgId }),
      }).catch(() => null);
      setMsg({ ok: true, text: t('addon.saved') });
      await Promise.all([load(), reload()]);
    } catch (e) {
      const m = (e as Error).message;
      setMsg({ ok: false, text: m.includes('IN_USE_USERS') ? t('addon.inUseUsers') : m.includes('IN_USE_BRANCHES') ? t('addon.inUseBranches')
        : m.includes('IN_USE_STORAGE') ? t('addon.inUseStorage') : t('bill.error') });
    } finally { setAdBusy(false); }
  };
  useEffect(() => { load(); }, [load]);

  // Al volver del pago: el aviso de la pasarela puede tardar unos segundos
  useEffect(() => {
    if (typeof window === 'undefined' || !new URLSearchParams(window.location.search).has('pagado')) return;
    setMsg({ ok: true, text: t('bill.thanks') });
    const h = setTimeout(() => { load(); reload(); }, 6000);
    return () => clearTimeout(h);
  }, [load, reload, t]);

  const pay = async (plan?: string) => {
    setBusy(plan ?? 'current'); setMsg(null);
    try {
      const { data: s } = await supabase.auth.getSession();
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.session?.access_token ?? ''}` },
        body: JSON.stringify({ org_id: orgId, plan_code: plan }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.changed) { setMsg({ ok: true, text: t('bill.planChanged') }); setTimeout(() => { load(); reload(); }, 5000); setBusy(null); return; }
      if (res.ok && j.url) { window.location.href = j.url; return; }
      setMsg({ ok: false, text: j.error === 'BILLING_NOT_CONFIGURED' ? t('bill.notConfigured') : t('bill.error') });
    } catch { setMsg({ ok: false, text: t('bill.error') }); }
    setBusy(null);
  };

  if (!b) return <p className={`text-sm ${ui.muted}`}>{t('addon.saving')}</p>;

  const current = b.plans.find((p) => p.code === b.plan_code);
  const trialLeft = b.trial_ends_at ? Math.ceil((new Date(b.trial_ends_at).getTime() - Date.now()) / 86_400_000) : 0;
  const inTrial = !b.subscribed && trialLeft > 0 && b.status === 'active';
  const status = b.status === 'suspended' ? { label: t('bill.st.suspended'), cls: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300' }
    : b.status === 'past_due_grace' ? { label: t('bill.st.grace', { date: day(b.grace_ends_at) }), cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' }
    : inTrial ? { label: b.is_pilot ? t('bill.st.pilot', { days: trialLeft }) : t('bill.st.trial', { days: trialLeft }), cls: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300' }
    : { label: t('bill.st.active'), cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' };
  const fullPrice = current ? Number(current.price) : Number(b.price_now);

  return (
    <div className="space-y-5">
      <div className="min-w-0">
        <h1 className="text-xl font-extrabold sm:text-2xl">💳 {isStreet ? t('street.nav') : t('nav.plan')}</h1>
        <p className={`text-sm ${ui.muted}`}>{t('bill.subtitle')}</p>
      </div>

      {msg && (
        <p className={`rounded-xl border p-3 text-sm font-semibold ${msg.ok
          ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300'
          : 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300'}`}>{msg.text}</p>
      )}

      {!isStreet && (<>
      <Card className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className={`text-xs font-semibold ${ui.muted}`}>{t('bill.current')}</p>
            <p className="text-2xl font-extrabold">{current?.name ?? b.plan_code}</p>
            <span className={`mt-1 inline-block rounded-md px-2 py-0.5 text-xs font-bold ${status.cls}`}>{status.label}</span>
          </div>
          <div className="text-end">
            <p className="text-2xl font-extrabold">{usd(b.price_now)}<span className={`text-sm font-semibold ${ui.muted}`}> {t('common.perMonth')}</span></p>
            {Number(b.price_now) < fullPrice && <p className={`text-sm line-through ${ui.muted}`}>{usd(fullPrice)}</p>}
            <p className={`text-xs ${ui.muted}`}>{t('bill.plusTax')}</p>
          </div>
        </div>

        <ul className={`space-y-1 text-sm ${ui.muted}`}>
          {b.founder_active && <li>🏅 {t('bill.founder', { pct: b.founder_discount_pct, date: day(b.founder_until) })}</li>}
          {Number(b.referral_credit_pct ?? 0) > 0 && <li>🎁 {t('bill.refDiscount', { pct: b.referral_credit_pct ?? 0 })}</li>}
          {inTrial && <li>🧪 {t('bill.trialEnds', { date: day(b.trial_ends_at) })}</li>}
          {b.subscribed && !b.cancel_at && b.next_billing_date && <li>🔁 {t('bill.renews', { date: day(b.next_billing_date) })}</li>}
          {b.cancel_at && <li>⏹️ {t('bill.cancelAt', { date: day(b.cancel_at) })}</li>}
        </ul>

        <div className="flex flex-col gap-2 sm:flex-row">
          {b.subscribed ? (
            <button type="button" disabled={!!busy} onClick={() => pay()} className={`${ui.btnPrimary} sm:flex-1`}>{busy ? t('addon.saving') : t('bill.manage')}</button>
          ) : (
            <button type="button" disabled={!!busy} onClick={() => pay()} className={`${ui.btnPrimary} sm:flex-1`}>{busy === 'current' ? t('addon.saving') : t('bill.payCard')}</button>
          )}
        </div>
        <p className={`text-xs ${ui.muted}`}>{b.subscribed ? t('bill.manageHint') : t('bill.payHint')}</p>
      </Card>

      {/* Extras */}
      {ad && ad.items.length > 0 && (
        <Card className="space-y-4">
          <div>
            <h2 className="font-bold">➕ {t('addon.title')}</h2>
            <p className={`text-xs ${ui.muted}`}>{t('addon.hint')}</p>
            {ad.items.some((it) => it.code !== 'storage' && it.max === 0) && <p className={`mt-1 text-xs font-semibold ${ui.muted}`}>⬆️ {t('addon.upgradeHint')}</p>}
          </div>
          <ul className="space-y-3">
            {ad.items.filter((it) => it.max > 0 || it.qty > 0).map((it) => {
              const q = qty[it.code] ?? 0;
              const usage = it.code === 'user' ? t('addon.usageUsers', { used: ad.used.users, max: ad.limits.users })
                : it.code === 'branch' ? t('addon.usageBranches', { used: ad.used.branches, max: ad.limits.branches })
                : t('addon.usageStorage', { used: (ad.used.storage_mb / 1024).toFixed(1), max: (ad.limits.storage_mb / 1024).toFixed(1) });
              return (
                <li key={it.code} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-semibold">{t(`addon.${it.code}` as 'addon.user', { gb: Math.round(it.unit_mb / 1024) })}</p>
                    <p className={`text-xs ${ui.muted}`}>{usd(it.price)} {t('addon.perUnit')} · {usage}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center rounded-xl border border-slate-300 dark:border-slate-700">
                      <button type="button" disabled={q <= 0} onClick={() => setQty({ ...qty, [it.code]: q - 1 })} aria-label="−" className="h-10 w-10 text-lg font-bold cursor-pointer disabled:opacity-40">−</button>
                      <span className="w-10 text-center font-extrabold">{q}</span>
                      <button type="button" disabled={q >= it.max} onClick={() => setQty({ ...qty, [it.code]: q + 1 })} aria-label="+" className="h-10 w-10 text-lg font-bold cursor-pointer disabled:opacity-40">+</button>
                    </div>
                    <span className="w-24 text-end text-sm font-bold">{usd(q * Number(it.price))}</span>
                  </div>
                </li>
              );
            })}
          </ul>
          {(() => {
            const total = ad.items.reduce((sum, it) => sum + (qty[it.code] ?? 0) * Number(it.price), 0);
            const changed = ad.items.some((it) => (qty[it.code] ?? 0) !== it.qty);
            return (
              <div className="flex flex-col gap-3 border-t border-slate-200 pt-3 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
                <p className="font-extrabold">{t('addon.total', { amount: usd(total) })} <span className={`text-xs font-semibold ${ui.muted}`}>{t('bill.plusTax')}</span></p>
                <button type="button" disabled={!changed || adBusy} onClick={saveAddons} className={`${ui.btnPrimary} max-sm:w-full`}>
                  {adBusy ? t('addon.saving') : t('addon.save')}
                </button>
              </div>
            );
          })()}
          <p className={`text-xs ${ui.muted}`}>{b.subscribed ? t('addon.billingCard') : t('addon.billingNext')}</p>
        </Card>
      )}

      {/* Planes */}
      <div>
        <h2 className="mb-3 font-bold">{t('bill.plans')}</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {b.plans.map((p) => {
            const isCurrent = p.code === b.plan_code;
            return (
              <Card key={p.code} className={isCurrent ? 'ring-2 ring-blue-500' : ''}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-lg font-bold">{p.name}</p>
                  {isCurrent && <span className="rounded-full bg-blue-600 px-2.5 py-0.5 text-[11px] font-bold text-white">{t('bill.yourPlan')}</span>}
                </div>
                <p className={`text-xs ${ui.muted}`}>{k(`plan.${p.code}.desc`)}</p>
                <p className="mt-3 text-2xl font-extrabold">{usd(p.price)}<span className={`text-sm font-semibold ${ui.muted}`}> {t('common.perMonth')}</span></p>
                <ul className="mt-3 space-y-1 text-sm">
                  <li>✓ {t('bill.limBranches', { n: p.max_branches })}</li>
                  <li>✓ {t('bill.limUsers', { n: p.max_users })}</li>
                  {p.max_companies > 1 && <li>✓ {t('bill.limCompanies', { n: p.max_companies })}</li>}
                  <li>✓ {t('bill.limStorage', { n: Math.round(p.max_storage_mb / 1024) })}</li>
                  <li>✓ {t('bill.limStore', { n: p.max_store_products })}</li>
                </ul>
                {!isCurrent && (
                  <button type="button" disabled={!!busy} onClick={() => pay(p.code)} className={`${ui.btnGhost} mt-4 w-full`}>
                    {busy === p.code ? t('addon.saving') : t('bill.choose')}
                  </button>
                )}
              </Card>
            );
          })}
        </div>
        <p className={`mt-3 text-xs ${ui.muted}`}>{b.region === 'latam' ? t('bill.regionLatam') : t('bill.regionGlobal')} {t('bill.mor')}</p>
      </div>

      <Card>
        <h2 className="font-bold">{t('bill.qrTitle')}</h2>
        <p className={`mt-1 text-sm ${ui.muted}`}>{t('bill.qrText')}</p>
        <a href="mailto:hola@veltrixsystem.app?subject=Pago%20Veltrix" className={`${ui.btnGhost} mt-3 max-sm:w-full`}>✉️ hola@veltrixsystem.app</a>
      </Card>

      </>)}

      {orgId && <StreetPlan orgId={orgId} onPrice={setStreetBs} />}

      {orgId && <TransferPay orgId={orgId} monthly={Number(b.price_now)} currency="USD" monthlyBs={streetBs} />}

      <ExportData />

      <Card className="!p-0 overflow-hidden">
        <h2 className="border-b border-slate-200 p-4 font-bold dark:border-slate-800">{t('bill.history')}</h2>
        {b.history.length === 0 ? <p className={`p-5 text-sm ${ui.muted}`}>{t('bill.noHistory')}</p> : (
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {b.history.map((h, i) => (
              <li key={i} className="flex items-center justify-between gap-3 p-4 text-sm">
                <div className="min-w-0">
                  <p className="font-semibold">{day(h.at)}</p>
                  <p className={`text-xs ${ui.muted}`}>{t(`bill.h.${h.status}` as 'bill.h.paid')}{h.period_end ? ` · ${t('bill.until', { date: day(h.period_end) })}` : ''}</p>
                </div>
                <p className={`shrink-0 font-bold ${h.status === 'paid' ? '' : 'text-slate-400 line-through'}`}>{usd(h.amount)}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
