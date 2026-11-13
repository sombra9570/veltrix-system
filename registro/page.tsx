'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useVeltrixAuth, homeForRole } from '../auth-system';
import { useLanguage, COUNTRIES, CountryCode } from '../language-selector';
import {
  BUSINESS_KINDS, BusinessKind, categoriesForKind, suggestedModules, MODULE_LABELS,
} from '../business-catalog';
import { SiteHeader, SiteFooter, ui } from '../site-header';

const STEPS = ['Tipo de negocio', 'Rubros', 'Tu empresa', 'Tu cuenta'];

export default function RegistroPage() {
  const router = useRouter();
  const { loaded, session, registerCompany } = useVeltrixAuth();
  const { country, setCountryByCode } = useLanguage();

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
    if (step === 0 && !kind) return 'Elige una opción para continuar.';
    if (step === 1 && cats.length === 0) return 'Elige al menos un rubro.';
    if (step === 2 && !compName.trim()) return 'Escribe el nombre de tu empresa.';
    if (step === 3) {
      if (!ownerName.trim()) return 'Escribe tu nombre.';
      if (!/^\S+@\S+\.\S+$/.test(email.trim())) return 'Escribe un correo válido.';
      if (pass1.length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
      if (pass1 !== pass2) return 'Las dos contraseñas no coinciden.';
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
      <main className="flex min-h-screen flex-col">
        <SiteHeader showAuthButtons={false} />
        <div className="flex flex-1 items-center justify-center px-4">
          <div className={`max-w-md rounded-2xl p-7 text-center ${ui.card}`}>
            <p className="font-bold">Ya tienes una sesión abierta.</p>
            <p className={`mt-1 text-sm ${ui.muted}`}>Para registrar otra empresa, primero cierra sesión desde tu panel.</p>
            <Link href={homeForRole(session.role)} className={`${ui.btnPrimary} mt-4`}>Ir a mi panel</Link>
          </div>
        </div>
      </main>
    );
  }

  const modules = suggestedModules(cats);

  return (
    <main className="flex min-h-screen flex-col">
      <SiteHeader showAuthButtons={false} />

      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <div className="text-center">
          <span className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
            14 días gratis · con todo incluido · sin tarjeta
          </span>
          <h1 className="mt-4 text-3xl font-extrabold">Crea la cuenta de tu negocio</h1>
        </div>

        {/* Barra de progreso */}
        <ol className="mt-8 grid grid-cols-4 gap-2">
          {STEPS.map((s, i) => (
            <li key={s}>
              <div className={`h-1.5 rounded-full ${i <= step ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-800'}`} />
              <p className={`mt-1.5 text-[11px] font-semibold ${i === step ? 'text-blue-600 dark:text-blue-400' : ui.muted}`}>
                {i + 1}. {s}
              </p>
            </li>
          ))}
        </ol>

        <section className={`mt-6 rounded-2xl p-6 ${ui.card}`}>
          {step === 0 && (
            <>
              <h2 className="text-lg font-bold">¿Qué vende tu negocio?</h2>
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
                    <p className="mt-2 font-bold">{k.label}</p>
                    <p className={`mt-1 text-xs ${ui.muted}`}>{k.desc}</p>
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <h2 className="text-lg font-bold">¿A qué se dedica?</h2>
              <p className={`text-sm ${ui.muted}`}>Puedes elegir uno o varios.</p>
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
                      {on ? '✓ ' : ''}{c.icon} {c.label}
                    </button>
                  );
                })}
              </div>
              {cats.length > 0 && (
                <div className="mt-5 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-xs dark:border-emerald-500/30 dark:bg-emerald-500/10">
                  <p className="font-bold text-emerald-700 dark:text-emerald-300">Tu panel incluirá:</p>
                  <p className="mt-1 text-emerald-800 dark:text-emerald-200">
                    {modules.map((m) => MODULE_LABELS[m]).join(' · ')}
                  </p>
                </div>
              )}
            </>
          )}

          {step === 2 && (
            <>
              <h2 className="text-lg font-bold">Datos de tu empresa</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className={ui.label}>Nombre de la empresa</label>
                  <input className={ui.input} value={compName} onChange={(e) => setCompName(e.target.value)}
                    placeholder="Ej.: Distribuidora El Sol" />
                </div>
                <div>
                  <label className={ui.label}>País</label>
                  <select className={ui.input} value={country.code}
                    onChange={(e) => setCountryByCode(e.target.value as CountryCode)}>
                    {COUNTRIES.map((c) => (
                      <option key={c.code} value={c.code}>{c.flag} {c.name} ({c.currency})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={ui.label}>{country.taxIdName} (opcional)</label>
                  <input className={ui.input} value={taxId} onChange={(e) => setTaxId(e.target.value)}
                    placeholder={`Número de ${country.taxIdName}`} />
                </div>
              </div>
              <p className={`mt-3 text-xs ${ui.muted}`}>
                Moneda: {country.currency} · Impuesto: {country.taxName} {country.taxRate}%. Podrás cambiarlo después.
              </p>
            </>
          )}

          {step === 3 && (
            <>
              <h2 className="text-lg font-bold">Tu cuenta de dueño</h2>
              <p className={`text-sm ${ui.muted}`}>Con este correo y contraseña entrarás siempre. A tus trabajadores los creas tú desde tu panel.</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className={ui.label}>Tu nombre completo</label>
                  <input className={ui.input} value={ownerName} onChange={(e) => setOwnerName(e.target.value)} autoComplete="name" />
                </div>
                <div className="sm:col-span-2">
                  <label className={ui.label}>Correo</label>
                  <input className={ui.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
                </div>
                <div>
                  <label className={ui.label}>Contraseña (mínimo 8)</label>
                  <input className={ui.input} type="password" value={pass1} onChange={(e) => setPass1(e.target.value)} autoComplete="new-password" />
                </div>
                <div>
                  <label className={ui.label}>Repite la contraseña</label>
                  <input className={ui.input} type="password" value={pass2} onChange={(e) => setPass2(e.target.value)} autoComplete="new-password" />
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
              <button type="button" onClick={back} className={ui.btnGhost}>← Atrás</button>
            ) : (
              <Link href="/ingresar" className={`text-xs font-semibold ${ui.muted} hover:underline`}>
                Ya tengo cuenta
              </Link>
            )}
            <button type="button" onClick={next} disabled={busy} className={ui.btnPrimary}>
              {busy ? 'Creando tu empresa…' : step === STEPS.length - 1 ? 'Crear mi empresa' : 'Siguiente →'}
            </button>
          </div>
        </section>
      </div>

      <SiteFooter />
    </main>
  );
}
