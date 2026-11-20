'use client';
import { useState } from 'react';
import { rpc } from '../../../../lib/supabase';
import { Card } from '../../shell';
import { ui } from '../../../site-header';
import { useT } from '../../../i18n';
import { parseAmount } from '../../format';
import { friendlyError } from '../owner-context';

const PRESETS = ['XS, S, M, L, XL, XXL', '28, 30, 32, 34, 36, 38', '35, 36, 37, 38, 39, 40, 41, 42, 43, 44', 'Única'];
const split = (v: string) => v.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);

/** Modelo con tallas y colores: cada combinación queda como un producto con su propio stock. Sin fotos. */
export function ModelForm({ companyId, currency, onDone, onCancel }: {
  companyId: string; currency: string; onDone: (text: string) => void; onCancel: () => void;
}) {
  const { t } = useT();
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [sizes, setSizes] = useState('');
  const [colors, setColors] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const sz = split(sizes); const cl = split(colors);
  const count = Math.max(sz.length, 1) * Math.max(cl.length, 1);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const p = parseAmount(price);
    if (!name.trim() || Number.isNaN(p) || p < 0) return;
    setBusy(true); setErr('');
    try {
      const n = await rpc<number>('save_product_model', { p_company: companyId, p_model: name.trim(), p_price: p, p_sizes: sz, p_colors: cl, p_unit: 'unid' });
      onDone(t('mod.created', { n: n ?? 0 }));
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
