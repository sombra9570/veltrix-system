'use client';
import { useCallback, useEffect, useState } from 'react';
import { supabase, rpc } from '../../../../lib/supabase';
import { Card } from '../../shell';
import { ui } from '../../../site-header';
import { useT } from '../../../i18n';
import type { DictKey } from '../../../i18n/es';
import { compressImage } from '../../image';
import { parseAmount } from '../../format';

export type Evidence = { condition: string; note: string; photo: File | null };
export const emptyEvidence = (): Evidence => ({ condition: 'ok', note: '', photo: null });
const CONDITIONS = ['ok', 'damaged', 'incomplete', 'expired', 'returned'] as const;
const REASONS = ['waste', 'internal', 'supplier_return', 'damaged', 'expired', 'other'] as const;
const BUCKET = 'inventory-files';

/** Sube la foto de respaldo (comprimida) a <org>/<sucursal>/… y deja la constancia. */
export async function saveEvidence(branchId: string, kind: 'in' | 'out', ev: Evidence, summary: string) {
  let path: string | null = null;
  if (ev.photo) {
    const { data: b } = await supabase.from('branches').select('org_id').eq('id', branchId).single();
    const blob = await compressImage(ev.photo);
    path = `${b?.org_id}/${branchId}/${kind}-${Date.now()}.${blob.type === 'image/webp' ? 'webp' : 'jpg'}`;
    const up = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: blob.type });
    if (up.error) throw new Error(up.error.message);
  }
  await rpc('inv_evidence_add', { p_branch: branchId, p_kind: kind, p_condition: ev.condition, p_summary: summary, p_note: ev.note || null, p_photo: path });
}

/** Estado de lo recibido / entregado, nota y foto opcional */
export function EvidenceFields({ value, onChange }: { value: Evidence; onChange: (e: Evidence) => void }) {
  const { t } = useT();
  return (
    <div className="grid gap-3 rounded-xl border border-slate-200 p-3 sm:grid-cols-3 dark:border-slate-800">
      <div>
        <label className={ui.label}>{t('ev.condition')}</label>
        <select className={ui.input} value={value.condition} onChange={(e) => onChange({ ...value, condition: e.target.value })}>
          {CONDITIONS.map((c) => <option key={c} value={c}>{t(`ev.c.${c}` as DictKey)}</option>)}
        </select>
      </div>
      <div>
        <label className={ui.label}>{t('ev.note')}</label>
        <input className={ui.input} maxLength={500} value={value.note} onChange={(e) => onChange({ ...value, note: e.target.value })} />
      </div>
      <div>
        <label className={ui.label}>📷 {t('ev.photo')}</label>
        <input type="file" accept="image/*" capture="environment" className={`${ui.input} cursor-pointer`}
          onChange={(e) => onChange({ ...value, photo: e.target.files?.[0] ?? null })} />
      </div>
    </div>
  );
}

