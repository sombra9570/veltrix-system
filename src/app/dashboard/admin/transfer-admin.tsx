'use client';
import { useCallback, useEffect, useState } from 'react';
import { supabase, rpc } from '../../../lib/supabase';
import { compressImage } from '../image';

type Info = { holder?: string; bank?: string; account?: string; currency?: string; note?: string; qr_path?: string };
type Proof = { id: string; at: string; org: string; email: string | null; plan: string | null; plan_usd: number | null; months: number; amount: number; currency: string; reference: string | null; path: string };

const box = 'bg-slate-900/70 border border-emerald-900/50 rounded-2xl p-4 sm:p-5 space-y-3';
const inp = 'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white';
const btn = 'font-bold px-3 py-1.5 rounded-lg cursor-pointer text-sm';

/** Consola: datos para recibir transferencias/QR y aprobación de comprobantes de pago de suscripciones. */
export function TransferAdmin() {
  const [info, setInfo] = useState<Info>({});
  const [proofs, setProofs] = useState<Proof[]>([]);
  const [usd, setUsd] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setInfo(await rpc<Info>('billing_transfer_info') ?? {});
      const p = await rpc<Proof[]>('admin_payment_proofs', { p_status: 'pending' }) ?? [];
      setProofs(p);
      setUsd(Object.fromEntries(p.map((x) => [x.id, String(Number(x.plan_usd ?? 0) * x.months)])));
    } catch (e) { setMsg(e instanceof Error ? e.message : 'No se pudo cargar'); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const saveInfo = async (qrFile?: File) => {
    setBusy(true); setMsg('');
    try {
      let next = info;
      if (qrFile) {
        const blob = await compressImage(qrFile, 1000, 0.9);
        const path = `platform/qr-${Date.now()}.${blob.type === 'image/webp' ? 'webp' : 'jpg'}`;
        const up = await supabase.storage.from('billing-proofs').upload(path, blob, { contentType: blob.type });
        if (up.error) throw up.error;
        next = { ...info, qr_path: path };
      }
      await rpc('admin_set_transfer_info', { p_value: next });
      setInfo(next); setMsg('Datos de cobro guardados');
    } catch (e) { setMsg(e instanceof Error ? e.message : 'No se pudo guardar'); }
    finally { setBusy(false); }
  };

  const view = async (path: string) => {
    const { data } = await supabase.storage.from('billing-proofs').createSignedUrl(path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener');
  };

  const decide = async (p: Proof, approve: boolean) => {
    const amount = Number((usd[p.id] ?? '0').replace(',', '.'));
    if (approve && !(amount > 0)) { setMsg('Indica el monto en USD a registrar'); return; }
    const note = approve ? '' : (window.prompt('Motivo del rechazo (lo verá el cliente)') ?? '');
    setBusy(true); setMsg('');
    try {
      const r = await rpc<{ until: string | null }>('admin_decide_payment_proof', { p_id: p.id, p_approve: approve, p_amount_usd: approve ? amount : null, p_note: note });
      setMsg(approve ? `✅ ${p.org}: suscripción pagada hasta ${r.until ?? ''}` : `Rechazado: ${p.org}`);
      load();
    } catch (e) { setMsg(e instanceof Error ? e.message : 'No se pudo resolver'); }
    finally { setBusy(false); }
  };

  const f = (k: keyof Info, label: string) => (
    <label className="block text-xs text-slate-400">{label}
      <input className={inp} value={info[k] ?? ''} onChange={(e) => setInfo({ ...info, [k]: e.target.value })} />
    </label>
  );

  return (
    <section className={box}>
      <div>
        <h2 className="text-sm font-bold">🏦 Pagos por transferencia o QR ({proofs.length} por revisar)</h2>
        <p className="text-[11px] text-slate-500">Los clientes ven estos datos en "Mi plan", pagan desde su banco y suben la foto del comprobante. Al aprobar, la suscripción se extiende sola por los meses pagados.</p>
      </div>
      {msg && <p className="text-xs font-semibold text-slate-200">{msg}</p>}

      {proofs.length > 0 && (
        <ul className="space-y-2">
          {proofs.map((p) => (
            <li key={p.id} className="rounded-xl border border-slate-800 p-3 text-sm">
              <p className="font-bold">{p.org} <span className="font-normal text-slate-400">· {p.plan ?? '—'} · {new Date(p.at).toLocaleString('es')}</span></p>
              <p className="text-slate-300">Pagó {p.currency} {Number(p.amount).toLocaleString('es')} por {p.months} mes(es){p.reference ? ` · Ref: ${p.reference}` : ''}{p.email ? ` · ${p.email}` : ''}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => view(p.path)} className={`${btn} bg-slate-800 text-slate-200`}>🧾 Ver comprobante</button>
                <label className="flex items-center gap-1 text-xs text-slate-400">USD a registrar
                  <input className={`${inp} w-24`} inputMode="decimal" value={usd[p.id] ?? ''} onChange={(e) => setUsd({ ...usd, [p.id]: e.target.value })} />
                </label>
                <button type="button" disabled={busy} onClick={() => decide(p, true)} className={`${btn} bg-emerald-600 text-white`}>Aprobar</button>
                <button type="button" disabled={busy} onClick={() => decide(p, false)} className={`${btn} bg-red-600/20 text-red-300 border border-red-500/30`}>Rechazar</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <details className="rounded-xl border border-slate-800 p-3">
        <summary className="cursor-pointer text-xs font-bold text-slate-300">Datos de tu cuenta para recibir pagos</summary>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {f('holder', 'Titular')}
          {f('bank', 'Banco')}
          {f('account', 'Número de cuenta')}
          {f('currency', 'Moneda (ej. BOB)')}
          <div className="sm:col-span-2">{f('note', 'Nota para el cliente (opcional)')}</div>
          <label className="block text-xs text-slate-400">QR de cobro (imagen)
            <input type="file" accept="image/*" className={inp} onChange={(e) => { const q = e.target.files?.[0]; if (q) saveInfo(q); }} />
          </label>
          <p className="self-end text-[11px] text-slate-500">{info.qr_path ? 'QR cargado ✓' : 'Sin QR'}</p>
        </div>
        <button type="button" disabled={busy} onClick={() => saveInfo()} className={`${btn} mt-3 bg-emerald-600 text-white`}>Guardar datos</button>
      </details>
    </section>
  );
}
