'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, rpc } from '../../lib/supabase';
import { ui } from '../site-header';
import { useT } from '../i18n';
import { money, shortTime } from './format';
import { compressImage } from './image';
import { PhotoPicker, photoErrorKey } from './photo-picker';
import { Card } from './shell';

// Carpeta privada "sale-files": <org>/<sucursal>/<tipo>/<archivo>  (migración 057)
const BUCKET = 'sale-files';

/** Sube una imagen (ya comprimida o un PNG chico como la firma) y devuelve la ruta */
export async function uploadSaleFile(orgId: string, branchId: string, kind: 'qr' | 'pay' | 'wo' | 'task', blob: Blob): Promise<string> {
  const ext = blob.type === 'image/webp' ? 'webp' : blob.type === 'image/png' ? 'png' : 'jpg';
  const path = `${orgId}/${branchId}/${kind}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const up = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: blob.type });
  if (up.error) throw new Error(`PHOTO:${up.error.message}`);
  return path;
}

/** Enlaces temporales (1 h) para ver las imágenes privadas */
export function useSignedUrls(paths: string[]) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const key = paths.join('|');
  useEffect(() => {
    const list = key ? key.split('|') : [];
    if (list.length === 0) { setUrls({}); return; }
    supabase.storage.from(BUCKET).createSignedUrls(list, 3600).then(({ data }) => {
      const m: Record<string, string> = {};
      (data ?? []).forEach((d) => { if (d.path && d.signedUrl) m[d.path] = d.signedUrl; });
      setUrls(m);
    });
  }, [key]);
  return urls;
}

type QrInfo = { org_id: string; branch_id: string; path: string | null; note: string | null; manager: boolean };

/* ---------------- Dueño / gerente: QR de cobro de la sucursal ---------------- */
export function PayQrSetup({ branchId }: { branchId: string }) {
  const { t } = useT();
  const [info, setInfo] = useState<QrInfo | null>(null);
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const urls = useSignedUrls(info?.path ? [info.path] : []);

  const load = useCallback(async () => {
    try { const i = await rpc<QrInfo>('pay_qr_info', { p_branch: branchId, p_shift: null }); setInfo(i); setNote(i.note ?? ''); }
    catch { setInfo(null); }
  }, [branchId]);
  useEffect(() => { load(); }, [load]);

  const save = async (remove = false) => {
    if (!info) return;
    setBusy(true); setMsg(null);
    try {
      let path = remove ? null : info.path;
      if (!remove && photo) path = await uploadSaleFile(info.org_id, info.branch_id, 'qr', await compressImage(photo, 1200, 0.9));
      await rpc('set_pay_qr', { p_branch: branchId, p_path: path, p_note: remove ? null : note });
      setPhoto(null); setMsg({ ok: true, text: t('qr.saved') }); await load();
    } catch (e) {
      const m = (e as Error).message;
      setMsg({ ok: false, text: m.startsWith('PHOTO') ? t(photoErrorKey(m)) : t('err.generic') });
    } finally { setBusy(false); }
  };

  if (!info || !info.manager) return null;
  return (
    <Card className="space-y-3">
      <div>
        <h2 className="font-bold">📱 {t('qr.title')}</h2>
        <p className={`text-xs ${ui.muted}`}>{t('qr.hint')}</p>
      </div>
      {info.path && urls[info.path] && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={urls[info.path]} alt={t('qr.title')} className="mx-auto max-h-56 rounded-xl border border-slate-200 bg-white p-2 dark:border-slate-700" />
      )}
      <PhotoPicker value={photo} onChange={setPhoto} disabled={busy} />
      <div>
        <label className={ui.label}>{t('qr.note')}</label>
        <input value={note} maxLength={160} onChange={(e) => setNote(e.target.value)} placeholder={t('qr.notePh')} className={ui.input} />
      </div>
      {msg && <p className={`text-sm font-semibold ${msg.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{msg.text}</p>}
      <div className="flex gap-2">
        {info.path && <button type="button" disabled={busy} onClick={() => save(true)} className={`${ui.btnGhost} flex-1`}>{t('qr.remove')}</button>}
        <button type="button" disabled={busy || (!photo && !info.path)} onClick={() => save(false)} className={`${ui.btnPrimary} flex-1`}>{busy ? t('common.wait') : t('prod.save')}</button>
      </div>
    </Card>
  );
}

/* ---------------- Cajero: QR en pantalla + foto del comprobante ---------------- */
export function useShiftQr(shiftId: string) {
  const [info, setInfo] = useState<QrInfo | null>(null);
  useEffect(() => {
    rpc<QrInfo>('pay_qr_info', { p_branch: null, p_shift: shiftId }).then(setInfo).catch(() => setInfo(null));
  }, [shiftId]);
  return info;
}

