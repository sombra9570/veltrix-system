'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useVeltrixAuth, homeForRole } from '../auth-system';

// Enlace de instalación / entrada de la app: directo al panel de cada rol, o a ingresar.
export default function AppEntry() {
  const router = useRouter();
  const { loaded, session } = useVeltrixAuth();
  useEffect(() => {
    if (!loaded) return;
    router.replace(session ? homeForRole(session.role) : '/ingresar');
  }, [loaded, session, router]);
  return <div className="min-h-dvh bg-slate-950" />;
}
