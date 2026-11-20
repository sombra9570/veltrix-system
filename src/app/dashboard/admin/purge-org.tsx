'use client';
import { useState } from 'react';
import { supabase } from '../../../lib/supabase';

// Borrado definitivo de una empresa con varios pasos: resumen, nombre exacto, clave de borrado (10-12 caracteres) y la palabra BORRAR.
// Todo lo decide el servidor (/api/admin/purge-org); aquí solo se piden los datos y se muestran los errores.
type Json = Record<string, unknown>;
async function call(body: Json): Promise<{ ok: boolean; status: number; data: Json }> {
  const { data: s } = await supabase.auth.getSession();
  const res = await fetch('/api/admin/purge-org', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.session?.access_token ?? ''}` }, body: JSON.stringify(body),
  });
  return { ok: res.ok, status: res.status, data: (await res.json().catch(() => ({}))) as Json };
}

const when = (iso: unknown) => (typeof iso === 'string' ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '');
function explain(d: Json): string {
  switch (d.error) {
    case 'KEY_WRONG': return `Clave incorrecta.${typeof d.left === 'number' ? ` Te quedan ${d.left} intentos antes del bloqueo.` : ''}`;
    case 'KEY_LOCKED': return `Demasiados intentos: bloqueado hasta las ${when(d.locked_until)}.`;
    case 'KEY_NOT_SET': return 'Todavía no hay una clave de borrado: créala primero.';
    case 'KEY_LENGTH': return 'La clave debe tener entre 10 y 12 caracteres.';
    case 'NAME_MISMATCH': return 'El nombre no coincide. No se borró nada.';
    case 'PHRASE': return 'Escribe la palabra BORRAR en mayúsculas.';
    case 'TOO_FAST': return 'Espera unos segundos y vuelve a pulsar el botón.';
    case 'REQUEST_INVALID': return 'La solicitud venció o ya se usó. Cancela y empieza de nuevo.';
    case 'OWN_ORG': return 'No puedes borrar tu propia organización.';
    default: return `No se pudo: ${typeof d.error === 'string' ? d.error : 'error desconocido'}`;
  }
}

const field = 'w-full rounded-lg border border-red-500/30 bg-slate-900 px-2 py-1 text-xs text-white';
const dangerBtn = 'text-[11px] font-bold text-white bg-red-600 disabled:opacity-40 px-2.5 py-1 rounded-lg cursor-pointer';
const ghostBtn = 'text-[11px] font-bold text-slate-300 border border-slate-600 px-2.5 py-1 rounded-lg cursor-pointer disabled:opacity-40';

type Summary = { request: string; name: string; users: number; branches: number; customers: number; orders: number; files: number };

export function PurgeOrg({ orgId, name, onDone }: { orgId: string; name: string; onDone: (msg: string) => void }) {
  const [phase, setPhase] = useState<'idle' | 'setkey' | 'confirm'>('idle');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [sum, setSum] = useState<Summary | null>(null);
  const [typed, setTyped] = useState('');
  const [key, setKey] = useState('');
  const [key2, setKey2] = useState('');
  const [phrase, setPhrase] = useState('');

  const reset = () => { setPhase('idle'); setMsg(''); setSum(null); setTyped(''); setKey(''); setKey2(''); setPhrase(''); };

  const begin = async () => {
    setBusy(true); setMsg('');
    const st = await call({ action: 'status' });
    if (!st.ok) { setMsg(explain(st.data)); setBusy(false); return; }
    if (!st.data.configured) { setPhase('setkey'); setBusy(false); return; }
    await start();
  };
  const start = async () => {
    setBusy(true); setMsg('');
    const r = await call({ action: 'start', org: orgId });
    if (!r.ok) setMsg(explain(r.data)); else { setSum(r.data as unknown as Summary); setPhase('confirm'); }
    setBusy(false);
  };
  const saveKey = async () => {
    if (key !== key2) { setMsg('Las dos claves no coinciden.'); return; }
    setBusy(true); setMsg('');
    const r = await call({ action: 'setkey', newKey: key });
    if (!r.ok) { setMsg(explain(r.data)); setBusy(false); return; }
    setKey(''); setKey2('');
    await start();
  };
  const run = async () => {
    if (!sum) return;
    setBusy(true); setMsg('');
    const r = await call({ action: 'run', request: sum.request, name: typed.trim(), key, phrase });
    if (!r.ok) { setMsg(explain(r.data)); setBusy(false); return; }
    const d = r.data as { rows: number; users: number; files_removed: number; files_failed: string[] };
    const failed = d.files_failed?.length ? ` ⚠️ Fallaron archivos: ${d.files_failed.join('; ')}` : '';
    onDone(`✅ "${name}" borrada por completo: ${d.rows} registros, ${d.users} usuarios y ${d.files_removed} archivos.${failed}`);
  };

  if (phase === 'idle') {
    return (
      <div className="mt-2">
        <button type="button" disabled={busy} onClick={begin} className="text-[11px] font-bold text-red-300 border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 px-2.5 py-1 rounded-lg cursor-pointer disabled:opacity-50">🗑️ Borrar empresa de prueba</button>
        {msg && <p className="mt-1 max-w-xs text-[11px] font-semibold text-red-300">{msg}</p>}
      </div>
    );
  }
  return (
    <div className="mt-2 max-w-xs space-y-2 text-left">
      {phase === 'setkey' && (<>
        <p className="text-[11px] text-red-300">Primero crea la clave de borrado (10 a 12 caracteres). Guárdala tú: no se puede ver después, solo cambiar.</p>
        <input type="password" autoComplete="new-password" value={key} onChange={(e) => setKey(e.target.value)} className={field} aria-label="Nueva clave de borrado" />
        <input type="password" autoComplete="new-password" value={key2} onChange={(e) => setKey2(e.target.value)} className={field} aria-label="Repite la clave" />
        {msg && <p className="text-[11px] font-semibold text-red-300">{msg}</p>}
        <div className="flex gap-2">
          <button type="button" disabled={busy || key.length < 10 || key.length > 12 || key !== key2} onClick={saveKey} className={dangerBtn}>{busy ? 'Guardando…' : 'Guardar clave y seguir'}</button>
          <button type="button" disabled={busy} onClick={reset} className={ghostBtn}>Cancelar</button>
        </div>
      </>)}
      {phase === 'confirm' && sum && (<>
        <p className="text-[11px] text-red-300">
          Se borrará PARA SIEMPRE "{sum.name}": {sum.users} usuarios, {sum.branches} sucursales, {sum.customers} clientes, {sum.orders} pedidos y {sum.files} archivos, además de las cuentas de acceso del personal.
        </p>
        <label className="block text-[11px] text-slate-300">1) Nombre exacto de la empresa
          <input value={typed} onChange={(e) => setTyped(e.target.value)} className={field} autoComplete="off" />
        </label>
        <label className="block text-[11px] text-slate-300">2) Clave de borrado
          <input type="password" value={key} onChange={(e) => setKey(e.target.value)} className={field} autoComplete="off" />
        </label>
        <label className="block text-[11px] text-slate-300">3) Escribe BORRAR
          <input value={phrase} onChange={(e) => setPhrase(e.target.value)} className={field} autoComplete="off" />
        </label>
        {msg && <p className="text-[11px] font-semibold text-red-300">{msg}</p>}
        <div className="flex gap-2">
          <button type="button" disabled={busy || typed.trim() !== sum.name || key.length < 10 || phrase !== 'BORRAR'} onClick={run} className={dangerBtn}>{busy ? 'Borrando…' : 'Borrar definitivamente'}</button>
          <button type="button" disabled={busy} onClick={reset} className={ghostBtn}>Cancelar</button>
        </div>
      </>)}
    </div>
  );
}

// Limpia archivos de empresas que ya no existen (restos de borrados anteriores)
export function SweepFiles({ onDone }: { onDone: (msg: string) => void }) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const run = async () => {
    setBusy(true); setMsg('');
    const r = await call({ action: 'sweep', key });
    if (!r.ok) { setMsg(explain(r.data)); setBusy(false); return; }
    const d = r.data as { files_removed: number; files_failed: string[] };
    setOpen(false); setKey(''); setBusy(false);
    onDone(`🧹 Archivos sueltos eliminados: ${d.files_removed}.${d.files_failed?.length ? ` ⚠️ Fallaron: ${d.files_failed.join('; ')}` : ''}`);
  };
  if (!open) return <button type="button" onClick={() => setOpen(true)} className={ghostBtn}>🧹 Limpiar archivos de empresas ya borradas</button>;
  return (
    <div className="max-w-xs space-y-2">
      <p className="text-[11px] text-slate-300">Borra los archivos de empresas que ya no existen. Pide la clave de borrado.</p>
      <input type="password" value={key} onChange={(e) => setKey(e.target.value)} className={field} autoComplete="off" aria-label="Clave de borrado" />
      {msg && <p className="text-[11px] font-semibold text-red-300">{msg}</p>}
      <div className="flex gap-2">
        <button type="button" disabled={busy || key.length < 10} onClick={run} className={dangerBtn}>{busy ? 'Limpiando…' : 'Limpiar'}</button>
        <button type="button" disabled={busy} onClick={() => { setOpen(false); setKey(''); setMsg(''); }} className={ghostBtn}>Cancelar</button>
      </div>
    </div>
  );
}

// Crear o cambiar la clave de borrado (una sola para todas las empresas; se guarda cifrada y no se puede ver)
export function PurgeKeyPanel({ onDone }: { onDone: (msg: string) => void }) {
  const [open, setOpen] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [cur, setCur] = useState('');
  const [k1, setK1] = useState('');
  const [k2, setK2] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const show = async () => {
    setOpen(true); setMsg('');
    const st = await call({ action: 'status' });
    setConfigured(st.ok ? !!st.data.configured : null);
    if (!st.ok) setMsg(explain(st.data));
  };
  const close = () => { setOpen(false); setCur(''); setK1(''); setK2(''); setMsg(''); };
  const save = async () => {
    if (k1 !== k2) { setMsg('Las dos claves no coinciden.'); return; }
    setBusy(true); setMsg('');
    const r = await call({ action: 'setkey', newKey: k1, key: configured ? cur : undefined });
    setBusy(false);
    if (!r.ok) { setMsg(explain(r.data)); return; }
    close(); onDone(configured ? '🔑 Clave de borrado cambiada.' : '🔑 Clave de borrado creada. Guárdala: no se puede ver después.');
  };
  if (!open) return <button type="button" onClick={show} className={ghostBtn}>🔑 Clave de borrado</button>;
  return (
    <div className="max-w-xs space-y-2">
      <p className="text-[11px] text-slate-300">
        {configured ? 'Cambiar la clave de borrado (10 a 12 caracteres). Pide la actual.' : 'Crea la clave de borrado (10 a 12 caracteres). Vale para todas las empresas, también las que se creen después.'}
      </p>
      {configured && <input type="password" autoComplete="off" value={cur} onChange={(e) => setCur(e.target.value)} className={field} aria-label="Clave actual" placeholder="Clave actual" />}
      <input type="password" autoComplete="new-password" value={k1} onChange={(e) => setK1(e.target.value)} className={field} aria-label="Clave nueva" placeholder="Clave nueva" />
      <input type="password" autoComplete="new-password" value={k2} onChange={(e) => setK2(e.target.value)} className={field} aria-label="Repite la clave nueva" placeholder="Repite la clave nueva" />
      {msg && <p className="text-[11px] font-semibold text-red-300">{msg}</p>}
      <div className="flex gap-2">
        <button type="button" disabled={busy || configured === null || k1.length < 10 || k1.length > 12 || k1 !== k2 || (!!configured && cur.length < 10)} onClick={save} className={dangerBtn}>{busy ? 'Guardando…' : 'Guardar'}</button>
        <button type="button" disabled={busy} onClick={close} className={ghostBtn}>Cancelar</button>
      </div>
    </div>
  );
}

// Borrado automático de empresas suspendidas que no renovaron: muestra el estado y quién se borraría, y se enciende o apaga con la clave
type AutoRow = { org_id: string; name: string; suspended_since: string; delete_on: string };
export function AutoPurgePanel({ onDone }: { onDone: (msg: string) => void }) {
  const [open, setOpen] = useState(false);
  const [st, setSt] = useState<{ enabled: boolean; days: number; list: AutoRow[] } | null>(null);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const day = (iso: string) => new Date(iso).toLocaleDateString();
  const show = async () => {
    setOpen(true); setMsg('');
    const r = await call({ action: 'auto_status' });
    if (r.ok) setSt(r.data as unknown as { enabled: boolean; days: number; list: AutoRow[] }); else setMsg(explain(r.data));
  };
  const close = () => { setOpen(false); setKey(''); setMsg(''); };
  const toggle = async () => {
    if (!st) return;
    setBusy(true); setMsg('');
    const r = await call({ action: 'auto_set', enabled: !st.enabled, key });
    setBusy(false);
    if (!r.ok) { setMsg(explain(r.data)); return; }
    close(); onDone(!st.enabled ? '⏱️ Borrado automático ENCENDIDO.' : '⏱️ Borrado automático apagado.');
  };
  if (!open) return <button type="button" onClick={show} className={ghostBtn}>⏱️ Borrado automático</button>;
  return (
    <div className="max-w-sm space-y-2">
      {!st ? <p className="text-[11px] text-slate-300">Cargando…</p> : (<>
        <p className="text-[11px] text-slate-300">
          Estado: <b className={st.enabled ? 'text-red-300' : 'text-emerald-300'}>{st.enabled ? 'ENCENDIDO' : 'apagado'}</b>. Borra las empresas suspendidas por falta de renovación {st.days} días después de la suspensión, sin pedir la clave. No toca empresas piloto.
        </p>
        {st.list.length === 0 ? <p className="text-[11px] text-slate-400">Ninguna empresa suspendida por ahora.</p> : (
          <ul className="space-y-1 text-[11px] text-slate-300">
            {st.list.map((o) => <li key={o.org_id}>• {o.name}: suspendida el {day(o.suspended_since)} → se borraría el {day(o.delete_on)}</li>)}
          </ul>
        )}
        <label className="block text-[11px] text-slate-300">Clave de borrado para {st.enabled ? 'apagarlo' : 'encenderlo'}
          <input type="password" value={key} onChange={(e) => setKey(e.target.value)} className={field} autoComplete="off" />
        </label>
        {msg && <p className="text-[11px] font-semibold text-red-300">{msg}</p>}
        <div className="flex gap-2">
          <button type="button" disabled={busy || key.length < 10} onClick={toggle} className={dangerBtn}>{busy ? 'Guardando…' : st.enabled ? 'Apagar' : 'Encender'}</button>
          <button type="button" disabled={busy} onClick={close} className={ghostBtn}>Cerrar</button>
        </div>
      </>)}
    </div>
  );
}
