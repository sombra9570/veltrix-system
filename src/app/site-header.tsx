'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLanguage, COUNTRIES, LANGUAGES, CountryCode, LangCode } from './language-selector';
import { ThemeToggle } from './theme';

// Estilos compartidos por las pantallas públicas (inicio, ingresar, registro)
export const ui = {
  card: 'bg-white border border-slate-200 shadow-sm dark:bg-slate-900/80 dark:border-slate-800 dark:shadow-none',
  input:
    'w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-500',
  label: 'block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1',
  muted: 'text-slate-500 dark:text-slate-400',
  btnPrimary:
    'inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-500 disabled:opacity-50 transition cursor-pointer',
  btnGhost:
    'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-500 transition cursor-pointer',
};

const selectCls =
  'h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200';

export function RegionSelectors() {
  const { lang, setLanguage, country, setCountryByCode } = useLanguage();
  return (
    <div className="flex items-center gap-2">
      <select
        aria-label="País"
        value={country.code}
        onChange={(e) => setCountryByCode(e.target.value as CountryCode)}
        className={selectCls}
      >
        {COUNTRIES.map((c) => (
          <option key={c.code} value={c.code}>
            {c.flag} {c.name}
          </option>
        ))}
      </select>
      <select
        aria-label="Idioma"
        value={lang}
        onChange={(e) => setLanguage(e.target.value as LangCode)}
        className={`${selectCls} hidden sm:block`}
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.flag} {l.name}
          </option>
        ))}
      </select>
    </div>
  );
}

export function Logo() {
  return (
    <Link href="/" className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">
      Veltrix <span className="text-blue-600 dark:text-blue-500">System</span>
    </Link>
  );
}

export function SiteHeader({ showAuthButtons = true }: { showAuthButtons?: boolean }) {
  return (
    <header className="border-b border-slate-200 dark:border-slate-800/80">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Logo />
        <div className="flex flex-wrap items-center gap-2">
          <RegionSelectors />
          <ThemeToggle />
          {showAuthButtons && (
            <>
              <Link href="/ingresar" className={`${ui.btnGhost} !py-2`}>
                Ingresar
              </Link>
              <Link href="/registro" className={`${ui.btnPrimary} !py-2`}>
                Prueba gratis
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  // El año se calcula en el navegador: con cacheComponents no se puede leer la fecha al prerenderizar
  const [year, setYear] = useState(2026);
  useEffect(() => setYear(new Date().getFullYear()), []);
  return (
    <footer className="mt-auto border-t border-slate-200 py-6 text-center text-xs text-slate-500 dark:border-slate-800 dark:text-slate-500">
      Veltrix System © {year} · Control financiero para negocios
    </footer>
  );
}
