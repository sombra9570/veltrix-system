'use client';
import { useCallback, useEffect, useState } from 'react';
import { rpc } from '../../../lib/supabase';

type U = { org_id: string; name: string; plan: string; users: number; max_users: number; branches: number; max_branches: number; companies: number; max_companies: number; storage_mb: number; max_storage_mb: number; ai_used: number; ai_quota: number };

function Meter({ label, used, max, unit = '' }: { label: string; used: number; max: number; unit?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0;
  const hot = pct >= 90;
  return (
    <div>
      <div className="flex justify-between text-[11px]"><span className="text-slate-400">{label}</span><span className="font-bold">{used}{unit} / {max}{unit}</span></div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className={`h-full rounded-full ${hot ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

// Uso de recursos de cada organización frente a lo que incluye su plan.
export function RecursosPanel() {
  const [rows, setRows] = useState<U[]>([]);
  const [err, setErr] = useState('');
  const load = useCallback(async () => { try { setRows((await rpc<U[]>('admin_org_usage')) ?? []); } catch (e) { setErr(e instanceof Error ? e.message : 'Error'); } }, []);
  useEffect(() => { load(); }, [load]);
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-bold">📦 Uso de recursos por organización</h2>
      {err && <p className="text-xs font-semibold text-red-400">{err}</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {rows.map((r) => (
          <div key={r.org_id} className="space-y-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/70 p-4">
            <div className="flex items-center justify-between"><p className="font-bold">{r.name}</p><span className="rounded-full border border-slate-300 dark:border-slate-700 px-2.5 py-0.5 text-[11px] font-bold text-slate-700 dark:text-slate-300">{r.plan}</span></div>
            <Meter label="👥 Usuarios" used={r.users} max={r.max_users} />
            <Meter label="📍 Sucursales" used={r.branches} max={r.max_branches} />
            <Meter label="🏢 Empresas" used={r.companies} max={r.max_companies} />
            <Meter label="🗂️ Almacenamiento" used={r.storage_mb} max={r.max_storage_mb} unit=" MB" />
            <Meter label="✨ IA este mes" used={r.ai_used} max={r.ai_quota} />
          </div>
        ))}
      </div>
    </section>
  );
}
