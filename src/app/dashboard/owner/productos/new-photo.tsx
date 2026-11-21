'use client';
import { useEffect, useState } from 'react';
import { supabase, rpc } from '../../../../lib/supabase';
import { PhotoSlot } from '../../photo-picker';
import { compressImage, extFor, makeThumb, thumbPath } from '../../image';
import { useT } from '../../../i18n';

/** ¿Este usuario puede poner foto a los productos? (si no, el campo ni se muestra) */
export function useCanPhoto(companyId: string) {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    if (!companyId) return;
    let alive = true;
    rpc<boolean>('can_set_product_photo', { p_company: companyId }).then((v) => { if (alive) setOk(!!v); }).catch(() => { if (alive) setOk(false); });
    return () => { alive = false; };
  }, [companyId]);
  return ok;
}

/** Foto opcional al crear un producto: se elige aquí y se sube al guardar, ya comprimida. */
export function NewPhotoField({ onFile }: { onFile: (f: File | null) => void }) {
  const { t } = useT();
  return (
    <div className="flex items-center gap-3 sm:col-span-2">
      <PhotoSlot current={null} onFile={(f) => onFile(f)} />
      <div className="min-w-0">
        <p className="text-sm font-semibold">{t('inv.photo')}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">{t('inv.photoHint')}</p>
      </div>
    </div>
  );
}

/** Comprime (máx. 1200 px, menos de 800 KB) y sube la foto grande y su miniatura. Devuelve la ruta guardada. */
export async function uploadNewPhoto(orgId: string, companyId: string, key: string, file: File) {
  const blob = await compressImage(file, 1200, 0.8);
  const path = `${orgId}/${companyId}/p-${key}-${Date.now()}.${extFor(blob)}`;
  const up = await supabase.storage.from('store-images').upload(path, blob, { contentType: blob.type, cacheControl: '31536000', upsert: false });
  if (up.error) throw new Error(up.error.message);
  try {
    const tb = await makeThumb(file);
    await supabase.storage.from('store-images').upload(thumbPath(path), tb, { contentType: tb.type, cacheControl: '31536000', upsert: false });
  } catch { /* sin miniatura: la lista usa la grande */ }
  return path;
}
