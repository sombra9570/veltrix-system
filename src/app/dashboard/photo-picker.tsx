'use client';
import { useEffect, useState } from 'react';
import { ui } from '../site-header';
import { useT } from '../i18n';

/**
 * Elegir una foto de dos maneras, siempre las dos:
 *  📷 Tomar foto (abre la cámara del celular)  ·  🖼️ Elegir archivo (galería o archivos).
 * Muestra una miniatura para confirmar que la foto quedó cargada, y permite quitarla.
 * La compresión y la subida las hace quien lo usa (compressImage).
 */
export function PhotoPicker({ value, onChange, facing = 'environment', disabled, cameraOnly = false }: {
  value: File | null; onChange: (f: File | null) => void; facing?: 'environment' | 'user'; disabled?: boolean; cameraOnly?: boolean;
}) {
  const { t } = useT();
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!value) { setUrl(null); return; }
    const u = URL.createObjectURL(value);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [value]);

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    e.target.value = ''; // permite volver a elegir la misma foto
    if (f) onChange(f);
  };

  return (
    <div className="space-y-2">
      <div className={`grid ${cameraOnly ? 'grid-cols-1' : 'grid-cols-2'} gap-2`}>
        <label className={`${ui.btnGhost} relative flex cursor-pointer items-center justify-center !px-3 !py-2 text-sm ${disabled ? 'opacity-50' : ''}`}>
          📷 {t('photo.take')}
          <input type="file" accept="image/*" capture={facing} disabled={disabled} onChange={pick} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
        </label>
        {!cameraOnly && <label className={`${ui.btnGhost} relative flex cursor-pointer items-center justify-center !px-3 !py-2 text-sm ${disabled ? 'opacity-50' : ''}`}>
          🖼️ {t('photo.pick')}
          <input type="file" accept="image/*" disabled={disabled} onChange={pick} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
        </label>}
      </div>
      {value && url && (
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 p-2 dark:border-slate-800">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
          <div className="min-w-0 flex-1 text-xs">
            <p className="truncate font-semibold">{value.name}</p>
            <p className={ui.muted}>{(value.size / 1048576).toFixed(1)} MB · {t('photo.willCompress')}</p>
          </div>
          <button type="button" disabled={disabled} onClick={() => onChange(null)} aria-label={t('photo.remove')} className={`${ui.btnGhost} !px-2.5 !py-1.5 text-xs`}>✕</button>
        </div>
      )}
    </div>
  );
}

/** Mensaje claro según el error de compresión o de subida */
export function photoErrorKey(message: string): 'photo.unreadable' | 'photo.tooBig' | 'photo.uploadFailed' {
  if (message.includes('PHOTO_UNREADABLE')) return 'photo.unreadable';
  if (message.includes('PHOTO_TOO_BIG')) return 'photo.tooBig';
  return 'photo.uploadFailed';
}

/**
 * Foto que se sube al elegirla (logo, QR, producto de la tienda): miniatura grande con la foto actual,
 * dos botones (cámara / archivo) y vista previa inmediata mientras se sube.
 */
export function PhotoSlot({ current, fallback, onFile, busy, size = 'h-16 w-16', icon = '📷' }: {
  current: string | null; fallback?: string | null; onFile: (f: File) => void; busy?: boolean; size?: string; icon?: string;
}) {
  const { t } = useT();
  const [local, setLocal] = useState<string | null>(null);
  useEffect(() => () => { if (local) URL.revokeObjectURL(local); }, [local]);
  useEffect(() => { if (current) setLocal(null); }, [current]);
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setLocal(URL.createObjectURL(f));
    onFile(f);
  };
  const shown = local ?? current;
  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      <div className={`relative grid ${size} place-items-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {shown ? <img src={shown} alt="" loading="lazy" decoding="async" onError={(e) => { if (fallback && e.currentTarget.src !== fallback) e.currentTarget.src = fallback; }} className="h-full w-full object-cover" /> : <span className="text-xl">{icon}</span>}
        {busy && <span className="absolute inset-0 grid place-items-center bg-black/40 text-xs font-bold text-white">…</span>}
      </div>
      <div className="flex gap-1">
        <label className="relative grid h-8 w-8 cursor-pointer place-items-center rounded-lg border border-slate-300 text-sm dark:border-slate-700" title={t('photo.take')}>
          📷<input type="file" accept="image/*" capture="environment" disabled={busy} onChange={pick} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
        </label>
        <label className="relative grid h-8 w-8 cursor-pointer place-items-center rounded-lg border border-slate-300 text-sm dark:border-slate-700" title={t('photo.pick')}>
          🖼️<input type="file" accept="image/*" disabled={busy} onChange={pick} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
        </label>
      </div>
    </div>
  );
}
