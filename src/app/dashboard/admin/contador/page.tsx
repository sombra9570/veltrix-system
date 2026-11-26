'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useVeltrixAuth } from '../../../auth-system';
import { rpc } from '../../../../lib/supabase';
import { Spinner } from '../../../spinner';
import { ConocimientoPanel, type KnowledgeAccess } from '../conocimiento-panel';

type Access = KnowledgeAccess & { func: string | null; admin: boolean };

// Ventana del contador: revisa, redacta y publica la biblioteca de conocimiento de Veltrix IA, según sus permisos
export default function ContadorPage() {
  const router = useRouter();
  const { loaded, session, logout } = useVeltrixAuth();
  const [access, setAccess] = useState<Access | null>(null);

  useEffect(() => {
    if (!loaded) return;
    if (!session || (session.role !== 'support' && session.role !== 'superadmin')) { router.replace('/'); return; }
    rpc<Access>('knowledge_my_access').then((a) => {
      if (!a || (!a.edit && !a.verify)) router.replace('/dashboard/admin/soporte'); else setAccess(a);
    }).catch(() => router.replace('/'));
  }, [loaded, session, router]);

  if (!loaded || !session || !access) return <div className="grid min-h-dvh place-items-center bg-slate-950"><Spinner /></div>;

  return (
    <main className="min-h-dvh bg-slate-950 px-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(1.5rem+env(safe-area-inset-bottom))] text-white md:p-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-xl font-extrabold">📚 Biblioteca de conocimiento · Contador</h1>
            <p className="text-xs text-slate-400">{session.name} · {access.verify ? 'Revisa, redacta y publica' : 'Redacta borradores'}</p>
          </div>
          <div className="flex gap-2">
            {access.admin && <a href="/dashboard/admin" className="rounded-lg border border-slate-700 px-3 py-2 text-sm font-semibold hover:bg-slate-800">Panel de administración</a>}
            <button type="button" onClick={() => logout()} className="cursor-pointer rounded-lg border border-slate-700 px-3 py-2 text-sm font-semibold hover:bg-slate-800">Salir</button>
          </div>
        </header>
        <ConocimientoPanel access={{ edit: access.edit, verify: access.verify }} />
      </div>
    </main>
  );
}
