'use client';
import { useCallback, useEffect, useState } from 'react';
import { supabase, rpc } from '../../../../lib/supabase';
import { Card } from '../../shell';
import { ui } from '../../../site-header';
import { useT } from '../../../i18n';
import type { DictKey } from '../../../i18n/es';
import { compressImage } from '../../image';
import { PhotoPicker } from '../../photo-picker';
import { parseAmount } from '../../format';
import { grossUp } from '../../../../lib/tax';

type Info = { holder?: string; bank?: string; account?: string; currency?: string; note?: string; qr_path?: string };
type Proof = { id: string; at: string; months: number; amount: number; currency: string; reference: string | null; status: 'pending' | 'approved' | 'rejected'; note: string | null };

/** Pago por transferencia o QR bancario: el cliente sube el comprobante y el superadmin lo aprueba.
 *  Si la función aún no existe o no hay datos de transferencia cargados, la sección no se muestra. */
export function TransferPay({ orgId, monthly, currency }: { orgId: string; monthly: number; currency: string }) {
  const { t, lang } = useT();
  const k = (key: string) => t(key as DictKey);
  const [info, setInfo] = useState<Info | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [proofs, setProofs] = useState<Proof[]>([]);
  const [months, setMonths] = useState(1);
  const [amount, setAmount] = useState('');
  const [ref, setRef] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const i = await rpc<Info>('billing_transfer_info');
      setInfo(i);
      if (i?.qr_path) {
        const { data } = await supabase.storage.from('billing-proofs').createSignedUrl(i.qr_path, 3600);
        setQr(data?.signedUrl ?? null);
      }
      setProofs(await rpc<Proof[]>('my_payment_proofs', { p_org: orgId }) ?? []);
    } catch { setInfo(null); }
  }, [orgId]);
  useEffect(() => { load(); }, [load]);

  if (!info || (!info.account && !info.qr_path)) return null;

  const send = async () => {
    const amt = parseAmount(amount);
    if (!file || !amt) { setMsg({ ok: false, text: t('tp.missing') }); return; }
    setBusy(true); setMsg(null);
    try {
      const blob = await compressImage(file);
      const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
      const path = `${orgId}/${Date.now()}.${ext}`;
      const up = await supabase.storage.from('billing-proofs').upload(path, blob, { contentType: blob.type });
      if (up.error) throw up.error;
      await rpc('submit_payment_proof', { p_org: orgId, p_months: months, p_amount: amt, p_currency: info.currency || currency, p_reference: ref || null, p_path: path });
      setMsg({ ok: true, text: t('tp.sent') });
      setFile(null); setRef(''); setAmount('');
      load();
    } catch (e) {
      const m = e instanceof Error ? e.message : '';
      setMsg({ ok: false, text: m.includes('PROOF_TOO_MANY') ? t('tp.tooMany') : m.includes('PHOTO_UNREADABLE') ? t('photo.unreadable') : m.includes('PHOTO_TOO_BIG') ? t('photo.tooBig') : t('tp.error') });
    } finally { setBusy(false); }
  };

  const fmt = (n: number, c: string) => `${c} ${Number(n).toLocaleString(lang, { maximumFractionDigits: 2 })}`;
  const day = (d: string) => new Date(d).toLocaleDateString(lang, { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-lg font-extrabold">🏦 {t('tp.title')}</h2>
        <p className={`text-sm ${ui.muted}`}>{t('tp.subtitle')}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <dl className="space-y-1 text-sm">
          {info.holder && <div><dt className={`inline ${ui.muted}`}>{t('tp.holder')}: </dt><dd className="inline font-semibold">{info.holder}</dd></div>}
          {info.bank && <div><dt className={`inline ${ui.muted}`}>{t('tp.bank')}: </dt><dd className="inline font-semibold">{info.bank}</dd></div>}
          {info.account && <div><dt className={`inline ${ui.muted}`}>{t('tp.account')}: </dt><dd className="inline font-semibold tabular-nums">{info.account}</dd></div>}
          {info.note && <p className={`pt-1 text-xs ${ui.muted}`}>{info.note}</p>}
          <p className="pt-2 text-xs font-semibold">{t('tp.monthly', { amount: fmt(info.currency === 'BOB' ? grossUp(monthly, 'BO') : monthly, 'US$') })}{info.currency === 'BOB' ? ` · ${t('home.taxIncluded')}` : ''}</p>
        </dl>
        {qr && <img src={qr} alt="QR" className="h-40 w-40 rounded-xl border border-slate-200 bg-white object-contain p-1 dark:border-slate-700" />}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block"><span className={ui.label}>{t('tp.months')}</span>
          <select className={ui.input} value={months} onChange={(e) => setMonths(Number(e.target.value))}>
            {[1, 3, 6, 12].map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <label className="block"><span className={ui.label}>{t('tp.amount', { cur: info.currency || currency })}</span>
          <input className={ui.input} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label className="block"><span className={ui.label}>{t('tp.reference')}</span>
          <input className={ui.input} value={ref} maxLength={80} onChange={(e) => setRef(e.target.value)} />
        </label>
        <div className="block sm:col-span-2"><span className={ui.label}>{t('tp.photo')}</span>
          <PhotoPicker value={file} onChange={setFile} />
        </div>
      </div>
      {msg && <p className={`text-sm font-semibold ${msg.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{msg.text}</p>}
      <button type="button" disabled={busy} onClick={send} className={ui.btnPrimary}>{busy ? '…' : `📤 ${t('tp.send')}`}</button>

      {proofs.length > 0 && (
        <ul className="divide-y divide-slate-200 text-sm dark:divide-slate-800">
          {proofs.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 py-2">
              <span>{day(p.at)} · {fmt(p.amount, p.currency)} · {p.months} {t('tp.monthsShort')}{p.note ? ` · ${p.note}` : ''}</span>
              <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-bold ${p.status === 'approved' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' : p.status === 'rejected' ? 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300'}`}>{k(`tp.st.${p.status}`)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
