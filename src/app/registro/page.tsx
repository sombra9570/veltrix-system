'use client';
import { useEffect, useMemo, useState } from 'react';
import { rpc } from '../../lib/supabase';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useVeltrixAuth, homeForRole } from '../auth-system';
import { useLanguage, COUNTRIES, CountryCode } from '../language-selector';
import { useT, countryName } from '../i18n';
import { usePlanMoney } from '../plan-money';
import {
  TEAM_SIZES, BRANCH_SIZES, TEAM_ROLES, recommendPlan, type TeamRole, type PublicPlan, catKey, modKey,
} from '../business-catalog';
import { SiteHeader, SiteFooter, ui, useCountryChange, PasswordInput } from '../site-header';
import type { DictKey } from '../i18n/es';
import { useQ, type QKey } from './quiz-text';
import {
  GROUPS, ACTIVITIES, categoriesFor, primaryGroup, groupsOf, canJoin, modulesFor, rolesFor, hasRestaurant, hasSales, kindFor, UNSURE_LIMIT,
  type Sells, type Tri, type Group, type Specifics,
  STREET, isStreet,
} from './quiz-logic';

const TERMS_VERSION = '2026-11';
const STEP_KEYS: QKey[] = ['step.sells', 'step.rubro', 'step.team', 'step.details', 'step.summary', 'step.account'];
const LAST = STEP_KEYS.length - 1;

/** Botón de opción: grande, claro, con marca de elegido. */
function Choice({ on, onClick, children, soft = false }: { on: boolean; onClick: () => void; children: React.ReactNode; soft?: boolean }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick}
      className={`rounded-xl border px-3 py-3 text-left text-sm font-semibold cursor-pointer transition ${
        on ? 'border-blue-600 bg-blue-600 text-white' : soft ? 'border-dashed border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300' : 'border-slate-300 hover:border-slate-400 dark:border-slate-700'}`}>
      {on ? '✓ ' : ''}{children}
    </button>
  );
}

function TriRow({ q, value, onChange, unsureLabel }: { q: string; value: Tri | null; onChange: (v: Tri) => void; unsureLabel: string }) {
  const qq = useQ();
  return (
    <div className="mt-5 first:mt-0">
      <h3 className="text-base font-bold">{q}</h3>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <Choice on={value === 'yes'} onClick={() => onChange('yes')}>{qq('yes')}</Choice>
        <Choice on={value === 'no'} onClick={() => onChange('no')}>{qq('no')}</Choice>
        <Choice on={value === 'unsure'} soft onClick={() => onChange('unsure')}>{unsureLabel}</Choice>
      </div>
    </div>
  );
}

