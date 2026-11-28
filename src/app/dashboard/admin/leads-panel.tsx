'use client';
import { useCallback, useEffect, useState } from 'react';
import { rpc } from '../../../lib/supabase';
import { useLiveTopic } from '../live';

type Lead = { id: string; created_at: string; full_name: string; phone: string; email: string; place: string; note: string | null; status: 'new' | 'contacted' | 'closed'; answers: Record<string, unknown> };
const ST = { new: { label: 'Nueva', cls: 'bg-amber-500/15 text-amber-300' }, contacted: { label: 'Contactada', cls: 'bg-sky-500/15 text-sky-300' }, closed: { label: 'Cerrada', cls: 'bg-slate-700 text-slate-700 dark:text-slate-300' } } as const;
const card = 'rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4';
const ghost = 'rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer';

/** Solicitudes de personas que no supieron qué elegir y pidieron que las contactemos. */
export function LeadsPanel() {
  const [list, setList] = useState<Lead[] | null>(null);
  const [filter, setFilter] = useState<'all' | Lead['status']>('new');
  const load = useCallback(async () => { try { setList((await rpc<Lead[]>('platform_leads_list')) ?? []); } catch { setList((l) => l ?? []); } }, []);
  useEffect(() => { void load(); }, [load]);
  useLiveTopic('plat:inbox', load);

  const set = async (id: string, status: Lead['status']) => {
    setList((l) => l?.map((x) => (x.id === id ? { ...x, status } : x)) ?? l);
    try { await rpc('platform_lead_set', { p_id: id, p_status: status }); } catch { void load(); }
  };
  const shown = (list ?? []).filter((l) => filter === 'all' || l.status === filter);
  const digits = (p: string) => p.replace(/[^0-9]/g, '');

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {(['new', 'contacted', 'closed', 'all'] as const).map((f) => (
          <button key={f} type="button" onClick={() => setFilter(f)} className={`rounded-full border px-3 py-1.5 text-xs font-bold cursor-pointer ${filter === f ? 'border-sky-500 bg-sky-600 text-white' : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300'}`}>
            {f === 'all' ? 'Todas' : ST[f].label}{list && f !== 'all' ? ` (${list.filter((l) => l.status === f).length})` : ''}
          </button>
        ))}
      </div>
      {list === null && <p className="text-sm text-slate-400">Cargando…</p>}
      {list && shown.length === 0 && <p className={`${card} text-sm text-slate-400`}>No hay solicitudes en esta lista.</p>}
      {shown.map((l) => (
        <article key={l.id} className={card}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-extrabold">{l.full_name}</p>
              <p className="text-xs text-slate-400">📍 {l.place} · {new Date(l.created_at).toLocaleString()}</p>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${ST[l.status].cls}`}>{ST[l.status].label}</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            <a className={ghost} href={`tel:${l.phone}`}>📞 {l.phone}</a>
            <a className={ghost} href={`https://wa.me/${digits(l.phone)}`} target="_blank" rel="noreferrer">💬 WhatsApp</a>
            <a className={ghost} href={`mailto:${l.email}`}>✉️ {l.email}</a>
          </div>
          {l.note && <p className="mt-3 rounded-lg bg-slate-50 dark:bg-slate-950 p-3 text-sm">{l.note}</p>}
          {Array.isArray(l.answers?.unsure) && (l.answers.unsure as string[]).length > 0 && (
            <p className="mt-2 text-xs text-slate-400">No estaba seguro en: {(l.answers.unsure as string[]).join(', ')}</p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {l.status !== 'contacted' && <button type="button" onClick={() => set(l.id, 'contacted')} className={ghost}>Marcar contactada</button>}
            {l.status !== 'closed' && <button type="button" onClick={() => set(l.id, 'closed')} className={ghost}>Cerrar</button>}
            {l.status !== 'new' && <button type="button" onClick={() => set(l.id, 'new')} className={ghost}>Volver a nueva</button>}
          </div>
        </article>
      ))}
    </section>
  );
}
