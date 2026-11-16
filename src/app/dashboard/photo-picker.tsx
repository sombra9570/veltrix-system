'use client';
import { useEffect, useRef, useState } from 'react';
import { ui } from '../site-header';
import { useT } from '../i18n';

/**
 * Elegir una foto de dos maneras, siempre las dos:
 *  📷 Tomar foto (abre la cámara del celular)  ·  🖼️ Elegir archivo (galería o archivos).
 * Muestra una miniatura para confirmar que la foto quedó cargada, y permite quitarla.
 * La compresión y la subida las hace quien lo usa (compressImage).
 */
export function PhotoPicker({ value, onChange, facing = 'environment', disabled }: {
  value: File | null; onChange: (f: File | null) => void; facing?: 'environment' | 'user'; disabled?: boolean;
}) {
  const { t } = useT();
  const camera = useRef<HTMLInputElement>(null);
  const files = useRef<HTMLInputElement>(null);
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
      <input ref={camera} type="file" accept="image/*" capture={facing} className="hidden" onChange={pick} />
      <input ref={files} type="file" accept="image/*" className="hidden" onChange={pick} />
      <div className="grid grid-cols-2 gap-2">
        <button type="button" disabled={disabled} onClick={() => camera.current?.click()} className={`${ui.btnGhost} !px-3 !py-2 text-sm`}>📷 {t('photo.take')}</button>
        <button type="button" disabled={disabled} onClick={() => files.current?.click()} className={`${ui.btnGhost} !px-3 !py-2 text-sm`}>🖼️ {t('photo.pick')}</button>
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
