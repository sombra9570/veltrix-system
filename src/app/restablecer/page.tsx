'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import { SiteHeader, SiteFooter, ui, PasswordInput } from '../site-header';
import { useT } from '../i18n';

// Aquí llega el enlace del correo "¿Olvidaste tu contraseña?"
export default function RestablecerPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [pass1, setPass1] = useState('');
  const [pass2, setPass2] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const { t } = useT();

  useEffect(() => {
    // Supabase lee el enlace del correo y abre una sesión temporal de recuperación
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => { if (data.session) setReady(true); });
    return () => sub.subscription.unsubscribe();
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (pass1.length < 8) return setError(t('val.passMin'));
    if (pass1 !== pass2) return setError(t('val.passMatch'));
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password: pass1 });
    setBusy(false);
    if (err) {
      // Si escribió la misma contraseña que ya tenía, puede ingresar con ella
      if ((err as { code?: string }).code === 'same_password' || /different from the old/i.test(err.message)) {
        return setError(t('reset.samePassword'));
      }
      if ((err as { code?: string }).code === 'weak_password') return setError(t('val.passMin'));
      return setError(t('reset.failed'));
    }
    await supabase.auth.signOut();
    setDone(true);
    setTimeout(() => router.push('/ingresar'), 2500);
  };

  return (
    <main className="flex min-h-dvh flex-col">
      <SiteHeader showAuthButtons={false} />
      <div className="flex flex-1 items-center justify-center px-4 py-8 sm:py-12">
        <div className={`w-full max-w-sm rounded-2xl p-5 sm:p-7 ${ui.card}`}>
          <h1 className="text-2xl font-extrabold">{t('reset.title')}</h1>

          {done ? (
            <p className="mt-4 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
              ✅ {t('reset.done')}
            </p>
          ) : !ready ? (
            <p className={`mt-3 text-sm ${ui.muted}`}>
              {t('reset.openFromEmail')}{' '}
              <Link href="/ingresar" className="font-semibold text-blue-600 hover:underline dark:text-blue-400">
                {t('reset.requestNew')}
              </Link>
              .
            </p>
          ) : (
            <form onSubmit={save} className="mt-5 space-y-4">
              {error && (
                <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-xs font-semibold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
                  ⚠️ {error}
                </div>
              )}
              <div>
                <label className={ui.label}>{t('reset.newPassword')}</label>
                <PasswordInput autoComplete="new-password" value={pass1} onChange={setPass1} required />
              </div>
              <div>
                <label className={ui.label}>{t('reset.repeat')}</label>
                <PasswordInput autoComplete="new-password" value={pass2} onChange={setPass2} required />
              </div>
              <button type="submit" disabled={busy} className={`${ui.btnPrimary} w-full`}>
                {busy ? t('reset.saving') : t('reset.save')}
              </button>
            </form>
          )}
        </div>
      </div>
      <SiteFooter />
    </main>
  );
}
