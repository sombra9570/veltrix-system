'use client';
import { useState } from 'react';
import { rpc } from '../../../../lib/supabase';
import { Card } from '../../shell';
import { ui } from '../../../site-header';
import { useT } from '../../../i18n';
import { parseAmount } from '../../format';
import { friendlyError } from '../owner-context';
import { NewPhotoField, uploadNewPhoto } from './new-photo';
import { photoErrorKey } from '../../photo-picker';

const PRESETS = ['XS, S, M, L, XL, XXL', '28, 30, 32, 34, 36, 38', '35, 36, 37, 38, 39, 40, 41, 42, 43, 44', 'Única'];
const split = (v: string) => v.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);

/** Modelo con tallas y colores: cada combinación queda como un producto con su propio stock. La foto es opcional y vale para todo el modelo. */
export function ModelForm({ companyId, orgId, canPhoto, currency, onDone, onCancel }: {
  companyId: string; orgId: string; canPhoto?: boolean; currency: string; onDone: (text: string) => void; onCancel: () => void;
}) {
  const { t } = useT();
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [sizes, setSizes] = useState('');
  const [colors, setColors] = useState('');
  const [qty, setQty] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [err, setErr] = useState('');
  const sz = split(sizes); const cl = split(colors);
  const count = Math.max(sz.length, 1) * Math.max(cl.length, 1);
  const szs = sz.length ? sz : [''];
  const cls = cl.length ? cl : [''];
  const total = szs.reduce((a, z) => a + cls.reduce((b, c) => b + (parseInt(qty[`${z}|${c}`] ?? '', 10) || 0), 0), 0);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const p = parseAmount(price);
    if (!name.trim() || Number.isNaN(p) || p < 0) return;
    setBusy(true); setErr('');
    try {
      const n = await rpc<number>('save_product_model', { p_company: companyId, p_model: name.trim(), p_price: p, p_sizes: sz, p_colors: cl, p_unit: 'unid', p_stock: Object.fromEntries(Object.entries(qty).filter(([, v]) => parseInt(String(v), 10) > 0).map(([k, v]) => [k, parseInt(String(v), 10)])) });
      let extra = '';
      if (photo) {
        try { await rpc('set_model_photo', { p_company: companyId, p_model: name.trim(), p_path: await uploadNewPhoto(orgId, companyId, name.trim().replace(/[^a-z0-9]+/gi, '-').slice(0, 30) || 'm', photo) }); }
        catch (pe) { extra = ` · ${t(photoErrorKey((pe as Error).message))}`; }
      }
      onDone(t('mod.created', { n: n ?? 0 }) + extra);
    } catch (e2) { setErr(friendlyError((e2 as Error).message, t)); }
    finally { setBusy(false); }
  };

  return (
    <Card>
      <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <h2 className="font-bold">🏷️ {t('mod.new')}</h2>
          <p className={`text-xs ${ui.muted}`}>{t('mod.hint')}</p>
        </div>
        <div>
          <label className={ui.label}>{t('mod.name')}</label>
          <input required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Polo, Jean Slim, Zapatilla Runner…" className={ui.input} />
        </div>
        <div>
          <label className={ui.label}>{t('mod.price')} ({currency})</label>
          <input required inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className={ui.input} />
        </div>
        <div>
          <label className={ui.label}>{t('mod.sizes')}</label>
          <input value={sizes} onChange={(e) => setSizes(e.target.value)} placeholder="S, M, L, XL" className={ui.input} />
          <div className="mt-1 flex flex-wrap gap-1">
            {PRESETS.map((x) => <button key={x} type="button" onClick={() => setSizes(x)} className={`${ui.btnGhost} !px-2 !py-0.5 text-xs`}>{x.length > 22 ? '35 – 44' : x.length > 14 ? '28 – 38' : x}</button>)}
          </div>
          <p className={`mt-1 text-xs ${ui.muted}`}>{t('mod.sizesHint')}</p>
        </div>
        <div>
          <label className={ui.label}>{t('mod.colors')}</label>
          <input value={colors} onChange={(e) => setColors(e.target.value)} placeholder="Negro, Blanco, Azul" className={ui.input} />
          <p className={`mt-1 text-xs ${ui.muted}`}>{t('mod.colorsHint')}</p>
        </div>

        {canPhoto && <NewPhotoField onFile={setPhoto} />}
        <div className="sm:col-span-2">
          <p className={ui.label}>{t('mod.stockByVariant')}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-center text-sm">
              <thead>
                <tr className={ui.muted}>
                  <th className="p-1.5 text-start font-semibold">{t('mod.color')} \ {t('mod.size')}</th>
                  {szs.map((z) => <th key={z} className="p-1.5 font-semibold">{z || t('mod.noColor')}</th>)}
                </tr>
              </thead>
              <tbody>
                {cls.map((c) => (
                  <tr key={c} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="p-1.5 text-start font-semibold">{c || t('mod.noColor')}</td>
                    {szs.map((z) => (
                      <td key={z} className="p-1">
                        <input inputMode="numeric" value={qty[`${z}|${c}`] ?? ''} placeholder="0"
                          onChange={(e) => setQty({ ...qty, [`${z}|${c}`]: e.target.value.replace(/\D/g, '') })}
                          className={`${ui.input} !min-w-12 !px-1 !py-1 text-center`} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-1 text-end text-sm font-extrabold">{t('mod.totalLabel')}: {total}</p>
        </div>
        {err && <p className="text-sm font-semibold text-red-600 sm:col-span-2 dark:text-red-400">{err}</p>}
        <div className="flex items-center justify-end gap-2 sm:col-span-2">
          <span className={`me-auto text-xs ${ui.muted}`}>{t('mod.variants', { n: count })}</span>
          <button type="button" onClick={onCancel} className={ui.btnGhost}>{t('card.cancel')}</button>
          <button type="submit" disabled={busy} className={ui.btnPrimary}>{busy ? t('common.wait') : t('mod.create')}</button>
        </div>
      </form>
    </Card>
  );
}
