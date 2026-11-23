'use client';
import { useCallback, useEffect, useState } from 'react';
import { rpc } from '../../../lib/supabase';

type Notice = { id: string; title: string; body: string; org_id: string | null; org_name: string | null; created_at: string; expires_at: string; active: boolean; reads: number };

// Avisos de la plataforma a los clientes: a todas las organizaciones o a una sola. Salen dentro de la app y se pueden cerrar.
export function AvisosPanel({ orgs }: { orgs: { org_id: string; name: string }[] }) {
  const [list, setList] = useState<Notice[]>([]);
  const [f, setF] = useState({ title: '', body: '', org: '', days: '7' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const load = useCallback(async () => { try { setList((await rpc<Notice[]>('admin_announcements')) ?? []); } catch (e) { setMsg(e instanceof Error ? e.message : 'Error'); } }, []);
  useEffect(() => { load(); }, [load]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.title.trim() || !f.body.trim()) return;
    setBusy(true); setMsg('');
    try {
      await rpc('admin_announce', { p_title: f.title, p_body: f.body, p_org: f.org || null, p_days: parseInt(f.days, 10) || 7 });
      setF({ title: '', body: '', org: '', days: '7' }); setMsg('✅ Aviso publicado'); await load();
    } catch (err) { setMsg(err instanceof Error ? err.message : 'No se pudo publicar'); } finally { setBusy(false); }
  };
  const del = async (id: string) => { try { await rpc('admin_announcement_delete', { p_id: id }); await load(); } catch (e) { setMsg(e instanceof Error ? e.message : 'Error'); } };
  const inp = 'w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm';

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
      <form onSubmit={send} className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 sm:p-5">
        <h2 className="text-sm font-bold">📣 Nuevo aviso para clientes</h2>
        <p className="text-[11px] text-slate-500">Aparece arriba en la app de los usuarios de la organización hasta que lo cierren o venza.</p>
        <input value={f.title} maxLength={120} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Título" className={inp} />
        <textarea rows={4} value={f.body} maxLength={1000} onChange={(e) => setF({ ...f, body: e.target.value })} placeholder="Mensaje" className={inp} />
        <div className="grid grid-cols-[1fr_6rem] gap-2">
          <select value={f.org} onChange={(e) => setF({ ...f, org: e.target.value })} className={inp}>
            <option value="">Todas las organizaciones</option>
            {orgs.map((o) => <option key={o.org_id} value={o.org_id}>{o.name}</option>)}
          </select>
          <input inputMode="numeric" value={f.days} onChange={(e) => setF({ ...f, days: e.target.value })} className={inp} aria-label="Días visible" />
        </div>
        <p className="text-[11px] text-slate-500">Días visible: de 1 a 90.</p>
        {msg && <p className="text-xs font-semibold text-amber-300">{msg}</p>}
        <button type="submit" disabled={busy || !f.title.trim() || !f.body.trim()} className="w-full cursor-pointer rounded-xl bg-blue-600 py-3 text-sm font-bold disabled:opacity-50">{busy ? 'Publicando…' : 'Publicar aviso'}</button>
      </form>

      <section className="space-y-2">
        <h2 className="text-sm font-bold">Avisos publicados ({list.length})</h2>
        {list.length === 0 && <p className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 text-xs text-slate-500">Todavía no publicaste avisos.</p>}
        {list.map((a) => (
          <div key={a.id} className="space-y-1 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="font-bold">{a.title}</p>
              <button type="button" onClick={() => del(a.id)} className="cursor-pointer text-xs font-semibold text-red-400 hover:underline">Quitar</button>
            </div>
            <p className="text-xs text-slate-300">{a.body}</p>
            <p className="text-[11px] text-slate-500">
              {a.org_name ?? 'Todas las organizaciones'} · {a.active ? `vence ${new Date(a.expires_at).toLocaleDateString('es-BO')}` : 'vencido'} · {a.reads} {a.reads === 1 ? 'lo cerró' : 'lo cerraron'}
            </p>
          </div>
        ))}
      </section>
    </div>
  );
}
