'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import { SiteHeader, SiteFooter, ui } from '../site-header';

// Aquí llega el enlace del correo "¿Olvidaste tu contraseña?"
export default function RestablecerPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [pass1, setPass1] = useState('');
  const [pass2, setPass2] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

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
    if (pass1.length < 8) return setError('La contraseña debe tener al menos 8 caracteres.');
    if (pass1 !== pass2) return setError('Las dos contraseñas no coinciden.');
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password: pass1 });
    setBusy(false);
    if (err) return setError('No se pudo cambiar. Pide un enlace nuevo e inténtalo otra vez.');
    await supabase.auth.signOut();
    setDone(true);
    setTimeout(() => router.push('/ingresar'), 2500);
  };

  return (
    <main className="flex min-h-screen flex-col">
      <SiteHeader showAuthButtons={false} />
      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <div className={`w-full max-w-sm rounded-2xl p-7 ${ui.card}`}>
          <h1 className="text-2xl font-extrabold">Nueva contraseña</h1>

          {done ? (
            <p className="mt-4 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
              ✅ Listo. Ya puedes ingresar con tu contraseña nueva.
            </p>
          ) : !ready ? (
            <p className={`mt-3 text-sm ${ui.muted}`}>
              Abre esta página desde el enlace que te llegó al correo. Si el enlace venció,{' '}
              <Link href="/ingresar" className="font-semibold text-blue-600 hover:underline dark:text-blue-400">
                pide uno nuevo
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
                <label className={ui.label}>Contraseña nueva (mínimo 8)</label>
                <input type="password" autoComplete="new-password" value={pass1}
                  onChange={(e) => setPass1(e.target.value)} className={ui.input} required />
              </div>
              <div>
                <label className={ui.label}>Repítela</label>
                <input type="password" autoComplete="new-password" value={pass2}
                  onChange={(e) => setPass2(e.target.value)} className={ui.input} required />
              </div>
              <button type="submit" disabled={busy} className={`${ui.btnPrimary} w-full`}>
                {busy ? 'Guardando…' : 'Guardar contraseña'}
              </button>
            </form>
          )}
        </div>
      </div>
      <SiteFooter />
    </main>
  );
}
