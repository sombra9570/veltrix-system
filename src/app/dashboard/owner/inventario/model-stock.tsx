'use client';
import { useMemo, useState } from 'react';
import { rpc } from '../../../../lib/supabase';
import { ui } from '../../../site-header';
import { useT } from '../../../i18n';
import { friendlyError } from '../owner-context';
import { PhotoThumb, ProductPhotoEditor } from './product-photo';

export type VariantItem = { id: string; name: string; qty: number; min: number; model?: string | null; size?: string | null; color?: string | null; photo_path?: string | null; org_id?: string; company_id?: string };

const SIZE_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', 'XXXL', '3XL', 'UNICA', 'ÚNICA', 'U'];
const sizeKey = (s: string): [number, number, string] => {
  const u = s.toUpperCase();
  const i = SIZE_ORDER.indexOf(u);
  if (i >= 0) return [0, i, u];
  const n = parseFloat(u.replace(',', '.'));
  return Number.isNaN(n) ? [2, 0, u] : [1, n, u];
};
const sortSizes = (a: string, b: string) => { const x = sizeKey(a), y = sizeKey(b); return x[0] - y[0] || x[1] - y[1] || x[2].localeCompare(y[2]); };

/** Un modelo con su matriz talla × color: cantidad por cada combinación y totales. La foto es opcional y vale para todo el modelo. */
export function ModelStock({ model, items, branchId, canReceive, canPhoto, onChanged, flash }: {
  model: string; items: VariantItem[]; branchId: string; canReceive: boolean; canPhoto?: boolean;
  onChanged: () => void | Promise<void>; flash: (ok: boolean, text: string) => void;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [add, setAdd] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const { sizes, colors, cell, total } = useMemo(() => {
    const sizes = Array.from(new Set<string>(items.map((i) => i.size ?? ''))).sort(sortSizes);
    const colors = Array.from(new Set<string>(items.map((i) => i.color ?? ''))).sort((a, b) => a.localeCompare(b));
    const cell = new Map(items.map((i) => [`${i.size ?? ''}|${i.color ?? ''}`, i]));
    return { sizes, colors, cell, total: items.reduce((a, i) => a + Number(i.qty), 0) };
  }, [items]);
  const lowCount = items.filter((i) => Number(i.qty) <= 0).length;
  const sizeLabel = (s: string) => s || t('mod.noColor');
  const colorLabel = (c: string) => c || t('mod.noColor');

  const del = async (it: VariantItem) => {
    if (!window.confirm(t('inv.deleteZeroConfirm', { name: it.name }))) return;
    setBusy(true);
    try { await rpc('delete_product', { p_product: it.id }); await onChanged(); }
    catch (e) { flash(false, friendlyError((e as Error).message, t)); }
    finally { setBusy(false); }
  };

  const save = async () => {
    const lines = Object.entries(add).map(([id, v]) => ({ product_id: id, qty: parseInt(String(v), 10), cost: 0 })).filter((l) => !Number.isNaN(l.qty) && l.qty > 0);
    if (lines.length === 0) return;
    setBusy(true);
    try {
      await rpc('inv_receive', { p_branch: branchId, p_supplier: null, p_items: lines, p_doc_ref: null, p_due_days: null });
      flash(true, t('mod.stockSaved', { n: lines.reduce((a, l) => a + l.qty, 0) }));
      setAdd({}); setAdding(false);
      await onChanged();
    } catch (e) { flash(false, friendlyError((e as Error).message, t)); }
    finally { setBusy(false); }
  };

  return (
    <li>
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 p-4 text-start hover:bg-slate-50 cursor-pointer dark:hover:bg-slate-800/50">
        <PhotoThumb path={items[0]?.photo_path} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">👕 {model}</p>
          <p className={`text-xs ${ui.muted}`}>{t('mod.variants', { n: items.length })}{lowCount > 0 ? ` · ${lowCount} ✗` : ''}</p>
        </div>
        <p className="shrink-0 text-lg font-extrabold">{t('mod.pieces', { n: total })}</p>
      </button>
      {open && (
        <div className="space-y-3 border-t border-slate-200 p-3 dark:border-slate-800">
          {canPhoto && items[0] && <ProductPhotoEditor item={items[0]} onChanged={onChanged} flash={flash} />}
          <div className="overflow-x-auto">
            <table className="w-full text-center text-sm">
              <thead>
                <tr className={ui.muted}>
                  <th className="p-2 text-start font-semibold">{t('mod.color')} \ {t('mod.size')}</th>
                  {sizes.map((s) => <th key={s} className="p-2 font-semibold">{sizeLabel(s)}</th>)}
                  <th className="p-2 font-semibold">{t('mod.totalLabel')}</th>
                </tr>
              </thead>
              <tbody>
                {colors.map((c) => (
                  <tr key={c} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="p-2 text-start font-semibold">{colorLabel(c)}</td>
                    {sizes.map((s) => {
                      const it = cell.get(`${s}|${c}`);
                      if (!it) return <td key={s} className={`p-2 ${ui.muted}`}>—</td>;
                      const q = Number(it.qty);
                      return (
                        <td key={s} className="p-1">
                          {adding
                            ? <input inputMode="numeric" value={add[it.id] ?? ''} onChange={(e) => setAdd({ ...add, [it.id]: e.target.value.replace(/\D/g, '') })} placeholder={String(q)} className={`${ui.input} !px-1 !py-1 text-center`} />
                            : q <= 0 && canReceive
                              ? <span className="inline-flex items-center gap-1"><span className="font-bold text-red-600 dark:text-red-400">0</span>
                                  <button type="button" disabled={busy} onClick={() => del(it)} aria-label={t('prod.delete')} title={t('prod.delete')} className="cursor-pointer rounded px-1 text-xs hover:bg-red-50 dark:hover:bg-red-500/10">🗑️</button></span>
                              : <span className={q <= 0 ? 'font-bold text-red-600 dark:text-red-400' : q <= Number(it.min) ? 'font-bold text-amber-600 dark:text-amber-400' : 'font-bold'}>{q}</span>}
                        </td>
                      );
                    })}
                    <td className="p-2 font-extrabold">{sizes.reduce((a, s) => a + Number(cell.get(`${s}|${c}`)?.qty ?? 0), 0)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-slate-200 dark:border-slate-700">
                  <td className="p-2 text-start font-extrabold">{t('mod.totalLabel')}</td>
                  {sizes.map((s) => <td key={s} className="p-2 font-extrabold">{colors.reduce((a, c) => a + Number(cell.get(`${s}|${c}`)?.qty ?? 0), 0)}</td>)}
                  <td className="p-2 font-extrabold">{total}</td>
                </tr>
              </tbody>
            </table>
          </div>
          {canReceive && (
            <div className="flex flex-wrap justify-end gap-2">
              {adding ? (
                <>
                  <button type="button" onClick={() => { setAdding(false); setAdd({}); }} className={ui.btnGhost}>{t('card.cancel')}</button>
                  <button type="button" disabled={busy} onClick={save} className={ui.btnPrimary}>{busy ? t('common.wait') : t('mod.saveStock')}</button>
                </>
              ) : <button type="button" onClick={() => setAdding(true)} className={ui.btnGhost}>➕ {t('mod.addStock')}</button>}
            </div>
          )}
          {adding && <p className={`text-xs ${ui.muted}`}>{t('mod.addHint')}</p>}
        </div>
      )}
    </li>
  );
}
