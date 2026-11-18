'use client';
import { useEffect, useState } from 'react';
import { rpc } from '../../../../lib/supabase';
import { Card } from '../../shell';
import { ui } from '../../../site-header';
import { useT } from '../../../i18n';
import { parseAmount } from '../../format';
import { friendlyError } from '../owner-context';

type Target = { id: string; name: string; company: string };
type StockItem = { id: string; name: string; unit: string; qty: number };
type Line = { product_id: string; qty: string };
const emptyLine = (): Line => ({ product_id: '', qty: '' });

/** Traspaso de mercadería a otra sucursal (varios productos, todo o nada). Usa inv_transfer (migración 053). */
export function TransferForm({ branchId, items, flash, onDone }: {
  branchId: string; items: StockItem[]; flash: (ok: boolean, text: string) => void; onDone: () => void;
}) {
  const { t, lang } = useT();
  const [targets, setTargets] = useState<Target[] | null>(null);
  const [to, setTo] = useState('');
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setTargets(null); setTo('');
    rpc<Target[]>('inv_transfer_targets', { p_branch: branchId })
      .then((r) => { setTargets(r ?? []); if (r?.length === 1) setTo(r[0].id); })
      .catch(() => setTargets([]));
  }, [branchId]);

  const stock = items.filter((i) => Number(i.qty) > 0).sort((a, b) => a.name.localeCompare(b.name));
  const qtyFmt = (n: number) => Number(n).toLocaleString(lang, { maximumFractionDigits: 3 });
  const valid = lines.filter((l) => l.product_id && parseAmount(l.qty) > 0);
  const over = lines.some((l) => {
    const it = stock.find((s) => s.id === l.product_id);
    return it && parseAmount(l.qty) > Number(it.qty);
  });

  const save = async () => {
    if (!to || valid.length === 0 || over) return;
    setBusy(true);
    try {
      await rpc('inv_transfer', {
        p_from_branch: branchId, p_to_branch: to,
        p_items: valid.map((l) => ({ product_id: l.product_id, qty: parseAmount(l.qty) })),
        p_note: note.trim() || null,
      });
      setLines([emptyLine()]); setNote('');
      flash(true, t('tr.saved', { n: valid.length }));
      onDone();
    } catch (e) {
      const m = (e as Error).message;
      flash(false, /insuficiente/i.test(m) ? t('tr.noStock') : m.includes('TRANSFER_TARGET') ? t('tr.badTarget') : friendlyError(m, t));
    } finally { setBusy(false); }
  };

  if (targets === null) return <Card><p className={`text-sm ${ui.muted}`}>{t('common.wait')}</p></Card>;
  if (targets.length === 0) return <Card><p className={`text-sm ${ui.muted}`}>{t('tr.noTargets')}</p></Card>;

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="font-bold">{t('tr.title')}</h2>
        <p className={`text-xs ${ui.muted}`}>{t('tr.hint')}</p>
      </div>
      <div>
        <label className={ui.label}>{t('tr.to')}</label>
        <select value={to} onChange={(e) => setTo(e.target.value)} className={ui.input}>
          <option value="">{t('tr.pickBranch')}</option>
          {targets.map((b) => <option key={b.id} value={b.id}>{b.name} · {b.company}</option>)}
        </select>
      </div>

      {stock.length === 0 ? <p className={`text-sm ${ui.muted}`}>{t('tr.nothing')}</p> : (
        <div className="space-y-2">
          {lines.map((l, k) => {
            const it = stock.find((s) => s.id === l.product_id);
            const tooMuch = it && parseAmount(l.qty) > Number(it.qty);
            return (
              <div key={k} className="grid grid-cols-[1fr_6rem_2.5rem] gap-2">
                <select value={l.product_id} aria-label={t('inv.product')} className={ui.input}
                  onChange={(e) => setLines(lines.map((x, j) => j === k ? { ...x, product_id: e.target.value } : x))}>
                  <option value="">{t('inv.pickProduct')}</option>
                  {stock.map((s) => <option key={s.id} value={s.id}>{s.name} ({qtyFmt(s.qty)} {s.unit})</option>)}
                </select>
                <input inputMode="decimal" value={l.qty} placeholder={t('inv.qty')} aria-label={t('inv.qty')}
                  className={`${ui.input} ${tooMuch ? '!border-red-500' : ''}`}
                  onChange={(e) => setLines(lines.map((x, j) => j === k ? { ...x, qty: e.target.value } : x))} />
                <button type="button" aria-label={t('inv.removeLine')}
                  onClick={() => setLines(lines.length > 1 ? lines.filter((_, j) => j !== k) : [emptyLine()])}
                  className="grid min-h-10 place-items-center rounded-xl border border-slate-300 cursor-pointer dark:border-slate-700">✕</button>
              </div>
            );
          })}
          <button type="button" onClick={() => setLines([...lines, emptyLine()])} className={`${ui.btnGhost} w-full !py-2`}>+ {t('inv.addLine')}</button>
          {over && <p className="text-xs font-semibold text-red-600 dark:text-red-400">{t('tr.noStock')}</p>}
        </div>
      )}

      <div>
        <label className={ui.label}>{t('tr.note')}</label>
        <input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} className={ui.input} />
      </div>
      <button type="button" disabled={busy || !to || valid.length === 0 || over} onClick={save} className={`${ui.btnPrimary} w-full`}>
        {busy ? t('common.wait') : t('tr.send')}
      </button>
    </Card>
  );
}
