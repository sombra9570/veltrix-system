'use client';
import { useState } from 'react';
import { supabase, rpc } from '../../../lib/supabase';
import { Card } from '../shell';
import { ui } from '../../site-header';
import { useT } from '../../i18n';
import { compressImage, extFor } from '../image';
import { PhotoPicker, photoErrorKey } from '../photo-picker';

const BUCKET = 'customer-files';
type Gps = { lat: number; lng: number } | null;

/** Ubicación precisa del teléfono (hasta 15 s) */
function readGps(): Promise<Gps> {
  const once = (high: boolean, timeout: number, maxAge: number) => new Promise<Gps>((resolve) => {
    if (!('geolocation' in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6) }),
      () => resolve(null),
      { enableHighAccuracy: high, timeout, maximumAge: maxAge },
    );
  });
  // Celular: GPS preciso. Computador (sin GPS): si falla, se reintenta con la ubicación aproximada de la red.
  return once(true, 10000, 0).then((g) => g ?? once(false, 15000, 60000));
}

function GpsButton({ value, onChange, label }: { value: Gps; onChange: (g: Gps) => void; label: string }) {
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState(false);
  const get = async () => {
    setBusy(true); setFail(false);
    const g = await readGps();
    setBusy(false);
    if (g) onChange(g); else setFail(true);
  };
  return (
    <div className="space-y-1">
      <button type="button" onClick={get} disabled={busy} className={`${ui.btnGhost} w-full`}>
        📍 {busy ? t('common.wait') : value ? t('cx.nc.gpsSet') : label}
      </button>
      {value && <p className={`text-xs ${ui.muted}`}>{value.lat}, {value.lng} · {t('cx.nc.gpsRetry')}</p>}
      {fail && <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">{t('cx.near.noGps')}</p>}
    </div>
  );
}

/**
 * Cliente nuevo de la ruta: datos, carnet por los dos lados, foto, ubicación GPS y garante.
 * Las fotos se suben al guardar, así que hace falta internet (el cobro sí funciona sin señal).
 */
export function NewClient({ routeId, orgId, online, canLoan, onSaved, onLoan }: {
  routeId: string; orgId: string; online: boolean; canLoan: boolean;
  onSaved: (id: string) => Promise<void> | void; onLoan: () => void;
}) {
  const { t } = useT();
  const [f, setF] = useState({ name: '', ci: '', phone: '', address: '', gName: '', gPhone: '', gAddress: '' });
  const [gps, setGps] = useState<Gps>(null);
  const [gGps, setGGps] = useState<Gps>(null);
  const [ciFront, setCiFront] = useState<File | null>(null);
  const [ciBack, setCiBack] = useState<File | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [gPhoto, setGPhoto] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState<{ name: string; photosOk: boolean } | null>(null);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));

  const upload = async (id: string, file: File, kind: string) => {
    const blob = await compressImage(file);
    const path = `${orgId}/${id}/${kind}-${Date.now()}.${extFor(blob)}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: blob.type, upsert: false });
    if (error) throw new Error(`PHOTO:${error.message}`);
    return path;
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    if (!f.name.trim()) return setErr(t('cx.nc.needName'));
    if ((ciFront || ciBack || gPhoto) && !consent) return setErr(t('cust.needConsent'));
    if (!online) return setErr(t('cx.nc.needSignal'));
    setBusy(true);
    let id: string;
    try {
      id = await rpc<string>('collector_save_customer', {
        p_route: routeId, p_name: f.name, p_phone: f.phone || null, p_address: f.address || null, p_tax_id: f.ci || null,
        p_notes: null, p_lat: gps?.lat ?? null, p_lng: gps?.lng ?? null,
        p_g_name: f.gName || null, p_g_phone: f.gPhone || null, p_g_address: f.gAddress || null,
        p_g_lat: gGps?.lat ?? null, p_g_lng: gGps?.lng ?? null,
      });
    } catch (ex) {
      const m = (ex as Error).message;
      setErr(m.includes('LOAN_NO_PERMISSION') ? t('loan.e.perm') : m.includes('LOAN_MAX_CUSTOMERS') ? t('loan.e.maxCustomers')
        : /fetch|network|Failed/i.test(m) ? t('loan.e.offline') : t('err.generic'));
      setBusy(false);
      return;
    }
    // El cliente ya está guardado; si alguna foto falla se avisa y se puede repetir desde su ficha
    let photosOk = true;
    try {
      if (ciFront || ciBack || photo || gPhoto) {
        const [a, b, c, d] = await Promise.all([
          ciFront ? upload(id, ciFront, 'doc') : null,
          ciBack ? upload(id, ciBack, 'docback') : null,
          photo ? upload(id, photo, 'photo') : null,
          gPhoto ? upload(id, gPhoto, 'gphoto') : null,
        ]);
        await rpc('collector_set_customer_files', { p_customer: id, p_doc_front: a, p_doc_back: b, p_photo: c, p_g_photo: d, p_consent: consent });
      }
    } catch (ex) {
      photosOk = false;
      const m = (ex as Error).message;
      setErr(m.startsWith('PHOTO') || m.includes('PHOTO_') ? t(photoErrorKey(m)) : t('err.generic'));
    }
    setBusy(false);
    setDone({ name: f.name.trim(), photosOk });
    await onSaved(id);
  };

  if (done) {
    return (
      <Card className="space-y-3 text-center">
        <p className="text-3xl">{done.photosOk ? '✅' : '⚠️'}</p>
        <h2 className="text-lg font-bold">{t('cx.nc.saved')}: {done.name}</h2>
        {!done.photosOk && <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">{err || t('cx.nc.partial')}</p>}
        <div className="grid gap-2">
          {canLoan && <button type="button" onClick={onLoan} className={`${ui.btnPrimary} py-3`}>💸 {t('cx.newLoan')}</button>}
        </div>
      </Card>
    );
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <h2 className="text-lg font-bold">➕ {t('cx.nc.title')}</h2>
      {!online && <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">{t('cx.nc.needSignal')}</p>}

      <Card className="space-y-3">
        <div><label className={ui.label}>{t('cx.nc.name')}</label><input required value={f.name} onChange={(e) => set('name', e.target.value)} className={ui.input} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={ui.label}>{t('cx.nc.ci')}</label><input value={f.ci} onChange={(e) => set('ci', e.target.value)} className={ui.input} /></div>
          <div><label className={ui.label}>{t('cx.nc.phone')}</label><input type="tel" inputMode="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} className={ui.input} /></div>
        </div>
        <div><label className={ui.label}>{t('cx.nc.address')}</label><input value={f.address} onChange={(e) => set('address', e.target.value)} className={ui.input} /></div>
        <GpsButton value={gps} onChange={setGps} label={t('cx.nc.gpsBtn')} />
      </Card>

      <Card className="space-y-3">
        <p className="font-bold">🪪 {t('cx.nc.docs')}</p>
        <div><label className={ui.label}>{t('cx.nc.ciFront')}</label><PhotoPicker value={ciFront} onChange={setCiFront} disabled={busy} /></div>
        <div><label className={ui.label}>{t('cx.nc.ciBack')}</label><PhotoPicker value={ciBack} onChange={setCiBack} disabled={busy} /></div>
        <div><label className={ui.label}>{t('cx.nc.photo')}</label><PhotoPicker value={photo} onChange={setPhoto} facing="user" disabled={busy} /></div>
      </Card>

      <Card className="space-y-3">
        <p className="font-bold">🤝 {t('cx.nc.guarantor')}</p>
        <div><label className={ui.label}>{t('cx.nc.gName')}</label><input value={f.gName} onChange={(e) => set('gName', e.target.value)} className={ui.input} /></div>
        <div><label className={ui.label}>{t('cx.nc.gPhone')}</label><input type="tel" inputMode="tel" value={f.gPhone} onChange={(e) => set('gPhone', e.target.value)} className={ui.input} /></div>
        <div><label className={ui.label}>{t('cx.nc.gAddress')}</label><input value={f.gAddress} onChange={(e) => set('gAddress', e.target.value)} className={ui.input} /></div>
        <GpsButton value={gGps} onChange={setGGps} label={t('cx.nc.gGpsBtn')} />
        <div><label className={ui.label}>{t('cx.nc.gPhoto')}</label><PhotoPicker value={gPhoto} onChange={setGPhoto} facing="user" disabled={busy} /></div>
      </Card>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4" />
        <span>{t('cx.nc.consent')}</span>
      </label>

      {err && <p className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">{err}</p>}
      <button type="submit" disabled={busy || !online} className={`${ui.btnPrimary} w-full py-3`}>{busy ? t('common.wait') : `💾 ${t('prod.save')}`}</button>
    </form>
  );
}
