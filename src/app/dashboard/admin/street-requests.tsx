'use client';
import { useCallback, useEffect, useState } from 'react';
import { rpc } from '../../../lib/supabase';

type Req = { id: string; org_id: string; org: string; extra: number; contracted: number; created_at: string };

const box = 'bg-white dark:bg-slate-900/70 border border-emerald-300 dark:border-emerald-900/50 rounded-2xl p-4 sm:p-5 space-y-3';
const btn = 'font-bold px-3 py-1.5 rounded-lg cursor-pointer text-sm';

/** Solicitudes de cobradores adicionales (plan de cobranza en calle): las aprueba el superadmin
 *  o el personal de atención al cliente con el permiso correspondiente. Sin permiso, no se muestra. */
export function StreetRequests() {
  const [rows, setRows] = useState<Req[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    try { setRows(await rpc<Req[]>('admin_street_requests') ?? []); } catch { setRows(null); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const decide = async (r: Req, approve: boolean) => {
    setBusy(true); setMsg('');
    try {
      await rpc('street_decide_request', { p_id: r.id, p_approve: approve });
      setMsg(approve ? `✅ Aprobado: ${r.org} pasa a ${r.contracted + r.extra} cobradores.` : `Solicitud de ${r.org} rechazada.`);
      await load();
    } catch { setMsg('⚠️ No se pudo registrar la decisión.'); }
    setBusy(false);
  };

  if (rows === null) return null;
  return (
    <section className={box}>
      <div>
        <h2 className="text-sm font-bold">🛵 Cobradores adicionales solicitados ({rows.length})</h2>
        <p className="text-[11px] text-slate-500">Cobranza en calle. Al aprobar, el administrador de la empresa puede crear esos cobradores y el monto mensual se actualiza. Registre antes el pago del comprobante.</p>
      </div>
      {msg && <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">{msg}</p>}
      {rows.length === 0 ? <p className="text-xs text-slate-500">No hay solicitudes pendientes.</p> : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 text-sm">
              <p className="font-bold">{r.org} <span className="font-normal text-slate-400">· {new Date(r.created_at).toLocaleString('es')}</span></p>
              <p className="text-slate-700 dark:text-slate-300">Tiene {r.contracted} cobrador(es) y solicita {r.extra} adicional(es).</p>
              <div className="mt-2 flex gap-2">
                <button type="button" disabled={busy} onClick={() => decide(r, true)} className={`${btn} bg-emerald-600 text-white`}>Aprobar</button>
                <button type="button" disabled={busy} onClick={() => decide(r, false)} className={`${btn} bg-red-600/20 text-red-300 border border-red-500/30`}>Rechazar</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