/** Salida de mercadería con motivo, estado y foto */
export function OutForm({ branchId, items, onDone, flash }: {
  branchId: string; items: { id: string; name: string; qty: number; unit: string }[];
  onDone: () => void; flash: (ok: boolean, text: string) => void;
}) {
  const { t } = useT();
  const [product, setProduct] = useState('');
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState<string>('waste');
  const [ev, setEv] = useState<Evidence>(emptyEvidence());
  const [busy, setBusy] = useState(false);
  const sel = items.find((i) => i.id === product);

  const save = async () => {
    const q = parseAmount(qty);
    if (!sel || !q || q <= 0) return flash(false, t('cash.invalidAmount'));
    setBusy(true);
    try {
      const label = t(`ev.r.${reason}` as DictKey);
      await rpc('inv_out', { p_branch: branchId, p_product: sel.id, p_qty: q, p_reason: ev.note ? `${label}: ${ev.note}` : label });
      await saveEvidence(branchId, 'out', ev, `${q} ${sel.unit} · ${sel.name} · ${label}`).catch(() => undefined);
      setProduct(''); setQty(''); setEv(emptyEvidence());
      flash(true, t('ev.outSaved'));
      onDone();
    } catch (e) { flash(false, (e as Error).message.includes('suficiente') ? t('ev.noStock') : t('err.generic')); }
    finally { setBusy(false); }
  };

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="font-bold">📤 {t('ev.outTitle')}</h2>
        <p className={`text-xs ${ui.muted}`}>{t('ev.outHint')}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label className={ui.label}>{t('inv.product')}</label>
          <select className={ui.input} value={product} onChange={(e) => setProduct(e.target.value)}>
            <option value="">—</option>
            {items.filter((i) => Number(i.qty) > 0).map((i) => <option key={i.id} value={i.id}>{i.name} ({Number(i.qty)} {i.unit})</option>)}
          </select>
        </div>
        <div>
          <label className={ui.label}>{t('inv.qty')}</label>
          <input className={ui.input} inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
        </div>
        <div className="sm:col-span-3">
          <label className={ui.label}>{t('ev.reason')}</label>
          <select className={ui.input} value={reason} onChange={(e) => setReason(e.target.value)}>
            {REASONS.map((r) => <option key={r} value={r}>{t(`ev.r.${r}` as DictKey)}</option>)}
          </select>
        </div>
      </div>
      <EvidenceFields value={ev} onChange={setEv} />
      <button type="button" disabled={busy || !product} onClick={save} className={`${ui.btnPrimary} w-full sm:w-auto`}>
        {busy ? t('common.wait') : t('ev.saveOut')}
      </button>
    </Card>
  );
}

type Row = { id: string; at: string; kind: string; condition: string; summary: string | null; note: string | null; photo: string | null; by: string | null };

/** Historial de constancias de entradas y salidas, con su foto */
export function EvidenceLog({ branchId }: { branchId: string }) {
  const { t, lang } = useT();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const r = await rpc<Row[]>('inv_evidence_list', { p_branch: branchId }) ?? [];
      setRows(r);
      const paths = r.filter((x) => x.photo).map((x) => x.photo!) ;
      if (paths.length) {
        const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600);
        setUrls(Object.fromEntries((data ?? []).filter((d) => d.signedUrl).map((d) => [d.path!, d.signedUrl])));
      }
    } catch { setRows([]); }
  }, [branchId]);
  useEffect(() => { load(); }, [load]);

  if (!rows) return <Card><p className={`text-sm ${ui.muted}`}>…</p></Card>;
  return (
    <Card className="space-y-3">
      <h2 className="font-bold">🧾 {t('ev.logTitle')}</h2>
      {rows.length === 0 ? <p className={`text-sm ${ui.muted}`}>{t('ev.logEmpty')}</p> : (
        <ul className="divide-y divide-slate-200 dark:divide-slate-800">
          {rows.map((r) => (
            <li key={r.id} className="flex items-start gap-3 py-2.5 text-sm">
              {r.photo && urls[r.photo]
                ? <a href={urls[r.photo]} target="_blank" rel="noopener noreferrer" className="shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={urls[r.photo]} alt="" className="h-14 w-14 rounded-lg object-cover" />
                  </a>
                : <span className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-slate-100 text-xl dark:bg-slate-800">{r.kind === 'in' ? '📥' : '📤'}</span>}
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{r.kind === 'in' ? t('ev.in') : t('ev.out')} · <span className={r.condition === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>{t(`ev.c.${r.condition}` as DictKey)}</span></p>
                {r.summary && <p className="truncate">{r.summary}</p>}
                {r.note && <p className={`text-xs ${ui.muted}`}>📝 {r.note}</p>}
                <p className={`text-xs ${ui.muted}`}>{new Date(r.at).toLocaleString(lang, { dateStyle: 'short', timeStyle: 'short' })}{r.by ? ` · ${r.by}` : ''}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
