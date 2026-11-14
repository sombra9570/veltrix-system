'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useVeltrixAuth, homeForRole } from './auth-system';
import { useLanguage } from './language-selector';
import { BUSINESS_CATEGORIES, catKey, modKey } from './business-catalog';
import { SiteHeader, SiteFooter, ui } from './site-header';
import { useT } from './i18n';
import { rpc } from '../lib/supabase';
import type { DictKey } from './i18n/es';
import { HomeShowcase } from './home-showcase';

// Funciones en orden de prioridad: lo que más buscan cobradores y vendedores a plazos va primero
const FEATURES: { icon: string; n: number }[] = [
  { icon: '🛵', n: 3 }, { icon: '🧾', n: 7 }, { icon: '💵', n: 2 }, { icon: '🛒', n: 1 },
  { icon: '📦', n: 4 }, { icon: '📊', n: 6 }, { icon: '🛍️', n: 8 }, { icon: '🍽️', n: 5 }, { icon: '🔐', n: 9 },
];

// Precio regional: Latinoamérica paga el precio regional; el resto, el internacional (los dos salen de la base)
const LATAM = new Set(['BO', 'MX', 'CO', 'AR', 'CL', 'PE', 'BR', 'EC', 'PY', 'UY', 'VE', 'GT', 'HN', 'SV', 'NI', 'CR', 'PA', 'DO', 'PR', 'CU']);
type PublicPlan = { code: string; name: string; price_usd: number; price_global_usd: number; max_companies: number; max_branches: number; max_users: number; max_storage_mb: number };
const FALLBACK: PublicPlan[] = [
  { code: 'starter', name: 'Starter', price_usd: 19, price_global_usd: 29, max_companies: 1, max_branches: 1, max_users: 3, max_storage_mb: 1024 },
  { code: 'pro', name: 'Pro', price_usd: 40, price_global_usd: 59, max_companies: 1, max_branches: 3, max_users: 15, max_storage_mb: 5120 },
  { code: 'enterprise', name: 'Enterprise', price_usd: 115, price_global_usd: 199, max_companies: 3, max_branches: 10, max_users: 50, max_storage_mb: 20480 },
];