export function QrPayBox({ info, photo, onPhoto, disabled }: {
  info: QrInfo | null; photo: File | null; onPhoto: (f: File | null) => void; disabled?: boolean;
}) {
  const { t } = useT();
  const urls = useSignedUrls(info?.path ? [info.path] : []);
  return (
    <div className="space-y-3 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
      {info?.path && urls[info.path] ? (
        <div className="text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={urls[info.path]} alt={t('qr.title')} className="mx-auto max-h-64 rounded-xl bg-white p-2" />
          {info.note && <p className="mt-1 text-sm font-semibold">{info.note}</p>}
          <p className={`text-xs ${ui.muted}`}>{t('qr.showCustomer')}</p>
        </div>
      ) : <p className={`text-xs ${ui.muted}`}>{t('qr.none')}</p>}
      <div>
        <p className={ui.label}>🧾 {t('qr.proof')}</p>
        <PhotoPicker value={photo} onChange={onPhoto} disabled={disabled} />
      </div>
    </div>
  );
}

/** Después de registrar el cobro: sube la foto y la une al cobro. Devuelve false si no se pudo (el cobro igual quedó). */
export async function attachPaymentProof(info: QrInfo | null, offlineUuid: string, photo: File | null): Promise<boolean> {
  if (!photo || !info) return true;
  try {
    const path = await uploadSaleFile(info.org_id, info.branch_id, 'pay', await compressImage(photo));
    await rpc('payment_proof_add', { p_offline_uuid: offlineUuid, p_path: path });
    return true;
  } catch { return false; }
}