/** Formulario para quien no sabe qué necesita (o prefiere ayuda): lo atiende servicio al cliente. */
function HelpForm({ auto, answers, onBack }: { auto: boolean; answers: Record<string, unknown>; onBack: () => void }) {
  const qq = useQ();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [place, setPlace] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);

  const send = async () => {
    setErr('');
    if (name.trim().length < 3) return setErr(qq('help.e.name'));
    if (!/^[0-9+() .-]{6,25}$/.test(phone.trim())) return setErr(qq('help.e.phone'));
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setErr(qq('help.e.email'));
    if (place.trim().length < 2) return setErr(qq('help.e.place'));
    setBusy(true);
    try {
      await rpc('public_submit_lead', { p_name: name.trim(), p_phone: phone.trim(), p_email: email.trim(), p_place: place.trim(), p_note: note.trim() || null, p_answers: answers });
      setDone(true);
    } catch (e) {
      const m = String((e as Error)?.message ?? e);
      setErr(m.includes('LEAD_LIMIT') ? qq('help.e.limit') : m.includes('LEAD_NAME') ? qq('help.e.name') : m.includes('LEAD_PHONE') ? qq('help.e.phone')
        : m.includes('LEAD_EMAIL') ? qq('help.e.email') : m.includes('LEAD_PLACE') ? qq('help.e.place') : qq('help.e.generic'));
    } finally { setBusy(false); }
  };

  if (done) {
    return (
      <div className="py-6 text-center">
        <p className="text-4xl">✅</p>
        <h2 className="mt-3 text-xl font-extrabold">{qq('help.ok.title')}</h2>
        <p className={`mx-auto mt-2 max-w-md text-sm ${ui.muted}`}>{qq('help.ok.body')}</p>
        <Link href="/" className={`${ui.btnPrimary} mt-5`}>{qq('help.ok.home')}</Link>
      </div>
    );
  }
  return (
    <>
      <h2 className="text-xl font-extrabold">🤝 {qq('help.title')}</h2>
      <p className={`mt-2 text-sm ${ui.muted}`}>{auto ? qq('help.body') : qq('help.bodyManual')}</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><label className={ui.label}>{qq('help.name')}</label>
          <input className={ui.input} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={120} /></div>
        <div><label className={ui.label}>{qq('help.phone')}</label>
          <input className={ui.input} type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" maxLength={25} placeholder="+591 7xxxxxxx" /></div>
        <div><label className={ui.label}>{qq('help.email')}</label>
          <input className={ui.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" maxLength={160} /></div>
        <div className="sm:col-span-2"><label className={ui.label}>{qq('help.place')}</label>
          <input className={ui.input} value={place} onChange={(e) => setPlace(e.target.value)} autoComplete="address-level2" maxLength={160} /></div>
        <div className="sm:col-span-2"><label className={ui.label}>{qq('help.note')}</label>
          <textarea className={ui.input} rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} /></div>
      </div>
      {err && <div className="mt-4 rounded-xl border border-red-300 bg-red-50 p-3 text-xs font-semibold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">⚠️ {err}</div>}
      <div className="mt-6 flex items-center justify-between gap-3">
        <button type="button" onClick={onBack} className={ui.btnGhost}>{qq('help.back')}</button>
        <button type="button" onClick={send} disabled={busy} className={ui.btnPrimary}>{busy ? qq('help.sending') : qq('help.send')}</button>
      </div>
    </>
  );
}

