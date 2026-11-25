'use client';
import { useCallback, useEffect, useState } from 'react';
import { rpc } from '../../../../lib/supabase';
import { Card } from '../../shell';
import { ui } from '../../../site-header';
import { useT } from '../../../i18n';

type State = { contracted: number; collectors_used: number; supervisors_allowed: number; supervisors_used: number; price_bs: number; collector_bs: number; pending_extra: number | null };

/** Plan de cobranza en calle: cobradores contratados, monto mensual y solicitud de cobradores adicionales.
 *  Solo se muestra en las empresas con este plan. */
export function StreetPlan({ orgId, onPrice }: { orgId: string; onPrice?: (bs: number | null) => void }) {
  const { t, lang } = useT();
  const [s, setS] = useState<State | null>(null);
  const [qty, setQty] = useState('1');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try { const r = await rpc<State | null>('my_street_state', { p_org: orgId }); setS(r); onPrice?.(r ? Number(r.price_bs) : null); } catch { setS(null); onPrice?.(null); }
  }, [orgId, onPrice]);
  useEffect(() => { load(); }, [load]);

  if (!s) return null;
  const n = (v: number) => Number(v).toLocaleString(lang, { maximumFractionDigits: 2 });
  const send = async () => {
    const q = Math.floor(Number(qty));
    if (!q || q < 1) return;
    setBusy(true); setMsg(null);
    try {
      await rpc('street_request_collectors', { p_org: orgId, p_extra: q });
      setMsg({ ok: true, text: t('street.mine.sent') });
      await load();
    } catch { setMsg({ ok: false, text: t('street.mine.error') }); }
    setBusy(false);
  };

  return (
    <Card className="space-y-3">
      <h2 className="text-lg font-extrabold">🛵 {t('street.mine.title')}</h2>
      <ul className="space-y-1 text-sm font-semibold">
        <li>{t('street.mine.collectors', { n: s.contracted, used: s.collectors_used })}</li>
        <li>{t('street.mine.supervisors', { n: s.supervisors_allowed, used: s.supervisors_used })}</li>
        <li>{t('street.mine.price', { price: n(s.price_bs) })}</li>
      </ul>
      {s.pending_extra ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">{t('street.mine.pending', { n: s.pending_extra })}</p>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <label className="block">
            <span className={ui.label}>{t('street.mine.add', { price: n(s.collector_bs) })}</span>
            <input className={`${ui.input} w-28`} inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ''))} aria-label={t('street.mine.qty')} />
          </label>
          <button type="button" disabled={busy} onClick={send} className={ui.btnPrimary}>{busy ? '…' : t('street.mine.send')}</button>
        </div>
      )}
      {msg && <p className={`text-sm font-semibold ${msg.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{msg.text}</p>}
    </Card>
  );
}
