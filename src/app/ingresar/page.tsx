'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useVeltrixAuth, homeForRole } from '../auth-system';
import { supabase } from '../../lib/supabase';
import { SiteHeader, SiteFooter, ui, PasswordInput } from '../site-header';
import { useT } from '../i18n';
import { isInstalledApp } from '../../lib/standalone';

export default function IngresarPage() {
  const router = useRouter();
  const { loaded, session, login, logout } = useVeltrixAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'login' | 'forgot'>('login');
  const { t } = useT();
  const [installed, setInstalled] = useState<boolean | null>(null); // null: aún no se sabe (evita el parpadeo del encabezado)
  useEffect(() => { setInstalled(isInstalledApp()); }, []);

  // Si ya tiene sesión, directo a su panel
  useEffect(() => {
    if (loaded && session && session.role !== 'none') router.replace(homeForRole(session.role));
  }, [loaded, session, router]);
  const noAccess = loaded && session?.role === 'none';

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    const res = await login(email, password);
    setBusy(false);
    if (res.ok && res.session) {
      if (res.session.role !== 'none') router.push(homeForRole(res.session.role));
    } else setError(t('login.error'));
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setBusy(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/restablecer`,
    });
    setBusy(false);
    if (err) setError(t('forgot.error'));
    else setInfo(t('forgot.sent'));
  };

  return (
    <main className="flex min-h-dvh flex-col">
      {installed === null ? <div className="h-[calc(7rem+env(safe-area-inset-top))]" /> : installed ? (
        <div className="flex flex-col items-center px-4 pt-[calc(3.5rem+env(safe-area-inset-top))] text-center text-3xl font-extrabold tracking-tight">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/veltrix-v.png" alt="" width={112} height={112} className="h-28 w-28 object-contain" />
          <span className="mt-2">Veltrix <span className="text-blue-600 dark:text-blue-500">System</span></span>
        </div>
      ) : <SiteHeader showAuthButtons={false} />}

      <div className="flex flex-1 items-center justify-center px-4 py-8 sm:py-12">
        <div className={`w-full max-w-sm rounded-2xl p-5 sm:p-7 ${ui.card}`}>
          <h1 className="text-2xl font-extrabold">{mode === 'login' ? t('login.title') : t('forgot.title')}</h1>
          <p className={`mt-1 text-sm ${ui.muted}`}>
            {mode === 'login'
              ? t('login.subtitle')
              : t('forgot.subtitle')}
          </p>

          {noAccess && (
            <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-semibold text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
              ⚠️ {t('login.noAccess')}{' '}
              <button type="button" onClick={logout} className="underline cursor-pointer">{t('shell.logout')}</button>
            </div>
          )}
          {error && (
            <div className="mt-4 rounded-xl border border-red-300 bg-red-50 p-3 text-xs font-semibold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
              ⚠️ {error}
            </div>
          )}
          {info && (
            <div className="mt-4 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-xs font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
              ✉️ {info}
            </div>
          )}

          <form onSubmit={mode === 'login' ? handleLogin : handleForgot} className="mt-5 space-y-4">
            <div>
              <label className={ui.label}>{t('common.email')}</label>
              <input
                type="email"
                required
                autoComplete="email"
                placeholder="tu@correo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={ui.input}
              />
            </div>

            {mode === 'login' && (
              <div>
                <div className="flex items-center justify-between">
                  <label className={ui.label}>{t('common.password')}</label>
                  <button
                    type="button"
                    onClick={() => { setMode('forgot'); setError(''); setInfo(''); }}
                    className="mb-1 text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400 cursor-pointer"
                  >
                    {t('login.forgot')}
                  </button>
                </div>
                <PasswordInput
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={setPassword}
                />
              </div>
            )}

            <button type="submit" disabled={busy} className={`${ui.btnPrimary} w-full`}>
              {busy ? t('common.wait') : mode === 'login' ? t('login.submit') : t('forgot.submit')}
            </button>
          </form>

          <div className={`mt-6 text-center text-xs ${ui.muted}`}>
            {mode === 'login' ? (
              <>
                {installed ? (
                  <Link href="/registro" className="opacity-80 hover:underline">{t('login.newCompany')}</Link>
                ) : (
                  <>
                    {t('login.noAccount')}{' '}
                    <Link href="/registro" className="font-semibold text-blue-600 hover:underline dark:text-blue-400">
                      {t('login.tryFree')}
                    </Link>
                  </>
                )}
              </>
            ) : (
              <button
                type="button"
                onClick={() => { setMode('login'); setError(''); setInfo(''); }}
                className="font-semibold text-blue-600 hover:underline dark:text-blue-400 cursor-pointer"
              >
                {t('forgot.backToLogin')}
              </button>
            )}
          </div>
        </div>
      </div>

      {!installed && <SiteFooter />}
    </main>
  );
}