export default function HomePage() {
  const { loaded, session } = useVeltrixAuth();
  const { formatMoney, country } = useLanguage();
  const { t } = useT();
  const k = (key: string) => t(key as DictKey);
  const latam = LATAM.has(country.code);
  const [plans, setPlans] = useState<PublicPlan[]>(FALLBACK);
  const [feature, setFeature] = useState(FEATURES[0].n);
  const [kind, setKind] = useState<'products' | 'services'>('products');
  const [cat, setCat] = useState('credit_sales');
  const [faq, setFaq] = useState<number | null>(0);

  const [extras, setExtras] = useState<{ code: string; price_usd: number; price_global_usd: number; unit_mb: number }[]>([]);
  useEffect(() => { rpc<PublicPlan[]>('public_plans').then((p) => { if (p?.length) setPlans(p); }).catch(() => {}); }, []);
  useEffect(() => { rpc<typeof extras>('public_addons').then((a) => setExtras(a ?? [])).catch(() => {}); }, []);

  const cats = BUSINESS_CATEGORIES.filter((c) => c.kind === kind);
  const selectedCat = BUSINESS_CATEGORIES.find((c) => c.id === cat) ?? cats[0];
  const f = FEATURES.find((x) => x.n === feature) ?? FEATURES[0];
  const cta = loaded && session
    ? <Link href={homeForRole(session.role)} className={`${ui.btnPrimary} px-7 py-3`}>{t('home.ctaPanel')}</Link>
    : <Link href="/registro" className={`${ui.btnPrimary} px-7 py-3`}>{t('home.ctaTrial')}</Link>;
  const wrap = 'mx-auto w-full max-w-7xl 2xl:max-w-[1440px] px-4';

  return (
    <main className="flex min-h-dvh flex-col">
      <SiteHeader showAuthButtons={!(loaded && session)} />

      {/* PORTADA: resultado claro + prueba visual + confianza, todo en la primera pantalla */}
      <section className={`${wrap} grid items-center gap-12 pt-8 pb-10 sm:pt-12 lg:grid-cols-[1fr_1.2fr] lg:pt-16`}>
        <div className="text-center lg:text-start">
          <span className="rounded-full border border-blue-300 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300">
            {t('home.badge')}
          </span>
          <h1 className="mt-5 text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl xl:text-5xl">
            {t('home.h.title1')} <span className="text-blue-600 dark:text-blue-500">{t('home.h.title2')}</span>
          </h1>
          <p className={`mx-auto mt-4 max-w-xl text-base sm:text-lg lg:mx-0 ${ui.muted}`}>{t('home.h.subtitle')}</p>
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row lg:justify-start">
            {cta}
            {!(loaded && session) && <Link href="/ingresar" className={`${ui.btnGhost} px-7 py-3`}>{t('home.ctaHaveAccount')}</Link>}
          </div>
          <ul className="mt-6 grid grid-cols-2 gap-2 text-xs font-semibold sm:flex sm:flex-wrap sm:justify-center lg:justify-start">
            {[1, 2, 3, 4].map((i) => (
              <li key={i} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 dark:border-slate-800 dark:bg-slate-900">✓ {k(`home.chip${i}`)}</li>
            ))}
          </ul>
        </div>
        <HomeShowcase />
      </section>

      {/* TODO EN UNO: módulos incluidos */}
      <section className={`${wrap} pb-6`}>
        <p className={`text-center text-xs font-bold uppercase tracking-wide ${ui.muted}`}>{t('home.sc.allInOne')}</p>
        <ul className="mt-3 flex flex-wrap justify-center gap-2 text-sm font-semibold">
          {(['🛵', '🧾', '🛒', '💵', '📦', '📊', '🔐'] as const).map((ic, i) => (
            <li key={i} className={`rounded-xl px-3 py-2 ${ui.card}`}>{ic} {k(`home.sc.mod${i + 1}`)}</li>
          ))}
        </ul>
      </section>

      {/* PROBLEMAS QUE RESUELVE */}
      <section className={`${wrap} py-10`}>
        <h2 className="text-center text-xl font-extrabold sm:text-2xl">{t('home.p.title')}</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className={`rounded-2xl p-5 ${ui.card}`}>
              <p className="font-bold">😟 {k(`home.p${i}.title`)}</p>
              <p className={`mt-2 text-sm ${ui.muted}`}>✅ {k(`home.p${i}.desc`)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FUNCIONES: lista en panel lateral + detalle */}
      <section className={`${wrap} py-10`}>
        <h2 className="text-center text-xl font-extrabold sm:text-2xl">{t('home.featuresTitle')}</h2>
        <p className={`mt-1 text-center text-sm ${ui.muted}`}>{t('home.featuresHint')}</p>
        <div className={`mt-6 grid overflow-hidden rounded-2xl md:grid-cols-[18rem_1fr] ${ui.card}`}>
          <nav className="grid grid-cols-2 gap-1 border-b border-slate-200 p-2 sm:grid-cols-3 md:grid-cols-1 md:border-b-0 md:border-e dark:border-slate-800" aria-label={t('home.featuresTitle')}>
            {FEATURES.map((x) => (
              <button key={x.n} type="button" onClick={() => setFeature(x.n)}
                className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-start text-sm font-semibold transition cursor-pointer ${feature === x.n ? 'bg-blue-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                <span className="text-lg">{x.icon}</span><span className="min-w-0">{k(`home.f${x.n}.title`)}</span>
              </button>
            ))}
          </nav>
          <div className="flex flex-col justify-center p-6 sm:p-10">
            <p className="text-5xl">{f.icon}</p>
            <h3 className="mt-4 text-2xl font-extrabold">{k(`home.f${f.n}.title`)}</h3>
            <p className={`mt-3 max-w-xl text-base ${ui.muted}`}>{k(`home.f${f.n}.desc`)}</p>
            <div className="mt-6">{cta}</div>
          </div>
        </div>
      </section>

      {/* TIPO DE NEGOCIO: rubros en panel lateral + lo que se activa */}
      <section className={`${wrap} py-10`}>
        <h2 className="text-center text-xl font-extrabold sm:text-2xl">{t('home.forYourBusiness')}</h2>
        <p className={`mt-1 text-center text-sm ${ui.muted}`}>{t('home.bizHint')}</p>
        <div className={`mt-6 grid overflow-hidden rounded-2xl md:grid-cols-[18rem_1fr] ${ui.card}`}>
          <div className="border-b border-slate-200 md:border-b-0 md:border-e dark:border-slate-800">
            <div className="grid grid-cols-2 gap-1 p-2">
              {(['products', 'services'] as const).map((kd) => (
                <button key={kd} type="button" onClick={() => { setKind(kd); setCat(BUSINESS_CATEGORIES.find((c) => c.kind === kd)!.id); }}
                  className={`rounded-lg px-3 py-2 text-sm font-semibold cursor-pointer ${kind === kd ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'border border-slate-200 dark:border-slate-700'}`}>
                  {kd === 'products' ? '📦' : '🛠️'} {k(`kind.${kd}`)}
                </button>
              ))}
            </div>
            <ul className="grid max-h-80 grid-cols-1 gap-1 overflow-y-auto overscroll-contain p-2 pt-0 sm:grid-cols-2 md:grid-cols-1">
              {cats.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => setCat(c.id)}
                    className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-start text-sm transition cursor-pointer ${selectedCat?.id === c.id ? 'bg-blue-600 font-semibold text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                    <span>{c.icon}</span><span className="min-w-0">{t(catKey(c.id))}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          {selectedCat && (
            <div className="flex flex-col justify-center p-6 sm:p-10">
              <p className="text-5xl">{selectedCat.icon}</p>
              <h3 className="mt-4 text-2xl font-extrabold">{t(catKey(selectedCat.id))}</h3>
              <p className={`mt-3 text-sm font-semibold ${ui.muted}`}>{t('home.bizModules')}</p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {selectedCat.modules.map((m) => (
                  <li key={m} className="rounded-full border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300">✓ {t(modKey(m))}</li>
                ))}
              </ul>
              <p className={`mt-4 text-xs ${ui.muted}`}>{t('home.mixedHint')}</p>
            </div>
          )}
        </div>
      </section>

      {/* CÓMO EMPIEZAS */}
      <section className={`${wrap} py-10`}>
        <h2 className="text-center text-xl font-extrabold sm:text-2xl">{t('home.how.title')}</h2>
        <ol className="mt-6 grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <li key={i} className={`rounded-2xl p-5 ${ui.card}`}>
              <span className="grid h-9 w-9 place-items-center rounded-full bg-blue-600 font-extrabold text-white">{i}</span>
              <p className="mt-3 font-bold">{k(`home.how.s${i}.title`)}</p>
              <p className={`mt-1 text-sm ${ui.muted}`}>{k(`home.how.s${i}.desc`)}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* PLANES (precios reales de la base) */}
      <section id="planes" className={`${wrap} py-10`}>
        <h2 className="text-center text-xl font-extrabold sm:text-2xl">{t('home.plansTitle')}</h2>
        <p className={`mt-1 text-center text-sm ${ui.muted}`}>{t('home.plansSubtitle')}</p>
        <p className={`text-center text-xs ${ui.muted}`}>{t('home.pricesLocal')} {t('home.plusTax')}</p>
        <div className="mt-8 grid gap-6 md:grid-cols-3 md:gap-4">
          {plans.map((p) => {
            const best = p.code === 'pro';
            return (
              <div key={p.code} className={`relative flex flex-col rounded-2xl p-6 ${ui.card} ${best ? 'ring-2 ring-blue-500' : ''}`}>
                {best && <span className="absolute -top-3 left-6 rounded-full bg-blue-600 px-3 py-0.5 text-[11px] font-bold text-white">{t('home.bestPlan')}</span>}
                <p className="text-lg font-bold">{p.name}</p>
                <p className={`text-xs ${ui.muted}`}>{k(`plan.${p.code}.desc`)}</p>
                <p className="mt-4 text-2xl font-extrabold sm:text-3xl">
                  {formatMoney(Number(latam ? p.price_usd : p.price_global_usd))}
                  <span className={`text-sm font-semibold ${ui.muted}`}> {t('common.perMonth')}</span>
                </p>
                <ul className="mt-4 flex-1 space-y-1.5 text-sm">
                  <li>✓ {t('bill.limBranches', { n: p.max_branches })}</li>
                  <li>✓ {t('bill.limUsers', { n: p.max_users })}</li>
                  {p.max_companies > 1 && <li>✓ {t('bill.limCompanies', { n: p.max_companies })}</li>}
                  <li>✓ {t('bill.limStorage', { n: Math.round(p.max_storage_mb / 1024) })}</li>
                  {[1, 2, 3].map((i) => <li key={i}>✓ {k(`plan.${p.code}.i${i}`)}</li>)}
                </ul>
                <Link href="/registro" className={`${best ? ui.btnPrimary : ui.btnGhost} mt-6 w-full`}>{t('home.startFree')}</Link>
              </div>
            );
          })}
        </div>
        {extras.length > 0 && (() => {
          const px = (c: string) => { const a = extras.find((e) => e.code === c); return a ? formatMoney(Number(latam ? a.price_usd : a.price_global_usd)) : null; };
          const st = extras.find((e) => e.code === 'storage');
          return (
            <p className={`mt-4 text-center text-xs ${ui.muted}`}>
              ➕ {t('home.extras', { user: px('user') ?? '—', branch: px('branch') ?? '—', storage: px('storage') ?? '—', gb: st ? Math.round(st.unit_mb / 1024) : 5 })}
            </p>
          );
        })()}
      </section>

      {/* PREGUNTAS FRECUENTES */}
      <section className="mx-auto w-full max-w-3xl px-4 py-10">
        <h2 className="text-center text-xl font-extrabold sm:text-2xl">{t('home.faq.title')}</h2>
        <ul className="mt-6 space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <li key={i} className={`overflow-hidden rounded-2xl ${ui.card}`}>
              <button type="button" onClick={() => setFaq(faq === i ? null : i)} aria-expanded={faq === i}
                className="flex w-full items-center justify-between gap-3 p-4 text-start font-semibold cursor-pointer">
                <span>{k(`home.faq.q${i}`)}</span><span className={ui.muted}>{faq === i ? '−' : '+'}</span>
              </button>
              {faq === i && <p className={`px-4 pb-4 text-sm ${ui.muted}`}>{k(`home.faq.a${i}`)}</p>}
            </li>
          ))}
        </ul>
      </section>

      {/* LLAMADO FINAL */}
      <section className={`${wrap} pb-12`}>
        <div className="rounded-3xl bg-blue-600 px-6 py-10 text-center text-white sm:py-12">
          <h2 className="text-2xl font-extrabold sm:text-3xl">{t('home.final.title')}</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm opacity-90 sm:text-base">{t('home.final.sub')}</p>
          <Link href={loaded && session ? homeForRole(session.role) : '/registro'}
            className="mt-6 inline-flex items-center justify-center rounded-xl bg-white px-7 py-3 text-sm font-bold text-blue-700 hover:bg-blue-50 transition">
            {loaded && session ? t('home.ctaPanel') : t('home.ctaTrial')}
          </Link>
          <p className="mt-3 text-xs opacity-80">{t('home.noCard')}</p>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