/* ---------------- Dueño: comprobantes de un turno ---------------- */
type Proof = { at: string; amount: number; method: string; path: string; customer: string | null };
export function ShiftProofs({ shiftId, currency }: { shiftId: string; currency: string }) {
  const { t, lang } = useT();
  const [list, setList] = useState<Proof[]>([]);
  useEffect(() => { rpc<Proof[]>('shift_proofs', { p_shift: shiftId }).then((r) => setList(r ?? [])).catch(() => setList([])); }, [shiftId]);
  const urls = useSignedUrls(list.map((p) => p.path));
  if (list.length === 0) return null;
  return (
    <div>
      <h3 className="mb-2 text-sm font-bold">🧾 {t('qr.proofs')} ({list.length})</h3>
      <ul className="grid grid-cols-3 gap-2">
        {list.map((p, k) => (
          <li key={k} className="text-center text-[11px]">
            <a href={urls[p.path]} target="_blank" rel="noopener noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {urls[p.path] ? <img src={urls[p.path]} alt="" className="aspect-square w-full rounded-lg object-cover" /> : <div className="aspect-square w-full rounded-lg bg-slate-100 dark:bg-slate-800" />}
            </a>
            <p className="mt-1 font-semibold">{money(Number(p.amount), currency, lang)}</p>
            <p className={ui.muted}>{shortTime(p.at, lang)}{p.customer ? ` · ${p.customer}` : ''}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------- Taller: fotos de recepción y firma ---------------- */
type WoFiles = { org_id: string; branch_id: string; files: { id: string; kind: 'photo' | 'signature'; path: string; at: string }[] };

export function WorkshopFiles({ woId, canEdit }: { woId: string; canEdit: boolean }) {
  const { t, lang } = useT();
  const [data, setData] = useState<WoFiles | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [signing, setSigning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setData(await rpc<WoFiles>('wo_files', { p_wo: woId })); } catch { setData(null); }
  }, [woId]);
  useEffect(() => { load(); }, [load]);
  const urls = useSignedUrls((data?.files ?? []).map((f) => f.path));
  const photos = (data?.files ?? []).filter((f) => f.kind === 'photo');
  const sig = (data?.files ?? []).find((f) => f.kind === 'signature');

  const add = async (kind: 'photo' | 'signature', blob: Blob) => {
    if (!data) return;
    setBusy(true); setErr(null);
    try {
      const path = await uploadSaleFile(data.org_id, data.branch_id, 'wo', blob);
      await rpc('wo_file_add', { p_wo: woId, p_kind: kind, p_path: path });
      setPhoto(null); setSigning(false); await load();
    } catch (e) {
      const m = (e as Error).message;
      setErr(m.includes('WO_PHOTO_LIMIT') ? t('wof.limit') : m.startsWith('PHOTO') ? t(photoErrorKey(m)) : t('err.generic'));
    } finally { setBusy(false); }
  };
  const addPhoto = async () => {
    if (!photo) return;
    try { await add('photo', await compressImage(photo)); } catch (e) { setErr(t(photoErrorKey((e as Error).message))); }
  };

  if (!data) return null;
  return (
    <Card className="space-y-3">
      <div>
        <h3 className="font-bold">📸 {t('wof.title')}</h3>
        <p className={`text-xs ${ui.muted}`}>{t('wof.hint')}</p>
      </div>
      {photos.length > 0 && (
        <ul className="grid grid-cols-4 gap-2">
          {photos.map((f) => (
            <li key={f.id}>
              <a href={urls[f.path]} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {urls[f.path] ? <img src={urls[f.path]} alt="" className="aspect-square w-full rounded-lg object-cover" /> : <div className="aspect-square w-full rounded-lg bg-slate-100 dark:bg-slate-800" />}
              </a>
            </li>
          ))}
        </ul>
      )}
      {canEdit && photos.length < 8 && (
        <div className="space-y-2">
          <PhotoPicker value={photo} onChange={setPhoto} disabled={busy} />
          {photo && <button type="button" disabled={busy} onClick={addPhoto} className={`${ui.btnPrimary} w-full`}>{busy ? t('common.wait') : t('wof.addPhoto')}</button>}
        </div>
      )}

      <div className="border-t border-slate-200 pt-3 dark:border-slate-800">
        <p className={ui.label}>✍️ {t('wof.signature')}</p>
        {sig && urls[sig.path] && !signing && (
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={urls[sig.path]} alt={t('wof.signature')} className="h-24 w-full rounded-lg border border-slate-200 bg-white object-contain dark:border-slate-700" />
            <p className={`mt-1 text-[11px] ${ui.muted}`}>{t('wof.signedAt', { date: new Date(sig.at).toLocaleString(lang, { dateStyle: 'short', timeStyle: 'short' }) })}</p>
          </div>
        )}
        {canEdit && (signing
          ? <SignaturePad busy={busy} onCancel={() => setSigning(false)} onSave={(b) => add('signature', b)} />
          : <button type="button" onClick={() => setSigning(true)} className={`${ui.btnGhost} mt-2 w-full`}>{sig ? t('wof.resign') : t('wof.sign')}</button>)}
      </div>
      {err && <p className="text-sm font-semibold text-red-600 dark:text-red-400">{err}</p>}
    </Card>
  );
}

/** Firma con el dedo o el mouse; se guarda como PNG chico */
function SignaturePad({ onSave, onCancel, busy }: { onSave: (b: Blob) => void; onCancel: () => void; busy: boolean }) {
  const { t } = useT();
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const c = ref.current; if (!c) return;
    const r = c.getBoundingClientRect();
    c.width = Math.round(r.width * 2); c.height = Math.round(r.height * 2);
    const ctx = c.getContext('2d')!;
    ctx.scale(2, 2); ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#0f172a';
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, r.width, r.height);
  }, []);

  const pos = (e: React.PointerEvent) => { const r = ref.current!.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] as const; };
  const down = (e: React.PointerEvent) => {
    e.preventDefault(); ref.current!.setPointerCapture(e.pointerId); drawing.current = true;
    const ctx = ref.current!.getContext('2d')!; const [x, y] = pos(e); ctx.beginPath(); ctx.moveTo(x, y);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const ctx = ref.current!.getContext('2d')!; const [x, y] = pos(e); ctx.lineTo(x, y); ctx.stroke(); setDirty(true);
  };
  const up = () => { drawing.current = false; };
  const clear = () => {
    const c = ref.current!; const ctx = c.getContext('2d')!; const r = c.getBoundingClientRect();
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, r.width, r.height); setDirty(false);
  };
  const save = () => { ref.current!.toBlob((b) => { if (b) onSave(b); }, 'image/png'); };

  return (
    <div className="mt-2 space-y-2">
      <canvas ref={ref} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}
        className="h-40 w-full touch-none rounded-xl border-2 border-dashed border-slate-300 bg-white dark:border-slate-600" />
      <p className={`text-[11px] ${ui.muted}`}>{t('wof.signHint')}</p>
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className={`${ui.btnGhost} flex-1`}>{t('cash.cancel')}</button>
        <button type="button" onClick={clear} className={`${ui.btnGhost} flex-1`}>{t('wof.clear')}</button>
        <button type="button" disabled={!dirty || busy} onClick={save} className={`${ui.btnPrimary} flex-1`}>{busy ? t('common.wait') : t('prod.save')}</button>
      </div>
    </div>
  );
}
