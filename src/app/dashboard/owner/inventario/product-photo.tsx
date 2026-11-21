'use client';
import { useState } from 'react';
import { supabase, rpc } from '../../../../lib/supabase';
import { PhotoSlot, photoErrorKey } from '../../photo-picker';
import { compressImage, extFor, storeImageUrl, storeThumbUrl, makeThumb, thumbPath } from '../../image';
import { useT } from '../../../i18n';
import { friendlyError } from '../owner-context';

export type PhotoInfo = { id: string; photo_path?: string | null; org_id?: string; company_id?: string };
const BUCKET = 'store-images';

/** Miniatura chica para las listas (no hace nada si el producto no tiene foto). */
export function PhotoThumb({ path, size = 'h-10 w-10' }: { path?: string | null; size?: string }) {
  if (!path) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={storeThumbUrl(path) ?? ''} alt="" loading="lazy" decoding="async"
      onError={(e) => { const f = storeImageUrl(path); if (f && e.currentTarget.src !== f) e.currentTarget.src = f; }}
      className={`${size} shrink-0 rounded-lg object-cover`} />
  );
}

/** Foto opcional del producto en el inventario: poner o cambiar. Si el producto es un modelo, la foto vale para todas sus tallas y colores. */
export function ProductPhotoEditor({ item, onChanged, flash }: {
  item: PhotoInfo; onChanged: () => void | Promise<void>; flash: (ok: boolean, text: string) => void;
}) {
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const set = async (file: File) => {
    if (!item.org_id || !item.company_id) return;
    setBusy(true);
    try {
      const blob = await compressImage(file, 1200, 0.8);
      const path = `${item.org_id}/${item.company_id}/p-${item.id}-${Date.now()}.${extFor(blob)}`;
      const up = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: blob.type, cacheControl: '31536000', upsert: false });
      if (up.error) throw new Error(up.error.message);
      try {
        const tb = await makeThumb(file);
        await supabase.storage.from(BUCKET).upload(thumbPath(path), tb, { contentType: tb.type, cacheControl: '31536000', upsert: false });
      } catch { /* sin miniatura: la lista usa la foto grande */ }
      await rpc('set_product_photo', { p_product: item.id, p_path: path });
      if (item.photo_path) await supabase.storage.from(BUCKET).remove([item.photo_path, thumbPath(item.photo_path)]);
      await onChanged();
    } catch (e) {
      const m = (e as Error).message;
      flash(false, /PERM_DENIED/.test(m) ? friendlyError(m, t) : t(photoErrorKey(m)));
    } finally { setBusy(false); }
  };
  return (
    <div className="flex items-center gap-3">
      <PhotoSlot current={storeThumbUrl(item.photo_path)} fallback={storeImageUrl(item.photo_path)} onFile={set} busy={busy} />
      <div className="min-w-0">
        <p className="text-sm font-semibold">{t('inv.photo')}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">{t('inv.photoHint')}</p>
      </div>
    </div>
  );
}
