'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLanguage, COUNTRIES, LANGUAGES, CountryCode, LangCode } from './language-selector';
import { useT, countryName } from './i18n';
import { ThemeToggle } from './theme';
import { InstallAppButton } from './pwa';

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

/** Idioma principal de un país (por su locale). Si no lo tenemos, inglés. */
export function langForCountry(code: CountryCode): LangCode {
  const loc = COUNTRIES.find((c) => c.code === code)?.locale ?? 'en';
  const base = loc.split('-')[0] as LangCode;
  return LANGUAGES.some((l) => l.code === base) ? base : 'en';
}

/** Al elegir país también cambia el idioma; el selector de idioma queda para quien prefiera otro. */
export function useCountryChange() {
  const { setCountryByCode, setLanguage } = useLanguage();
  return (code: CountryCode) => {
    setCountryByCode(code);
    setLanguage(langForCountry(code));
  };
}

export function RegionSelectors({ stacked = false }: { stacked?: boolean }) {
  const { lang, setLanguage, country } = useLanguage();
  const { t } = useT();
  const changeCountry = useCountryChange();
  const sorted = [...COUNTRIES]
    .map((c) => ({ ...c, label: countryName(lang, c.code, c.name) }))
    .sort((a, b) => a.label.localeCompare(b.label, lang));
  return (
    <div className={stacked ? 'grid grid-cols-2 gap-2' : 'flex items-center gap-2'}>
      <select
        aria-label={t('common.country')}
        value={country.code}
        onChange={(e) => changeCountry(e.target.value as CountryCode)}
        className={`${selectCls} ${stacked ? 'h-11 w-full' : 'max-w-[11rem]'}`}
      >
        {sorted.map((c) => (
          <option key={c.code} value={c.code}>
            {c.flag} {c.label}
          </option>
        ))}
      </select>
      <select
        aria-label={t('common.language')}
        value={lang}
        onChange={(e) => setLanguage(e.target.value as LangCode)}
        className={`${selectCls} ${stacked ? 'h-11 w-full' : 'hidden sm:block'}`}
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
  const { t } = useT();
  const [open, setOpen] = useState(false);
  return (
    <header className="safe-top sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800/80 dark:bg-slate-950/90">
      <div className="mx-auto flex max-w-7xl 2xl:max-w-[1440px] items-center justify-between gap-3 px-4 py-3">
        <Logo />

        {/* Computadora y tablet: todo a la vista */}
        <div className="hidden min-w-0 items-center gap-2 lg:flex">
          <RegionSelectors />
          <InstallAppButton className={`${ui.btnGhost} !py-2`} />
          <ThemeToggle />
          {showAuthButtons && (
            <>
              <Link href="/ingresar" className={`${ui.btnGhost} !py-2`}>{t('common.login')}</Link>
              <Link href="/registro" className={`${ui.btnPrimary} !py-2`}>{t('common.freeTrial')}</Link>
            </>
          )}
        </div>

        {/* Celular: solo lo esencial + menú */}
        <div className="flex items-center gap-2 lg:hidden">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={t('shell.menu')}
            aria-expanded={open}
            className="grid h-10 w-10 cursor-pointer place-items-center rounded-lg border border-slate-300 text-lg dark:border-slate-700"
          >
            {open ? '✕' : '☰'}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-slate-200 px-4 pb-4 pt-3 lg:hidden dark:border-slate-800">
          <div className="mx-auto flex max-w-md flex-col gap-3">
            <RegionSelectors stacked />
            <InstallAppButton className={`${ui.btnGhost} w-full`} />
            {showAuthButtons && (
              <div className="grid grid-cols-2 gap-2">
                <Link href="/ingresar" onClick={() => setOpen(false)} className={ui.btnGhost}>{t('common.login')}</Link>
                <Link href="/registro" onClick={() => setOpen(false)} className={ui.btnPrimary}>{t('common.freeTrial')}</Link>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

export function SiteFooter() {
  // El año se calcula en el navegador: con cacheComponents no se puede leer la fecha al prerenderizar
  const [year, setYear] = useState(2026);
  useEffect(() => setYear(new Date().getFullYear()), []);
  const { t } = useT();
  return (
    <footer className="mt-auto border-t border-slate-200 px-4 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] text-center text-xs text-slate-500 dark:border-slate-800 dark:text-slate-500">
      {t('footer.text', { year })}
    </footer>
  );
}

/** Campo de contraseña con botón de ojito para mostrar u ocultar lo que se escribe */
export function PasswordInput({
  value, onChange, autoComplete = 'current-password', placeholder, required = false, className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  placeholder?: string;
  required?: boolean;
  className?: string;
}) {
  const { t } = useT();
  const [show, setShow] = useState(false);
  const label = show ? t('common.hidePassword') : t('common.showPassword');
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        required={required}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className={`${ui.input} pe-12 ${className}`}
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        aria-label={label}
        title={label}
        aria-pressed={show}
        className="absolute inset-y-0 end-0 grid w-12 cursor-pointer place-items-center text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
      >
        {show ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 3l18 18" />
            <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
            <path d="M9.9 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2M6.6 6.6C3.9 8.4 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}
