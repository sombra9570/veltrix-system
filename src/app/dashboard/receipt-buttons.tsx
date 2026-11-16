'use client';
import { useState } from 'react';
import { rpc } from '../../lib/supabase';
import { ui } from '../site-header';
import { useT } from '../i18n';
import { printReceipt, receiptText, type Receipt } from './receipt';

/** 🖨️ Imprimir y 💬 Enviar por WhatsApp el comprobante de una venta */
export function ReceiptButtons({ orderId }: { orderId: string }) {
  const { t, lang } = useT();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const say = (s: string) => { setNote(s); setTimeout(() => setNote(null), 4000); };

  const run = async (kind: 'print' | 'wa') => {
    setBusy(true);
    try {
      const r = await rpc<Receipt>('receipt_data', { p_order: orderId });
      if (kind === 'print') { printReceipt(r, t, lang); return; }
      const text = receiptText(r, t, lang);
      const w = window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
      if (!w) { await navigator.clipboard?.writeText(text); say(t('rc.copied')); }
    } catch { say(t('rc.error')); } finally { setBusy(false); }
  };

  return (
    <span className="inline-flex items-center gap-1">
      <button type="button" disabled={busy} onClick={() => run('print')} aria-label={t('rc.print')} title={t('rc.print')} className={`${ui.btnGhost} !px-2 !py-1 text-xs`}>🖨️</button>
      <button type="button" disabled={busy} onClick={() => run('wa')} aria-label={t('rc.whatsapp')} title={t('rc.whatsapp')} className={`${ui.btnGhost} !px-2 !py-1 text-xs`}>💬</button>
      {note && <span role="status" className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">{note}</span>}
    </span>
  );
}
