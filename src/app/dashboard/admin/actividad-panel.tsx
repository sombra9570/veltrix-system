'use client';
import { useCallback, useEffect, useState } from 'react';
import { rpc } from '../../../lib/supabase';

type Row = { at: string; org: string | null; table: string; action: string; actor: string; changed: string[]; what: string | null };
const TABLE: Record<string, string> = { organizations: 'Organización', companies: 'Empresa', branches: 'Sucursal', memberships: 'Equipo', org_modules: 'Módulo', profiles: 'Perfil' };
const ACTION: Record<string, string> = { INSERT: '➕ Creó', UPDATE: '✏️ Cambió', DELETE: '🗑️ Eliminó', set_role: '🎭 Cambió cargo', add_team_role: '👥 Agregó cargo' };

// Registro de actividad de la plataforma: solo cambios de estructura (nunca ventas, clientes ni datos de negocio).
export function ActividadPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const load = useCallback(async () => {
    setBusy(true); setErr('');
    try { setRows((await rpc<Row[]>('admin_activity', { p_limit: 120 })) ?? []); } catch (e) { setErr(e instanceof Error ? e.message : 'Error'); } finally { setBusy(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold">🧾 Registro de actividad</h2>
          <p className="text-[11px] text-slate-500">Cambios en organizaciones, empresas, sucursales, equipos y módulos. No se muestran las ventas ni los datos operativos de cada negocio.</p>
        </div>
        <button type="button" onClick={load} disabled={busy} className="cursor-pointer rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold disabled:opacity-50">{busy ? '…' : '↻'}</button>
      </div>
      {err && <p className="text-xs font-semibold text-red-400">{err}</p>}
      {rows.length === 0 && !busy && <p className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 p-4 text-xs text-slate-500">Aún no hay actividad registrada.</p>}
      <ul className="space-y-1.5">
        {rows.map((r, i) => (
          <li key={i} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/70 px-3 py-2 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-1">
              <p className="font-bold">{ACTION[r.action] ?? r.action} · {TABLE[r.table] ?? r.table}{r.what ? ` · ${r.what}` : ''}</p>
              <p className="text-[11px] text-slate-500">{new Date(r.at).toLocaleString('es-BO', { dateStyle: 'short', timeStyle: 'short' })}</p>
            </div>
            <p className="text-slate-400">{r.org ?? 'Plataforma'} · {r.actor}{r.changed.length > 0 ? ` · campos modificados: ${r.changed.join(', ')}` : ''}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
