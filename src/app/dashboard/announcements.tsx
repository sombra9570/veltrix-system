'use client';
import { useCallback, useEffect, useState } from 'react';
import { rpc } from '../../lib/supabase';

type Notice = { id: string; title: string; body: string };

// Avisos de Veltrix para la organización: se ven arriba y cada usuario puede cerrarlos.
export function AnnouncementsBanner() {
  const [list, setList] = useState<Notice[]>([]);
  const load = useCallback(async () => { try { setList((await rpc<Notice[]>('my_announcements')) ?? []); } catch { /* sin avisos */ } }, []);
  useEffect(() => { load(); }, [load]);
  const close = async (id: string) => {
    setList((l) => l.filter((x) => x.id !== id));
    try { await rpc('announcement_dismiss', { p_id: id }); } catch { /* se vuelve a mostrar la próxima vez */ }
  };
  if (list.length === 0) return null;
  return (
    <div className="space-y-2 px-3 pt-3 sm:px-6">
      {list.slice(0, 2).map((a) => (
        <div key={a.id} className="flex items-start gap-3 rounded-xl border border-sky-300 bg-sky-50 px-3 py-2.5 dark:border-sky-500/30 dark:bg-sky-500/10" role="status">
          <span aria-hidden>📣</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">{a.title}</p>
            <p className="whitespace-pre-line text-xs text-slate-600 dark:text-slate-300">{a.body}</p>
          </div>
          <button type="button" onClick={() => close(a.id)} aria-label="Cerrar" className="cursor-pointer rounded-md px-2 py-1 text-sm font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white">✕</button>
        </div>
      ))}
    </div>
  );
}