export default function RegistroPage() {
  const router = useRouter();
  const { loaded, session, registerCompany } = useVeltrixAuth();
  const [accepted, setAccepted] = useState(false);
  const { country, lang } = useLanguage();
  const { fmt: planMoney, isBo } = usePlanMoney();
  const { t } = useT();
  const qq = useQ();
  const changeCountry = useCountryChange();

  const [step, setStep] = useState(0);
  const [helpMode, setHelpMode] = useState<null | 'auto' | 'manual'>(null);

  // 1) Qué vende, cuántos negocios y sucursales
  const [sells, setSells] = useState<Sells | null>(null);
  const [bizCount, setBizCount] = useState<'1' | '2' | '3' | 'unsure' | null>(null);
  const [branchSize, setBranchSize] = useState<string | null>(null); // b1..b4 | unsure
  // 2) Rubro de cada negocio
  const [bizCats, setBizCats] = useState<string[][]>([[]]);
  const [rubroUnsure, setRubroUnsure] = useState<boolean[]>([false]);
  const [guide, setGuide] = useState<(Group | 'ask' | null)[]>([null]);
  // 3) Equipo
  const [teamSize, setTeamSize] = useState<string | null>(null);   // s0..s6 | unsure
  const [roles, setRoles] = useState<TeamRole[]>([]);
  const [rolesTouched, setRolesTouched] = useState(false);
  // 4) Detalles
  const [tables, setTables] = useState<Tri | null>(null);
  const [delivery, setDelivery] = useState<Tri | null>(null);
  const [credit, setCredit] = useState<Tri | null>(null);
  const [invoice, setInvoice] = useState<string | null>(null);
  const [wantAi, setWantAi] = useState<boolean | null>(null);

  const [plans, setPlans] = useState<PublicPlan[]>([]);
  const [streetPlan, setStreetPlan] = useState<{ base_bs: number; collector_bs: number; collectors_per_supervisor: number; manager_after_collectors: number; manager_free: boolean } | null>(null);
  useEffect(() => { rpc<typeof streetPlan>('public_street_plan').then((p) => setStreetPlan(p ?? null)).catch(() => {}); }, []);
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

  const streetOnly = bizCats.some((c) => c.some(isStreet)); // cobranza en calle: un solo negocio, sin sucursales ni otros planes
  const nBiz = bizCount === '2' ? 2 : bizCount === '3' ? 3 : 1;
  const catsOf = (i: number) => bizCats[i] ?? [];
  const allCats = useMemo(() => [...new Set(Array.from({ length: nBiz }, (_, i) => bizCats[i] ?? []).flat())], [bizCats, nBiz]);
  const sp: Specifics = { tables, delivery, credit };
  const solo = teamSize === 's0';
  const teamMax = teamSize === 'unsure' ? 1 : TEAM_SIZES.find((x) => x.id === teamSize)?.max ?? 0;
  const branchMax = BRANCH_SIZES.find((x) => x.id === branchSize)?.max ?? 1;
  const modules = modulesFor(allCats, sp);
  const suggested = rolesFor(allCats, sp);
  const shownRoles = rolesTouched ? roles : suggested;
  const toggleRole = (r: TeamRole) => { setRolesTouched(true); const cur = shownRoles; setRoles(cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]); };
  const plan = recommendPlan(plans, teamMax, branchMax);

  const showTables = hasRestaurant(allCats);
  const showDelivery = showTables || hasSales(allCats);
  const showCredit = hasSales(allCats);

  // Cuántas veces dijo "no estoy seguro" (solo cuenta preguntas que de verdad se le hicieron)
  const unsureList = useMemo(() => {
    const u: string[] = [];
    if (sells === 'unsure') u.push('sells');
    if (bizCount === 'unsure') u.push('businesses');
    if (branchSize === 'unsure') u.push('branches');
    for (let i = 0; i < nBiz; i++) if (rubroUnsure[i]) u.push(`rubro_${i + 1}`);
    if (teamSize === 'unsure') u.push('team');
    if (showTables && tables === 'unsure') u.push('tables');
    if (showDelivery && delivery === 'unsure') u.push('delivery');
    if (showCredit && credit === 'unsure') u.push('credit');
    return u;
  }, [sells, bizCount, branchSize, rubroUnsure, nBiz, teamSize, tables, delivery, credit, showTables, showDelivery, showCredit]);

  const quizAnswers = (): Record<string, unknown> => ({
    sells, businesses: bizCount, branches: branchSize, rubros: Array.from({ length: nBiz }, (_, i) => bizCats[i] ?? []), team: teamSize,
    tables, delivery, credit, invoice, ai: wantAi, unsure: unsureList, step, lang,
  });

  // --- Rubros: elegir sin mezclar grupos; el sistema bloquea lo que no combina
  const setBiz = (i: number, fn: (c: string[]) => string[]) => setBizCats((p) => { const n = [...p]; while (n.length <= i) n.push([]); n[i] = fn(n[i]); return n; });
  const toggleCat = (i: number, id: string) => {
    setError('');
    if (id === STREET && !(bizCats[i] ?? []).some(isStreet)) { setBizCount('1'); setBranchSize('b1'); setBizCats([[STREET]]); }
    else setBiz(i, (c) => (c.includes(id) ? c.filter((x) => x !== id) : canJoin(c, id) ? [...c, id] : c));
    setRubroUnsure((p) => { const n = [...p]; n[i] = false; return n; });
  };
  const setUnsureRubro = (i: number) => {
    setBiz(i, () => []);
    setRubroUnsure((p) => { const n = [...p]; while (n.length <= i) n.push(false); n[i] = !n[i]; return n; });
    setGuide((p) => { const n = [...p]; while (n.length <= i) n.push(null); n[i] = null; return n; });
  };
  const setGuideFor = (i: number, g: Group | 'ask' | null) => setGuide((p) => { const n = [...p]; while (n.length <= i) n.push(null); n[i] = g; return n; });

  const stepError = (): string => {
    if (step === 0) {
      if (!sells) return qq('val.sells');
      if (!streetOnly && !bizCount) return qq('val.biz');
      if (!streetOnly && !branchSize) return qq('val.br');
    }
    if (step === 1) {
      for (let i = 0; i < nBiz; i++) if (catsOf(i).length === 0 && !rubroUnsure[i]) return qq('rubro.missing');
    }
    if (step === 2 && !teamSize) return qq('val.team');
    if (step === 3) {
      if ((showTables && !tables) || (showDelivery && !delivery) || (showCredit && !credit) || !invoice || wantAi === null) return qq('det.missing');
    }
    if (step === LAST) {
      if (!compName.trim()) return t('val.companyName');
      if (!taxId.trim()) return t('val.taxId', { taxId: country.taxIdName });
      if (!ownerName.trim()) return t('val.ownerName');
      if (!/^\S+@\S+\.\S+$/.test(email.trim())) return t('val.email');
      if (pass1.length < 8) return t('val.passMin');
      if (pass1 !== pass2) return t('val.passMatch');
      if (!accepted) return t('legal.acceptRequired');
    }
    return '';
  };

  const next = async () => {
    const msg = stepError();
    setError(msg);
    if (msg) return;
    if (step < LAST) {
      // Muchas dudas, o ningún rubro claro: lo atendemos en persona en vez de armarle algo que no necesita
      if (step <= 3 && (unsureList.length >= UNSURE_LIMIT || (step >= 1 && allCats.length === 0))) { setHelpMode('auto'); return; }
      return setStep(step + 1);
    }

    setBusy(true);
    const ok = await registerCompany({
      name: compName.trim(),
      taxId: taxId.trim(),
      type: kindFor(sells, allCats),
      categories: allCats,
      planCode: plan && ['basic', 'starter', 'pro'].includes(plan.code) ? plan.code : 'pro', // el piloto corre en planes chicos
      plan: 0,
      modules,
      ownerName: ownerName.trim(),
      ownerEmail: email.trim(),
      ownerPassword: pass1,
    });
    if (ok) {
      // Lo que nos contó queda guardado: con eso se arma y se recomienda a su medida
      try {
        await rpc('save_onboarding', { p_data: {
          sells, businesses: bizCount, businesses_n: nBiz, rubros: Array.from({ length: nBiz }, (_, i) => bizCats[i] ?? []),
          team: teamSize, team_max: teamMax, branches: branchSize, branches_max: branchMax, roles: solo ? [] : shownRoles,
          tables, delivery, credit, invoice, ai: wantAi, plan: plan?.code ?? null, categories: allCats, unsure: unsureList,
        } });
      } catch { /* el diagnóstico es un extra: no frena el registro */ }
      try { await rpc('accept_terms', { p_version: TERMS_VERSION }); } catch { /* queda sin fecha; se pide de nuevo al entrar */ }
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

  const sellsOpts: { id: Sells; icon: string }[] = [{ id: 'products', icon: '📦' }, { id: 'services', icon: '🛠️' }, { id: 'both', icon: '🔀' }];
  const visibleCats = categoriesFor(sells);

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

        {!helpMode && (
          <>
            <ol className="mt-8 grid grid-cols-6 gap-1.5">
              {STEP_KEYS.map((s, i) => (
                <li key={s}>
                  <div className={`h-1.5 rounded-full ${i <= step ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-800'}`} />
                  <p className={`mt-1.5 hidden text-[11px] font-semibold sm:block ${i === step ? 'text-blue-600 dark:text-blue-400' : ui.muted}`}>{i + 1}. {qq(s)}</p>
                </li>
              ))}
            </ol>
            <p className="mt-2 text-xs font-semibold text-blue-600 sm:hidden dark:text-blue-400">{step + 1}/{STEP_KEYS.length} · {qq(STEP_KEYS[step])}</p>
          </>
        )}

        <section className={`mt-6 rounded-2xl p-4 sm:p-6 ${ui.card}`}>
          {helpMode && <HelpForm auto={helpMode === 'auto'} answers={quizAnswers()} onBack={() => setHelpMode(null)} />}

          {!helpMode && step === 0 && (
            <>
              <h2 className="text-lg font-bold">{qq('sells.q')}</h2>
              <p className={`text-sm ${ui.muted}`}>{qq('sells.hint')}</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {sellsOpts.map((o) => (
                  <button key={o.id} type="button" aria-pressed={sells === o.id} onClick={() => { setSells(o.id); setError(''); }}
                    className={`rounded-2xl border p-4 text-left transition cursor-pointer ${sells === o.id ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500/30 dark:bg-blue-950/40' : 'border-slate-200 hover:border-slate-400 dark:border-slate-700 dark:hover:border-slate-500'}`}>
                    <p className="text-2xl">{o.icon}</p>
                    <p className="mt-2 font-bold">{qq(`sells.${o.id}` as QKey)}</p>
                    <p className={`mt-1 text-xs ${ui.muted}`}>{qq(`sells.${o.id}.d` as QKey)}</p>
                  </button>
                ))}
              </div>
              <div className="mt-3"><Choice on={sells === 'unsure'} soft onClick={() => { setSells('unsure'); setError(''); }}>{qq('unsure')}</Choice></div>

              {!streetOnly && (<>
              <h2 className="mt-8 text-lg font-bold">{qq('biz.q')}</h2>
              <p className={`text-sm ${ui.muted}`}>{qq('biz.hint')}</p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {(['1', '2', '3'] as const).map((v) => <Choice key={v} on={bizCount === v} onClick={() => { setBizCount(v); setError(''); }}>{qq(`biz.${v}` as QKey)}</Choice>)}
              </div>
              <div className="mt-2"><Choice on={bizCount === 'unsure'} soft onClick={() => { setBizCount('unsure'); setError(''); }}>{qq('unsure')}</Choice></div>

              <h2 className="mt-8 text-lg font-bold">{qq('br.q')}</h2>
              <p className={`text-sm ${ui.muted}`}>{qq('br.hint')}</p>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {BRANCH_SIZES.map((z) => <Choice key={z.id} on={branchSize === z.id} onClick={() => { setBranchSize(z.id); setError(''); }}>{t(`need.br.${z.id}` as DictKey)}</Choice>)}
              </div>
              <div className="mt-2"><Choice on={branchSize === 'unsure'} soft onClick={() => { setBranchSize('unsure'); setError(''); }}>{qq('unsure')}</Choice></div>
              </>)}
            </>
          )}

          {!helpMode && step === 1 && (
            <>
              {Array.from({ length: nBiz }, (_, i) => {
                const sel = catsOf(i);
                const taken = new Set(Array.from({ length: nBiz }, (_, j) => (j === i ? [] : catsOf(j))).flat());
                const g = guide[i] ?? null;
                const pool = visibleCats.filter((c) => !taken.has(c.id) && (g && g !== 'ask' ? groupsOf(c.id).includes(g) : true));
                const groupIds = g && g !== 'ask' ? [g] : GROUPS.filter((gg) => pool.some((c) => primaryGroup(c.id) === gg));
                return (
                  <div key={i} className={i > 0 ? 'mt-8 border-t border-slate-200 pt-6 dark:border-slate-800' : ''}>
                    <h2 className="text-lg font-bold">{nBiz === 1 ? qq('rubro.q1') : qq('rubro.qn', { n: i + 1 })}</h2>
                    <p className={`text-sm ${ui.muted}`}>{nBiz === 1 ? qq('rubro.hint1') : qq('rubro.hintn')}</p>

                    {g === 'ask' ? (
                      <div className="mt-4">
                        <p className="font-semibold">{qq('rubro.guideQ')}</p>
                        <p className={`text-sm ${ui.muted}`}>{qq('rubro.guideHint')}</p>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          {ACTIVITIES.map((a) => <Choice key={a.id} on={false} onClick={() => setGuideFor(i, a.group)}>{qq(`a.${a.id}` as QKey)}</Choice>)}
                        </div>
                        <button type="button" onClick={() => setGuideFor(i, null)} className="mt-3 text-sm font-semibold text-blue-600 underline cursor-pointer dark:text-blue-400">{qq('rubro.guideBack')}</button>
                      </div>
                    ) : (
                      <>
                        <div className="mt-4 space-y-4">
                          {groupIds.map((gg) => {
                            const items = pool.filter((c) => (g ? true : primaryGroup(c.id) === gg));
                            if (!items.length) return null;
                            return (
                              <div key={gg}>
                                <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{qq(`g.${gg}` as QKey)}</p>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {items.map((c) => {
                                    const on = sel.includes(c.id);
                                    const ok = canJoin(sel, c.id) || (c.id === STREET && !sel.some(isStreet));
                                    return (
                                      <button key={c.id} type="button" disabled={!ok} aria-pressed={on} title={ok ? undefined : qq('rubro.lock')} onClick={() => toggleCat(i, c.id)}
                                        className={`rounded-full border px-3.5 py-2 text-sm font-semibold transition ${on ? 'border-blue-500 bg-blue-600 text-white cursor-pointer' : ok ? 'border-slate-300 text-slate-700 hover:border-slate-400 cursor-pointer dark:border-slate-700 dark:text-slate-300' : 'border-slate-200 text-slate-400 opacity-45 cursor-not-allowed dark:border-slate-800 dark:text-slate-600'}`}>
                                        {on ? '✓ ' : ''}{c.icon} {t(catKey(c.id))}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        {pool.some((c) => c.id === STREET) && (
                          <p className={`mt-3 text-xs ${ui.muted}`}>ℹ️ {qq('rubro.streetOnly')}</p>
                        )}
                        {sel.length > 0 && !sel.some(isStreet) && sel.length < pool.length && pool.some((c) => !canJoin(sel, c.id)) && (
                          <p className={`mt-3 text-xs ${ui.muted}`}>🔒 {qq('rubro.lock')}</p>
                        )}
                        {sel.length > 0 && (
                          <div className="mt-4 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-xs dark:border-emerald-500/30 dark:bg-emerald-500/10">
                            <p className="font-bold text-emerald-700 dark:text-emerald-300">{qq('rubro.picked')}</p>
                            <p className="mt-1 text-emerald-800 dark:text-emerald-200">{modulesFor(sel, sp).map((m) => t(modKey(m))).join(' · ')}</p>
                          </div>
                        )}
                        {sel.length === 0 && (
                          <div className="mt-4 flex flex-wrap gap-2">
                            <Choice on={false} soft onClick={() => setGuideFor(i, 'ask')}>🧭 {qq('rubro.dontKnow')}</Choice>
                            <Choice on={!!rubroUnsure[i]} soft onClick={() => setUnsureRubro(i)}>{qq('unsure')}</Choice>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </>
          )}

          {!helpMode && step === 2 && (
            <>
              <h2 className="text-lg font-bold">{qq('team.q')}</h2>
              <p className={`text-sm ${ui.muted}`}>{qq('team.hint')}</p>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {TEAM_SIZES.map((z) => <Choice key={z.id} on={teamSize === z.id} onClick={() => { setTeamSize(z.id); setError(''); }}>{qq(`team.${z.id}` as QKey)}</Choice>)}
              </div>
              <div className="mt-2"><Choice on={teamSize === 'unsure'} soft onClick={() => { setTeamSize('unsure'); setError(''); }}>{qq('unsure')}</Choice></div>

              {teamSize === 's0' && <p className="mt-6 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">🙋 {qq('team.solo')}</p>}
              {(teamSize === 's1' || teamSize === 's2') && <p className="mt-6 rounded-xl border border-blue-300 bg-blue-50 p-3 text-sm text-blue-800 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200">💡 {qq('team.small')}</p>}
              {teamSize && teamSize !== 's0' && (
                <>
                  <h2 className="mt-6 text-lg font-bold">{qq('team.rolesQ')}</h2>
                  <p className={`text-sm ${ui.muted}`}>{qq('team.rolesHint')}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {TEAM_ROLES.map((r) => {
                      const on = shownRoles.includes(r);
                      return (
                        <button key={r} type="button" aria-pressed={on} onClick={() => toggleRole(r)}
                          className={`rounded-full border px-3 py-1.5 text-sm font-semibold cursor-pointer ${on ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 dark:border-slate-700'}`}>
                          {on ? '✓ ' : ''}{t(`role.${r}` as DictKey)}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </>
          )}

          {!helpMode && step === 3 && (
            <>
              <h2 className="text-lg font-bold">{qq('det.title')}</h2>
              <div className="mt-4">
                {showTables && <TriRow q={qq('det.tables')} value={tables} onChange={(v) => { setTables(v); setError(''); }} unsureLabel={qq('unsure')} />}
                {showDelivery && <TriRow q={qq('det.delivery')} value={delivery} onChange={(v) => { setDelivery(v); setError(''); }} unsureLabel={qq('unsure')} />}
                {showCredit && <TriRow q={qq('det.credit')} value={credit} onChange={(v) => { setCredit(v); setError(''); }} unsureLabel={qq('unsure')} />}

                <h3 className="mt-5 text-base font-bold first:mt-0">{qq('det.invoice')}</h3>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <Choice on={invoice === 'yes'} onClick={() => { setInvoice('yes'); setError(''); }}>{qq('yes')}</Choice>
                  <Choice on={invoice === 'no'} onClick={() => { setInvoice('no'); setError(''); }}>{qq('no')}</Choice>
                  <Choice on={invoice === 'later'} soft onClick={() => { setInvoice('later'); setError(''); }}>{qq('later')}</Choice>
                </div>

                <h3 className="mt-5 text-base font-bold">{qq('det.ai')}</h3>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Choice on={wantAi === true} onClick={() => { setWantAi(true); setError(''); }}>{qq('aiyes')}</Choice>
                  <Choice on={wantAi === false} onClick={() => { setWantAi(false); setError(''); }}>{qq('aino')}</Choice>
                </div>
              </div>
              <p className={`mt-6 rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-800 ${ui.muted}`}>💬 {solo ? t('need.chatSolo') : t('need.chatTeam')}</p>
            </>
          )}

          {!helpMode && step === 4 && (
            <>
              <h2 className="text-lg font-bold">{qq('sum.title')}</h2>
              <div className="mt-3 space-y-3 text-sm">
                {Array.from({ length: nBiz }, (_, i) => (
                  <div key={i} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                    {nBiz > 1 && <p className="text-xs font-bold uppercase text-slate-500">{qq('sum.business', { n: i + 1 })}</p>}
                    <p className="font-semibold">{catsOf(i).length ? catsOf(i).map((id) => t(catKey(id))).join(' · ') : qq('sum.d.rubro')}</p>
                  </div>
                ))}
                <p><span className="font-semibold">🧩 {qq('sum.modules')}: </span>{modules.map((m) => t(modKey(m))).join(', ')}</p>
                <p><span className="font-semibold">👥 {qq('sum.roles')}: </span>{solo || shownRoles.length === 0 ? qq('sum.solo') : shownRoles.map((r) => t(`role.${r}` as DictKey)).join(', ')}</p>
                <p><span className="font-semibold">✨ {qq('sum.extras')}: </span>
                  {[invoice === 'yes' ? t('need.solInvoice') : null, wantAi ? t('need.solAi') : null, !solo ? t('need.solChat') : null].filter(Boolean).join(', ') || qq('sum.none')}
                </p>
              </div>
              {unsureList.length > 0 && (
                <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-500/30 dark:bg-amber-500/10">
                  <p className="font-bold text-amber-800 dark:text-amber-200">🧭 {qq('sum.defaults')}</p>
                  <ul className="mt-1 list-disc pl-5 text-amber-900 dark:text-amber-100">
                    {unsureList.map((u) => <li key={u}>{qq((u.startsWith('rubro') ? 'sum.d.rubro' : u === 'businesses' ? 'sum.d.biz' : u === 'branches' ? 'sum.d.br' : `sum.d.${u}`) as QKey)}</li>)}
                  </ul>
                </div>
              )}
              {streetOnly && streetPlan && (
                <div className="mt-5 rounded-2xl border border-blue-300 bg-blue-50 p-4 dark:border-blue-500/30 dark:bg-blue-500/10">
                  <p className="text-xs font-bold uppercase text-blue-700 dark:text-blue-300">{t('street.plan.title')}</p>
                  <ul className="mt-2 space-y-1 text-sm font-semibold">
                    <li>💵 {t('street.plan.base', { price: Number(streetPlan.base_bs) })}</li>
                    <li>➕ {t('street.plan.coll', { price: Number(streetPlan.collector_bs) })}</li>
                    <li>🧭 {t('street.plan.sup', { n: streetPlan.collectors_per_supervisor })}</li>
                    {streetPlan.manager_free && <li>🏢 {t('street.plan.mgr', { n: streetPlan.manager_after_collectors + 1 })}</li>}
                    <li>📲 {t('street.plan.pay')}</li>
                  </ul>
                  <p className={`mt-2 text-xs ${ui.muted}`}>{t('need.free')}</p>
                </div>
              )}
              {plan && !streetOnly && (
                <div className="mt-5 rounded-2xl border border-blue-300 bg-blue-50 p-4 dark:border-blue-500/30 dark:bg-blue-500/10">
                  <p className="text-xs font-bold uppercase text-blue-700 dark:text-blue-300">{t('need.solPlan')}</p>
                  <p className="mt-1 text-xl font-extrabold">{plan.name} · {isBo ? t('need.planPriceLocal', { price: planMoney(Number(plan.price_usd)) }) : t('need.planPrice', { price: Number(plan.price_usd) })}</p>
                  <p className={`mt-1 text-sm ${ui.muted}`}>{t('need.planWhy', { users: plan.max_users, branches: plan.max_branches, storage: `${Math.round(plan.max_storage_mb / 1024)} GB` })}</p>
                  {(() => {
                    const eu = Math.max(0, teamMax + 1 - plan.max_users);
                    const eb = Math.max(0, branchMax - plan.max_branches);
                    if (!eu && !eb) return null;
                    return <p className="mt-1 text-sm font-semibold">➕ {[
                      eu ? (isBo ? t('need.plusUsersLocal', { n: eu, price: planMoney(Number(plan.extra_user?.price_usd ?? 0)) }) : t('need.plusUsers', { n: eu, price: Number(plan.extra_user?.price_usd ?? 0) })) : null,
                      eb ? (isBo ? t('need.plusBranchesLocal', { n: eb, price: planMoney(Number(plan.extra_branch?.price_usd ?? 0)) }) : t('need.plusBranches', { n: eb, price: Number(plan.extra_branch?.price_usd ?? 0) })) : null,
                    ].filter(Boolean).join(' · ')}</p>;
                  })()}
                  {isBo && <p className={`mt-1 text-xs ${ui.muted}`}>{t('home.taxIncluded')}</p>}
                  <p className={`mt-2 text-xs ${ui.muted}`}>{t('need.free')}</p>
                </div>
              )}
            </>
          )}

          {!helpMode && step === LAST && (
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
                  <label className={ui.label}>{t('reg.taxIdRequired', { taxId: country.taxIdName })} *</label>
                  <input className={ui.input} required value={taxId} onChange={(e) => setTaxId(e.target.value)}
                    placeholder={t('reg.taxIdPh', { taxId: country.taxIdName })} />
                </div>
              </div>
              <p className={`mt-3 text-xs ${ui.muted}`}>
                {t('reg.currencyInfo', { currency: country.currency, taxName: country.taxName, taxRate: country.taxRate })}
              </p>
            </>
          )}

          {!helpMode && step === LAST && (
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

          {!helpMode && error && (
            <div className="mt-5 rounded-xl border border-red-300 bg-red-50 p-3 text-xs font-semibold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
              ⚠️ {error}
            </div>
          )}

          {!helpMode && step === LAST && (
            <label className={`mt-5 flex cursor-pointer items-start gap-2 text-xs ${ui.muted}`}>
              <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {t('legal.acceptCheck')} (
                <Link href="/terminos" target="_blank" className="font-semibold underline">{t('legal.terms')}</Link>
                {' · '}
                <Link href="/privacidad" target="_blank" className="font-semibold underline">{t('legal.privacy')}</Link>)
              </span>
            </label>
          )}

          {!helpMode && (
            <>
              <div className="mt-6 flex items-center justify-between gap-3">
                {step > 0 ? (
                  <button type="button" onClick={back} className={ui.btnGhost}>{qq('btn.back')}</button>
                ) : (
                  <Link href="/ingresar" className={`text-xs font-semibold ${ui.muted} hover:underline`}>{t('reg.haveAccount')}</Link>
                )}
                <button type="button" onClick={next} disabled={busy} className={ui.btnPrimary}>
                  {busy ? t('reg.creating') : step === LAST ? t('reg.create') : qq('btn.next')}
                </button>
              </div>
              <p className="mt-5 text-center">
                <button type="button" onClick={() => setHelpMode('manual')} className="text-sm font-semibold text-blue-600 underline cursor-pointer dark:text-blue-400">🤝 {qq('help.link')}</button>
              </p>
            </>
          )}
        </section>
      </div>

      <SiteFooter />
    </main>
  );
}
