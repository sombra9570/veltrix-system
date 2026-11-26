'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useVeltrixAuth, homeForRole } from './auth-system';
import { SiteHeader, SiteFooter, ui } from './site-header';
import { useT } from './i18n';
import type { DictKey } from './i18n/es';
import { HomeShowcase } from './home-showcase';
import { useRouter } from 'next/navigation';
import { isInstalledApp } from '../lib/standalone';

// Roles: cada persona trabaja en su propio panel
const ROLES: [string, string][] = [
  ['owner', '👔'], ['supervisor', '🧭'], ['cashier', '💵'], ['vendor', '🛒'], ['storekeeper', '📦'],
  ['accountant', '📈'], ['collector', '🛵'], ['waiter', '🍽️'], ['kitchen', '🔥'], ['technician', '🔧'],
];

export default function HomePage() {
  const { loaded, session } = useVeltrixAuth();
  const { t } = useT();
  const k = (key: string) => t(key as DictKey);
  const [faq, setFaq] = useState<number | null>(0);

  const router = useRouter();
  // En la app instalada (PWA / APK) se entra directo al panel o a ingresar, sin la portada comercial
  useEffect(() => {
    if (loaded && isInstalledApp()) router.replace(session ? homeForRole(session.role) : '/ingresar');
  }, [loaded, session, router]);

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
        <div id="demo" className="scroll-mt-20"><HomeShowcase /></div>
      </section>

      {/* OPERACIÓN CONECTADA: una acción alimenta a todo el sistema */}
      <section className={`${wrap} py-12`}>
        <h2 className="text-center text-2xl font-extrabold sm:text-3xl">{t('home.flow.title')}</h2>
        <p className={`mx-auto mt-2 max-w-2xl text-center ${ui.muted}`}>{t('home.flow.sub')}</p>
        <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {(['🧾', '🍽️', '💵', '🏢'] as const).map((ic, i) => (
            <li key={i} className={`rounded-2xl p-5 ${ui.card}`}>
              <p className="text-2xl">{ic}</p>
              <p className="mt-3 font-bold">{k(`home.flow${i + 1}.a`)}</p>
              <p className={`mt-1 text-sm ${ui.muted}`}>→ {k(`home.flow${i + 1}.b`)}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* UNA PLATAFORMA, DISTINTOS EQUIPOS */}
      <section className={`${wrap} py-12`}>
        <h2 className="text-center text-2xl font-extrabold sm:text-3xl">{t('home.roles.title')}</h2>
        <p className={`mx-auto mt-2 max-w-2xl text-center ${ui.muted}`}>{t('home.roles.sub')}</p>
        <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {ROLES.map(([r, ic]) => (
            <li key={r} className={`rounded-2xl p-4 ${ui.card}`}>
              <p className="font-bold">{ic} {k(`role.${r}`)}</p>
              <p className={`mt-1 text-sm ${ui.muted}`}>{k(`home.rd.${r}`)}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* SOLUCIONES POR FORMA DE OPERAR */}
      <section className={`${wrap} py-12`}>
        <h2 className="text-center text-2xl font-extrabold sm:text-3xl">{t('home.v.title')}</h2>
        <p className={`mx-auto mt-2 max-w-2xl text-center ${ui.muted}`}>{t('home.v.sub')}</p>
        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {(['🏪', '🛵', '🍽️', '🔧'] as const).map((ic, i) => (
            <div key={i} className={`rounded-2xl p-6 ${ui.card}`}>
              <p className="text-3xl">{ic}</p>
              <h3 className="mt-3 text-lg font-extrabold">{k(`home.v${i + 1}.t`)}</h3>
              <p className={`mt-2 text-sm ${ui.muted}`}>{k(`home.v${i + 1}.d`)}</p>
            </div>
          ))}
        </div>
        <p className={`mt-4 text-center text-xs ${ui.muted}`}>{t('home.mixedHint')}</p>
      </section>

      {/* POR QUÉ VELTRIX */}
      <section className={`${wrap} py-12`}>
        <h2 className="text-center text-2xl font-extrabold sm:text-3xl">{t('home.why.title')}</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className={`rounded-2xl p-6 ${ui.card}`}>
              <h3 className="font-extrabold text-blue-700 dark:text-blue-400">{k(`home.why${i}.t`)}</h3>
              <p className={`mt-2 text-sm ${ui.muted}`}>{k(`home.why${i}.d`)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* SEGURIDAD: solo garantías que cumplimos */}
      <section className={`${wrap} py-12`}>
        <div className={`rounded-3xl p-6 sm:p-10 ${ui.card}`}>
          <h2 className="text-center text-2xl font-extrabold sm:text-3xl">🔐 {t('home.sec.title')}</h2>
          <p className={`mx-auto mt-2 max-w-2xl text-center ${ui.muted}`}>{t('home.sec.sub')}</p>
          <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <li key={i}>
                <p className="font-bold">✓ {k(`home.sec${i}.t`)}</p>
                <p className={`mt-1 text-sm ${ui.muted}`}>{k(`home.sec${i}.d`)}</p>
              </li>
            ))}
          </ul>
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

      {/* PRIMERO ENTENDEMOS EL NEGOCIO: no se muestran precios antes del diagnóstico */}
      <section id="planes" className={`${wrap} py-10`}>
        <div className={`mx-auto max-w-3xl rounded-3xl p-6 text-center sm:p-8 ${ui.card}`}>
          <h2 className="text-xl font-extrabold sm:text-2xl">{t('home.needTitle')}</h2>
          <p className={`mt-2 text-sm ${ui.muted}`}>{t('home.needSub')}</p>
          <ul className={`mx-auto mt-4 grid max-w-xl gap-2 text-start text-sm sm:grid-cols-2 ${ui.muted}`}>
            {[1, 2, 3, 4].map((i) => <li key={i}>✓ {k(`home.need.b${i}`)}</li>)}
          </ul>
          <div className="mt-6">{cta}</div>
        </div>
      </section>

      {/* PREGUNTAS FRECUENTES */}
      <section className="mx-auto w-full max-w-3xl px-4 py-10">
        <h2 className="text-center text-xl font-extrabold sm:text-2xl">{t('home.faq.title')}</h2>
        <ul className="mt-6 space-y-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
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
