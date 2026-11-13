'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useVeltrixAuth, homeForRole } from '../auth-system';
import { useLanguage, COUNTRIES, CountryCode } from '../language-selector';
import { useT, countryName } from '../i18n';
import {
  BUSINESS_KINDS, BusinessKind, categoriesForKind, suggestedModules, kindKey, kindDescKey, catKey, modKey,
} from '../business-catalog';
import { SiteHeader, SiteFooter, ui, useCountryChange, PasswordInput } from '../site-header';
import type { DictKey } from '../i18n/es';

const STEPS: DictKey[] = ['reg.step1', 'reg.step2', 'reg.step3', 'reg.step4'];

export default function RegistroPage() {
  const router = useRouter();
  const { loaded, session, registerCompany } = useVeltrixAuth();
  const { country, lang } = useLanguage();
  const { t } = useT();
  const changeCountry = useCountryChange();

  const [step, setStep] = useState(0);
  const [kind, setKind] = useState<BusinessKind | null>(null);
  const [cats, setCats] = useState<string[]>([]);
  const [compName, setCompName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [email, setEmail] = useState('');
  const [pass1, setPass1] = useState('');
  const [pass2, setPass2] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const chooseKind = (k: BusinessKind) => {
    setKind(k);
    const allowed = new Set(categoriesForKind(k).map((c) => c.id));
    setCats((prev) => prev.filter((id) => allowed.has(id)));
  };
  const toggleCat = (id: string) =>
    setCats((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  // Qué falta en cada paso para poder avanzar
  const stepError = (): string => {
    if (step === 0 && !kind) return t('val.chooseKind');
    if (step === 1 && cats.length === 0) return t('val.chooseCat');
    if (step === 2 && !compName.trim()) return t('val.companyName');
    if (step === 3) {
      if (!ownerName.trim()) return t('val.ownerName');
      if (!/^\S+@\S+\.\S+$/.test(email.trim())) return t('val.email');
      if (pass1.length < 8) return t('val.passMin');
      if (pass1 !== pass2) return t('val.passMatch');
    }
    return '';
  };

  const next = async () => {
    const msg = stepError();
    setError(msg);
    if (msg) return;
    if (step < STEPS.length - 1) return setStep(step + 1);

    setBusy(true);
    const ok = await registerCompany({
      name: compName.trim(),
      taxId: taxId.trim(),
      type: kind as string,
      categories: cats,
      plan: 0,
      modules: suggestedModules(cats),
      ownerName: ownerName.trim(),
      ownerEmail: email.trim(),
      ownerPassword: pass1,
    });
    setBusy(false);
    if (ok) router.push('/dashboard/owner');
  };

  const back = () => { setError(''); setStep(Math.max(0, step - 1)); };

  // Alguien con sesión abierta no debe registrar otra empresa sin salir primero
  if (loaded && session) {
    return (
      <main className="flex min-h-dvh flex-col">
        <SiteHeader showAuthButtons={false} />
        <div className="flex flex-1 items-center justify-center px-4">
          <div className={`max-w-md rounded-2xl p-7 text-center ${ui.card}`}>
            <p className="font-bold">{t('reg.sessionOpen')}</p>
            <p className={`mt-1 text-sm ${ui.muted}`}>{t('reg.sessionOpenHint')}</p>
            <Link href={homeForRole(session.role)} className={`${ui.btnPrimary} mt-4`}>{t('common.goToPanel')}</Link>
          </div>
        </div>
      </main>
    );
  }

  const modules = suggestedModules(cats);

  return (
    <main className="flex min-h-dvh flex-col">
      <SiteHeader showAuthButtons={false} />

      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:py-10">
        <div className="text-center">
          <span className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
            {t('reg.badge')}
          </span>
          <h1 className="mt-4 text-2xl font-extrabold sm:text-3xl">{t('reg.title')}</h1>
        </div>

        {/* Barra de progreso */}
        <ol className="mt-8 grid grid-cols-4 gap-2">
          {STEPS.map((s, i) => (
            <li key={s}>
              <div className={`h-1.5 rounded-full ${i <= step ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-800'}`} />
              <p className={`mt-1.5 hidden text-[11px] font-semibold sm:block ${i === step ? 'text-blue-600 dark:text-blue-400' : ui.muted}`}>
                {i + 1}. {t(s)}
              </p>
            </li>
          ))}
        </ol>
        {/* En celular solo se muestra el paso actual */}
        <p className="mt-2 text-xs font-semibold text-blue-600 sm:hidden dark:text-blue-400">
          {step + 1}/{STEPS.length} · {t(STEPS[step])}
        </p>

        <section className={`mt-6 rounded-2xl p-4 sm:p-6 ${ui.card}`}>
          {step === 0 && (
            <>
              <h2 className="text-lg font-bold">{t('reg.q1')}</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {BUSINESS_KINDS.map((k) => (
                  <button
                    key={k.id}
                    type="button"
                    onClick={() => chooseKind(k.id)}
                    className={`rounded-2xl border p-4 text-left transition cursor-pointer ${
                      kind === k.id
                        ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500/30 dark:bg-blue-950/40'
                        : 'border-slate-200 hover:border-slate-400 dark:border-slate-700 dark:hover:border-slate-500'
                    }`}
                  >
                    <p className="text-2xl">{k.icon}</p>
                    <p className="mt-2 font-bold">{t(kindKey(k.id))}</p>
                    <p className={`mt-1 text-xs ${ui.muted}`}>{t(kindDescKey(k.id))}</p>
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <h2 className="text-lg font-bold">{t('reg.q2')}</h2>
              <p className={`text-sm ${ui.muted}`}>{t('reg.q2hint')}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {categoriesForKind(kind).map((c) => {
                  const on = cats.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggleCat(c.id)}
                      className={`rounded-full border px-3.5 py-2 text-xs font-semibold transition cursor-pointer ${
                        on
                          ? 'border-blue-500 bg-blue-600 text-white'
                          : 'border-slate-300 text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-500'
                      }`}
                    >
                      {on ? '✓ ' : ''}{c.icon} {t(catKey(c.id))}
                    </button>
                  );
                })}
              </div>
              {cats.length > 0 && (
                <div className="mt-5 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-xs dark:border-emerald-500/30 dark:bg-emerald-500/10">
                  <p className="font-bold text-emerald-700 dark:text-emerald-300">{t('reg.panelIncludes')}</p>
                  <p className="mt-1 text-emerald-800 dark:text-emerald-200">
                    {modules.map((m) => t(modKey(m))).join(' · ')}
                  </p>
                </div>
              )}
            </>
          )}

          {step === 2 && (
            <>
              <h2 className="text-lg font-bold">{t('reg.companyData')}</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className={ui.label}>{t('reg.companyName')}</label>
                  <input className={ui.input} value={compName} onChange={(e) => setCompName(e.target.value)}
                    placeholder={t('reg.companyNamePh')} />
                </div>
                <div>
                  <label className={ui.label}>{t('common.country')}</label>
                  <select className={ui.input} value={country.code}
                    onChange={(e) => changeCountry(e.target.value as CountryCode)}>
                    {[...COUNTRIES].sort((x, y) => countryName(lang, x.code, x.name).localeCompare(countryName(lang, y.code, y.name), lang)).map((c) => (
                      <option key={c.code} value={c.code}>{c.flag} {countryName(lang, c.code, c.name)} ({c.currency})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={ui.label}>{t('reg.taxIdOptional', { taxId: country.taxIdName })}</label>
                  <input className={ui.input} value={taxId} onChange={(e) => setTaxId(e.target.value)}
                    placeholder={t('reg.taxIdPh', { taxId: country.taxIdName })} />
                </div>
              </div>
              <p className={`mt-3 text-xs ${ui.muted}`}>
                {t('reg.currencyInfo', { currency: country.currency, taxName: country.taxName, taxRate: country.taxRate })}
              </p>
            </>
          )}

          {step === 3 && (
            <>
              <h2 className="text-lg font-bold">{t('reg.ownerTitle')}</h2>
              <p className={`text-sm ${ui.muted}`}>{t('reg.ownerHint')}</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className={ui.label}>{t('reg.ownerName')}</label>
                  <input className={ui.input} value={ownerName} onChange={(e) => setOwnerName(e.target.value)} autoComplete="name" />
                </div>
                <div className="sm:col-span-2">
                  <label className={ui.label}>{t('common.email')}</label>
                  <input className={ui.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
                </div>
                <div>
                  <label className={ui.label}>{t('reg.passMin')}</label>
                  <PasswordInput value={pass1} onChange={setPass1} autoComplete="new-password" />
                </div>
                <div>
                  <label className={ui.label}>{t('reg.passRepeat')}</label>
                  <PasswordInput value={pass2} onChange={setPass2} autoComplete="new-password" />
                </div>
              </div>
            </>
          )}

          {error && (
            <div className="mt-5 rounded-xl border border-red-300 bg-red-50 p-3 text-xs font-semibold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
              ⚠️ {error}
            </div>
          )}

          <div className="mt-6 flex items-center justify-between gap-3">
            {step > 0 ? (
              <button type="button" onClick={back} className={ui.btnGhost}>{t('common.back')}</button>
            ) : (
              <Link href="/ingresar" className={`text-xs font-semibold ${ui.muted} hover:underline`}>
                {t('reg.haveAccount')}
              </Link>
            )}
            <button type="button" onClick={next} disabled={busy} className={ui.btnPrimary}>
              {busy ? t('reg.creating') : step === STEPS.length - 1 ? t('reg.create') : t('common.next')}
            </button>
          </div>
        </section>
      </div>

      <SiteFooter />
    </main>
  );
}
