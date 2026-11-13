'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useVeltrixAuth, homeForRole } from '../auth-system';
import { supabase } from '../../lib/supabase';
import { SiteHeader, SiteFooter, ui } from '../site-header';

export default function IngresarPage() {
  const router = useRouter();
  const { loaded, session, login } = useVeltrixAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'login' | 'forgot'>('login');

  // Si ya tiene sesión, directo a su panel
  useEffect(() => {
    if (loaded && session) router.replace(homeForRole(session.role));
  }, [loaded, session, router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    const res = await login(email, password);
    setBusy(false);
    if (res.ok && res.session) router.push(homeForRole(res.session.role));
    else setError(res.error || 'Correo o contraseña incorrectos.');
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
    if (err) setError('No se pudo enviar el correo. Intenta de nuevo en unos minutos.');
    else setInfo('Si ese correo está registrado, te llegará un enlace para crear una contraseña nueva. Revisa también la carpeta de spam.');
  };

  return (
    <main className="flex min-h-screen flex-col">
      <SiteHeader showAuthButtons={false} />

      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <div className={`w-full max-w-sm rounded-2xl p-7 ${ui.card}`}>
          <h1 className="text-2xl font-extrabold">{mode === 'login' ? 'Ingresar' : 'Recuperar contraseña'}</h1>
          <p className={`mt-1 text-sm ${ui.muted}`}>
            {mode === 'login'
              ? 'Dueños, supervisores y trabajadores entran aquí. Te llevamos directo a tu panel.'
              : 'Escribe tu correo y te enviamos un enlace para crear una contraseña nueva.'}
          </p>

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
              <label className={ui.label}>Correo</label>
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
                  <label className={ui.label}>Contraseña</label>
                  <button
                    type="button"
                    onClick={() => { setMode('forgot'); setError(''); setInfo(''); }}
                    className="mb-1 text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400 cursor-pointer"
                  >
                    ¿La olvidaste?
                  </button>
                </div>
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={ui.input}
                />
              </div>
            )}

            <button type="submit" disabled={busy} className={`${ui.btnPrimary} w-full`}>
              {busy ? 'Un momento…' : mode === 'login' ? 'Ingresar' : 'Enviar enlace'}
            </button>
          </form>

          <div className={`mt-6 text-center text-xs ${ui.muted}`}>
            {mode === 'login' ? (
              <>
                ¿Tu negocio aún no usa Veltrix?{' '}
                <Link href="/registro" className="font-semibold text-blue-600 hover:underline dark:text-blue-400">
                  Prueba 14 días gratis
                </Link>
              </>
            ) : (
              <button
                type="button"
                onClick={() => { setMode('login'); setError(''); setInfo(''); }}
                className="font-semibold text-blue-600 hover:underline dark:text-blue-400 cursor-pointer"
              >
                ← Volver a ingresar
              </button>
            )}
          </div>
        </div>
      </div>

      <SiteFooter />
    </main>
  );
}
