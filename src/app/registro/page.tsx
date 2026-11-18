'use client';
import { useEffect, useState } from 'react';
import { rpc } from '../../lib/supabase';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useVeltrixAuth, homeForRole } from '../auth-system';
import { useLanguage, COUNTRIES, CountryCode } from '../language-selector';
import { useT, countryName } from '../i18n';
import {
  BUSINESS_KINDS, BusinessKind, categoriesForKind, suggestedModules, suggestedRoles, recommendPlan, TEAM_SIZES, BRANCH_SIZES, TEAM_ROLES, type TeamRole, type PublicPlan, kindKey, kindDescKey, catKey, modKey,
} from '../business-catalog';
import { SiteHeader, SiteFooter, ui, useCountryChange, PasswordInput } from '../site-header';
import type { DictKey } from '../i18n/es';

const STEPS: DictKey[] = ['reg.step1', 'reg.step2', 'need.stepTeam', 'need.stepExtras', 'need.stepSolution', 'need.stepAccount'];

export default function RegistroPage() {
  const router = useRouter();
  const { loaded, session, registerCompany } = useVeltrixAuth();
  const { country, lang } = useLanguage();
  const { t } = useT();
  const changeCountry = useCountryChange();

  const [step, setStep] = useState(0);
  const [kind, setKind] = useState<BusinessKind | null>(null);
  const [cats, setCats] = useState<string[]>([]);
  // Diagnóstico: primero entendemos qué necesita, luego recomendamos
  const [teamSize, setTeamSize] = useState<string | null>(null);
  const [branchSize, setBranchSize] = useState<string>('b1');
  const [roles, setRoles] = useState<TeamRole[]>([]);
  const [rolesTouched, setRolesTouched] = useState(false);
  const [invoice, setInvoice] = useState<string | null>(null);
  const [wantAi, setWantAi] = useState<boolean | null>(null);
  const [plans, setPlans] = useState<PublicPlan[]>([]);
  useEffect(() => { rpc<PublicPlan[]>('public_plans').then((p) => setPlans(p ?? [])).catch(() => {}); }, []);
  const [compName, setCompName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [email, setEmail] = useState('');
  const [pass1, setPass1] = useState('');
  const [pass2, setPass2] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // Invitación de otro negocio (?ref=CODIGO): 30 días gratis en vez de 14
  const [referred, setReferred] = useState(false);
  useEffect(() => {
    try {
      const code = new URLSearchParams(window.location.search).get('ref')?.trim().toUpperCase();
      if (code && /^[A-Z0-9]{6}$/.test(code)) {
        rpc<boolean>('referral_valid', { p_code: code }).then((ok) => {
          if (ok) { localStorage.setItem('vx_ref', code); setReferred(true); }
        }).catch(() => {});
      } else if (localStorage.getItem('vx_ref')) {
        setReferred(true);
      }
    } catch { /* */ }
  }, []);

  const chooseKind = (k: BusinessKind) => {
    setKind(k);
    const allowed = new Set(categoriesForKind(k).map((c) => c.id));
    setCats((prev) => prev.filter((id) => allowed.has(id)));
  };
  const toggleCat = (id: string) =>
    setCats((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const solo = teamSize === 's0';
  const teamMax = TEAM_SIZES.find((x) => x.id === teamSize)?.max ?? 0;
  const branchMax = BRANCH_SIZES.find((x) => x.id === branchSize)?.max ?? 1;
  const suggested = suggestedRoles(cats);
  const shownRoles = rolesTouched ? roles : suggested;      // marcados de entrada según el rubro; el cliente los cambia
  const toggleRole = (r: TeamRole) => { setRolesTouched(true); setRoles((rolesTouched ? roles : suggested).includes(r) ? (rolesTouched ? roles : suggested).filter((x) => x !== r) : [...(rolesTouched ? roles : suggested), r]); };
  const plan = recommendPlan(plans, teamMax, branchMax);

  // Qué falta en cada paso para poder avanzar
  const stepError = (): string => {
    if (step === 0 && !kind) return t('val.chooseKind');
    if (step === 1 && cats.length === 0) return t('val.chooseCat');
    if (step === 2 && !teamSize) return t('need.val.team');
    if (step === 3 && (!invoice || wantAi === null)) return t('need.val.extras');
    if (step === 5) {
      if (!compName.trim()) return t('val.companyName');
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
      planCode: plan && ['basic', 'starter', 'pro'].includes(plan.code) ? plan.code : 'pro', // el piloto corre en planes chicos
      plan: 0,
      modules: suggestedModules(cats),
      ownerName: ownerName.trim(),
      ownerEmail: email.trim(),
      ownerPassword: pass1,
    });
    if (ok) {
      // Lo que nos contó queda guardado: con eso se arma y se recomienda a su medida
      try {
        await rpc('save_onboarding', { p_data: {
          team: teamSize, team_max: teamMax, branches: branchSize, branches_max: branchMax, roles: solo ? [] : shownRoles,
          invoice, ai: wantAi, plan: plan?.code ?? null, categories: cats,
        } });
      } catch { /* el diagnóstico es un extra: no frena el registro */ }
    }
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
          {referred && (
            <p className="mx-auto mt-3 max-w-md rounded-xl border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300">
              🎁 {t('ref.invitedBanner')}
            </p>
          )}
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
              <h2 className="text-lg font-bold">{t('need.teamQ')}</h2>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {TEAM_SIZES.map((z) => (
                  <button key={z.id} type="button" aria-pressed={teamSize === z.id} onClick={() => { setTeamSize(z.id); setError(''); }}
                    className={`rounded-xl border px-3 py-3 text-sm font-semibold cursor-pointer ${teamSize === z.id ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 dark:border-slate-700'}`}>
                    {t(`need.size.${z.id}` as DictKey)}
                  </button>
                ))}
              </div>

              <h2 className="mt-6 text-lg font-bold">{t('need.branchesQ')}</h2>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {BRANCH_SIZES.map((z) => (
                  <button key={z.id} type="button" aria-pressed={branchSize === z.id} onClick={() => setBranchSize(z.id)}
                    className={`rounded-xl border px-3 py-3 text-sm font-semibold cursor-pointer ${branchSize === z.id ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 dark:border-slate-700'}`}>
                    {t(`need.br.${z.id}` as DictKey)}
                  </button>
                ))}
              </div>

              {teamSize && (solo ? (
                <p className="mt-6 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">🙋 {t('need.soloNote')}</p>
              ) : (
                <>
                  <h2 className="mt-6 text-lg font-bold">{t('need.rolesQ')}</h2>
                  <p className={`text-sm ${ui.muted}`}>{t('need.rolesHint')}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {TEAM_ROLES.map((r) => {
                      const on = shownRoles.includes(r);
                      return (
                        <button key={r} type="button" aria-pressed={on} onClick={() => toggleRole(r)}
                          className={`rounded-full border px-3 py-1.5 text-sm font-semibold cursor-pointer ${on ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 dark:border-slate-700'}`}>
                          {t(`role.${r}` as DictKey)}
                        </button>
                      );
                    })}
                  </div>
                </>
              ))}
            </>
          )}

          {step === 3 && (
            <>
              <h2 className="text-lg font-bold">{t('need.invoiceQ')}</h2>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {(['no', 'yes', 'later'] as const).map((v) => (
                  <button key={v} type="button" aria-pressed={invoice === v} onClick={() => { setInvoice(v); setError(''); }}
                    className={`rounded-xl border px-3 py-3 text-sm font-semibold cursor-pointer ${invoice === v ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 dark:border-slate-700'}`}>
                    {t(`need.inv.${v}` as DictKey)}
                  </button>
                ))}
              </div>

              <h2 className="mt-6 text-lg font-bold">{t('need.aiQ')}</h2>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {([true, false] as const).map((v) => (
                  <button key={String(v)} type="button" aria-pressed={wantAi === v} onClick={() => { setWantAi(v); setError(''); }}
                    className={`rounded-xl border px-3 py-3 text-sm font-semibold cursor-pointer ${wantAi === v ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 dark:border-slate-700'}`}>
                    {v ? t('need.ai.yes') : t('need.ai.no')}
                  </button>
                ))}
              </div>

              <p className={`mt-6 rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-800 ${ui.muted}`}>💬 {solo ? t('need.chatSolo') : t('need.chatTeam')}</p>
            </>
          )}

          {step === 4 && (
            <>
              <h2 className="text-lg font-bold">{t('need.solTitle')}</h2>
              <ul className="mt-3 space-y-3 text-sm">
                <li><span className="font-semibold">🧩 {t('need.solModules')}: </span>{modules.map((m) => t(modKey(m))).join(', ')}</li>
                <li><span className="font-semibold">👥 {t('need.solRoles')}: </span>{solo || shownRoles.length === 0 ? t('need.solSolo') : shownRoles.map((r) => t(`role.${r}` as DictKey)).join(', ')}</li>
                <li><span className="font-semibold">✨ {t('need.solExtras')}: </span>
                  {[invoice === 'yes' ? t('need.solInvoice') : null, wantAi ? t('need.solAi') : null, !solo ? t('need.solChat') : null].filter(Boolean).join(', ') || t('need.solNone')}
                </li>
              </ul>
              {plan && (
                <div className="mt-5 rounded-2xl border border-blue-300 bg-blue-50 p-4 dark:border-blue-500/30 dark:bg-blue-500/10">
                  <p className="text-xs font-bold uppercase text-blue-700 dark:text-blue-300">{t('need.solPlan')}</p>
                  <p className="mt-1 text-xl font-extrabold">{plan.name} · {t('need.planPrice', { price: Number(plan.price_usd) })}</p>
                  <p className={`mt-1 text-sm ${ui.muted}`}>{t('need.planWhy', { users: plan.max_users, branches: plan.max_branches, storage: `${Math.round(plan.max_storage_mb / 1024)} GB` })}</p>
                  {(() => {
                    const eu = Math.max(0, teamMax + 1 - plan.max_users);
                    const eb = Math.max(0, branchMax - plan.max_branches);
                    if (!eu && !eb) return null;
                    return <p className="mt-1 text-sm font-semibold">➕ {[
                      eu ? t('need.plusUsers', { n: eu, price: Number(plan.extra_user?.price_usd ?? 0) }) : null,
                      eb ? t('need.plusBranches', { n: eb, price: Number(plan.extra_branch?.price_usd ?? 0) }) : null,
                    ].filter(Boolean).join(' · ')}</p>;
                  })()}
                  <p className={`mt-2 text-xs ${ui.muted}`}>{t('need.free')}</p>
                </div>
              )}
            </>
          )}

          {step === 5 && (
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

          {step === 5 && (
            <>
              <h2 className="mt-8 text-lg font-bold">{t('reg.ownerTitle')}</h2>
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

          {step === STEPS.length - 1 && (
            <p className={`mt-5 text-xs ${ui.muted}`}>
              {t('legal.acceptPre')}{' '}
              <Link href="/terminos" target="_blank" className="font-semibold underline">{t('legal.terms')}</Link>{' '}
              {t('legal.and')}{' '}
              <Link href="/privacidad" target="_blank" className="font-semibold underline">{t('legal.privacy')}</Link>.
            </p>
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
