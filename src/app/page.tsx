'use client';
import Link from 'next/link';
import { useVeltrixAuth, homeForRole } from './auth-system';
import { useLanguage } from './language-selector';
import { BUSINESS_KINDS, categoriesForKind, kindKey, catKey } from './business-catalog';
import { SiteHeader, SiteFooter, ui } from './site-header';
import { useT } from './i18n';
import type { DictKey } from './i18n/es';

const FEATURES: { icon: string; n: number }[] = [
  { icon: '🧾', n: 1 }, { icon: '💵', n: 2 }, { icon: '🛵', n: 3 },
  { icon: '📦', n: 4 }, { icon: '🍽️', n: 5 }, { icon: '📊', n: 6 },
];

// Precios anclados en dólares; la app los muestra en la moneda local con el tipo de cambio del día.
// Latinoamérica tiene precio regional (poder adquisitivo); el resto del mundo, precio global.
const LATAM = new Set(['BO', 'MX', 'CO', 'AR', 'CL', 'PE', 'BR', 'EC', 'PY', 'UY', 'VE', 'GT', 'HN', 'SV', 'NI', 'CR', 'PA', 'DO', 'PR', 'CU']);
const PRICES = {
  latam: { starter: 19, pro: 40, enterprise: 115, extraBranch: 10 },
  global: { starter: 29, pro: 59, enterprise: 199, extraBranch: 15 },
};
const PLANS: { id: 'starter' | 'pro' | 'enterprise'; name: string; best?: boolean }[] = [
  { id: 'starter', name: 'Starter' },
  { id: 'pro', name: 'Pro', best: true },
  { id: 'enterprise', name: 'Enterprise' },
];

export default function HomePage() {
  const { loaded, session } = useVeltrixAuth();
  const { formatMoney, country } = useLanguage();
  const prices = LATAM.has(country.code) ? PRICES.latam : PRICES.global;
  const { t } = useT();
  const k = (key: string) => t(key as DictKey);

  return (
    <main className="flex min-h-dvh flex-col">
      <SiteHeader showAuthButtons={!(loaded && session)} />

      {/* PORTADA */}
      <section className="mx-auto w-full max-w-7xl 2xl:max-w-[1440px] px-4 pt-10 pb-10 text-center sm:pt-16 sm:pb-12">
        <span className="rounded-full border border-blue-300 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300">
          {t('home.badge')}
        </span>
        <h1 className="mx-auto mt-5 max-w-3xl text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl md:text-5xl">
          {t('home.title1')}{' '}
          <span className="text-blue-600 dark:text-blue-500">{t('home.title2')}</span>
        </h1>
        <p className={`mx-auto mt-4 max-w-2xl text-base ${ui.muted}`}>{t('home.subtitle')}</p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          {loaded && session ? (
            <Link href={homeForRole(session.role)} className={`${ui.btnPrimary} px-7 py-3`}>{t('home.ctaPanel')}</Link>
          ) : (
            <>
              <Link href="/registro" className={`${ui.btnPrimary} px-7 py-3`}>{t('home.ctaTrial')}</Link>
              <Link href="/ingresar" className={`${ui.btnGhost} px-7 py-3`}>{t('home.ctaHaveAccount')}</Link>
            </>
          )}
        </div>
        <p className={`mt-3 text-xs ${ui.muted}`}>{t('home.noCard')}</p>
      </section>

      {/* PARA QUÉ NEGOCIOS */}
      <section className="mx-auto w-full max-w-7xl 2xl:max-w-[1440px] px-4 py-10">
        <h2 className="text-center text-xl font-extrabold sm:text-2xl">{t('home.forYourBusiness')}</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {BUSINESS_KINDS.filter((kd) => kd.id !== 'mixed').map((kd) => (
            <div key={kd.id} className={`rounded-2xl p-5 ${ui.card}`}>
              <p className="text-lg font-bold">{kd.icon} {t(kindKey(kd.id))}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {categoriesForKind(kd.id).map((c) => (
                  <span key={c.id} className="rounded-full border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300">
                    {c.icon} {t(catKey(c.id))}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className={`mt-3 text-center text-xs ${ui.muted}`}>{t('home.mixedHint')}</p>
      </section>

      {/* FUNCIONES */}
      <section className="mx-auto w-full max-w-7xl 2xl:max-w-[1440px] px-4 py-10">
        <h2 className="text-center text-xl font-extrabold sm:text-2xl">{t('home.featuresTitle')}</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.n} className={`rounded-2xl p-5 ${ui.card}`}>
              <p className="text-2xl">{f.icon}</p>
              <p className="mt-2 font-bold">{k(`home.f${f.n}.title`)}</p>
              <p className={`mt-1 text-sm ${ui.muted}`}>{k(`home.f${f.n}.desc`)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* PLANES */}
      <section className="mx-auto w-full max-w-7xl 2xl:max-w-[1440px] px-4 py-10">
        <h2 className="text-center text-xl font-extrabold sm:text-2xl">{t('home.plansTitle')}</h2>
        <p className={`mt-1 text-center text-sm ${ui.muted}`}>{t('home.plansSubtitle')}</p>
        <p className={`text-center text-xs ${ui.muted}`}>{t('home.pricesLocal')} {t('home.plusTax')}</p>
        <div className="mt-8 grid gap-6 md:grid-cols-3 md:gap-4">
          {PLANS.map((p) => (
            <div key={p.id} className={`relative rounded-2xl p-6 ${ui.card} ${p.best ? 'ring-2 ring-blue-500' : ''}`}>
              {p.best && (
                <span className="absolute -top-3 left-6 rounded-full bg-blue-600 px-3 py-0.5 text-[11px] font-bold text-white">
                  {t('home.bestPlan')}
                </span>
              )}
              <p className="text-lg font-bold">{p.name}</p>
              <p className={`text-xs ${ui.muted}`}>{k(`plan.${p.id}.desc`)}</p>
              <p className="mt-4 text-2xl font-extrabold sm:text-3xl">
                {formatMoney(prices[p.id])}
                <span className={`text-sm font-semibold ${ui.muted}`}> {t('common.perMonth')}</span>
              </p>
              <ul className="mt-4 space-y-1.5 text-sm">
                {[1, 2, 3].map((i) => (
                  <li key={i}>✓ {k(`plan.${p.id}.i${i}`)}</li>
                ))}
              </ul>
              <Link href="/registro" className={`${p.best ? ui.btnPrimary : ui.btnGhost} mt-6 w-full`}>
                {t('home.startFree')}
              </Link>
            </div>
          ))}
        </div>
        <p className={`mt-4 text-center text-sm font-semibold ${ui.muted}`}>
          {t('home.extraBranch', { price: formatMoney(prices.extraBranch) })}
        </p>
      </section>

      <SiteFooter />
    </main>
  );
}
