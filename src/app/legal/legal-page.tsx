'use client';
import { SiteHeader, SiteFooter, ui } from '../site-header';
import { useT } from '../i18n';
import { LEGAL, type LegalKind } from './content';

/** Página legal: español (oficial) para quien usa la app en español; inglés para los demás idiomas */
export function LegalPage({ kind }: { kind: LegalKind }) {
  const { t, lang } = useT();
  const doc = LEGAL[lang === 'es' ? 'es' : 'en'][kind];
  return (
    <main className="flex min-h-dvh flex-col">
      <SiteHeader />
      <article className="mx-auto w-full max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-extrabold sm:text-3xl">{doc.title}</h1>
        <p className={`mt-1 text-xs ${ui.muted}`}>{t('legal.updated', { date: doc.updated })}</p>
        {lang !== 'es' && lang !== 'en' && <p className={`mt-3 rounded-xl border border-slate-200 p-3 text-xs dark:border-slate-800 ${ui.muted}`}>{t('legal.langNote')}</p>}
        <p className="mt-6 leading-relaxed">{doc.intro}</p>
        {doc.sections.map((s) => (
          <section key={s.h} className="mt-6">
            <h2 className="text-lg font-bold">{s.h}</h2>
            {s.p.map((p, i) => <p key={i} className={`mt-2 leading-relaxed ${ui.muted}`}>{p}</p>)}
          </section>
        ))}
      </article>
      <SiteFooter />
    </main>
  );
}
