'use client';
import { useState } from 'react';
import { supabase, rpc } from '../../../../lib/supabase';
import { Card } from '../../shell';
import { ui } from '../../../site-header';
import { useT } from '../../../i18n';
import { PhotoSlot } from '../../photo-picker';
import { compressImage, extFor, makeThumb, thumbPath } from '../../image';
import { parseAmount } from '../../format';

const split = (v: string) => v.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);
const PRESETS = ['XS, S, M, L, XL, XXL', '28, 30, 32, 34, 36, 38', '35, 36, 37, 38, 39, 40, 41, 42, 43, 44'];
const BUCKET = 'store-images';

/** Producto nuevo creado desde la tienda misma: foto obligatoria, tallas y colores opcionales, y se publica al guardar. */
export function StoreProductForm({ orgId, companyId, currency, canPublish, onDone, onCancel, onError }: {
  orgId: string; companyId: string; currency: string; canPublish: boolean;
  onDone: (n: number) => void; onCancel: () => void; onError: (msg: string) => void;
}) {
  const { t } = useT();
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [desc, setDesc] = useState('');
  const [sizes, setSizes] = useState('');
  const [colors, setColors] = useState('');
  const [publish, setPublish] = useState(true);
  const [busy, setBusy] = useState(false);
  const count = Math.max(split(sizes).length, 1) * Math.max(split(colors).length, 1);
  const variants = split(sizes).length + split(colors).length > 0;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const p = parseAmount(price);
    if (!file || !name.trim() || Number.isNaN(p) || p < 0) return;
    setBusy(true);
    let path = '';
    try {
      const blob = await compressImage(file, 1200, 0.8);
      path = `${orgId}/${companyId}/p-new-${Date.now()}.${extFor(blob)}`;
      const up = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: blob.type, cacheControl: '31536000', upsert: false });
      if (up.error) throw new Error(up.error.message);
      try {
        const tb = await makeThumb(file);
        await supabase.storage.from(BUCKET).upload(thumbPath(path), tb, { contentType: tb.type, cacheControl: '31536000', upsert: false });
      } catch { /* sin miniatura */ }
      const n = await rpc<number>('store_create_product', {
        p_company: companyId, p_name: name.trim(), p_price: p, p_sizes: split(sizes), p_colors: split(colors),
        p_description: desc.trim() || null, p_photo: path, p_publish: canPublish && publish,
      });
      onDone(n ?? 1);
    } catch (err) {
      if (path) await supabase.storage.from(BUCKET).remove([path, thumbPath(path)]);
      onError((err as Error).message);
    } finally { setBusy(false); }
  };

  return (
    <Card>
      <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <h2 className="font-bold">➕ {t('sp.new')}</h2>
          <p className={`text-xs ${ui.muted}`}>{t('sp.hint')}</p>
        </div>
        <div className="flex items-center gap-3 sm:col-span-2">
          <PhotoSlot current={null} onFile={setFile} busy={busy} size="h-24 w-24" />
          <p className={`text-sm font-semibold ${file ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>{file ? `✓ ${t('sp.photoOk')}` : t('sp.photoNeeded')}</p>
        </div>
        <div>
          <label className={ui.label}>{t('mod.name')}</label>
          <input required value={name} onChange={(e) => setName(e.target.value)} className={ui.input} />
        </div>
        <div>
          <label className={ui.label}>{t('mod.price')} ({currency})</label>
          <input required inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className={ui.input} />
        </div>
        <div className="sm:col-span-2">
          <label className={ui.label}>{t('store.productDesc')}</label>
          <input value={desc} maxLength={300} onChange={(e) => setDesc(e.target.value)} className={ui.input} />
        </div>
        <div>
          <label className={ui.label}>{t('mod.sizes')} ({t('sp.optional')})</label>
          <input value={sizes} onChange={(e) => setSizes(e.target.value)} placeholder="S, M, L, XL" className={ui.input} />
          <div className="mt-1 flex flex-wrap gap-1">
            {PRESETS.map((x, i) => <button key={x} type="button" onClick={() => setSizes(x)} className={`${ui.btnGhost} !px-2 !py-0.5 text-xs`}>{['S – XXL', '28 – 38', '35 – 44'][i]}</button>)}
          </div>
        </div>
        <div>
          <label className={ui.label}>{t('mod.colors')} ({t('sp.optional')})</label>
          <input value={colors} onChange={(e) => setColors(e.target.value)} placeholder="Negro, Blanco, Azul" className={ui.input} />
        </div>
        {canPublish && (
          <label className="flex items-center gap-2 text-sm font-semibold sm:col-span-2">
            <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} className="h-5 w-5" />{t('sp.publishNow')}
          </label>
        )}
        <div className="flex items-center justify-end gap-2 sm:col-span-2">
          {variants && <span className={`me-auto text-xs ${ui.muted}`}>{t('mod.variants', { n: count })}</span>}
          <button type="button" onClick={onCancel} className={ui.btnGhost}>{t('card.cancel')}</button>
          <button type="submit" disabled={busy || !file} className={ui.btnPrimary}>{busy ? t('common.wait') : t('sp.create')}</button>
        </div>
      </form>
    </Card>
  );
}
