'use client';
import { useCallback, useEffect, useState } from 'react';
import { rpc } from '../../lib/supabase';
import { Card } from './shell';
import { ui } from '../site-header';
import { useSync } from './sync';
import { useT } from '../i18n';
import { money } from './format';
import { QrImage } from './qr-image';

type Req = {
  id: string; table: string; at: string; notes: string | null; customer: string | null; pay_pref: 'qr' | 'cash';
  items: { name: string; qty: number; price: number; notes: string | null }[]; total: number;
};

/** Pedidos que los clientes envían desde el QR de su mesa: caja, recepción o administración los acepta o rechaza. */
export function QrRequests({ branchId, currency, onChanged, flash }: {
  branchId: string; currency: string; onChanged: () => Promise<void> | void; flash: (ok: boolean, text: string) => void;
}) {
  const { t, lang } = useT();
  const [list, setList] = useState<Req[]>([]);
  const [busy, setBusy] = useState('');
  const fmt = (n: number) => money(Number(n), currency, lang);

  const load = useCallback(async () => {
    if (!branchId) return;
    try { setList(await rpc<Req[]>('table_requests_list', { p_branch: branchId }) ?? []); } catch { /* sin conexión */ }
  }, [branchId]);
  useEffect(() => { load(); }, [load]);
  useSync(load, 8_000);

  const accept = async (r: Req, pay: 'qr' | 'cash') => {
    setBusy(r.id);
    try {
      await rpc('table_request_resolve', { p_request: r.id, p_accept: true, p_pay: pay, p_reason: null });
      flash(true, t('tq.acceptedOk', { table: r.table }));
      await load(); await onChanged();
    } catch (e) {
      flash(false, /PRODUCT|disponible/i.test((e as Error).message) ? t('tq.errUnavailable') : t('err.generic'));
    }
    setBusy('');
  };
  const reject = async (r: Req) => {
    const reason = window.prompt(t('tq.rejectReason')) ?? null;
    if (reason === null) return;
    setBusy(r.id);
    try {
      await rpc('table_request_resolve', { p_request: r.id, p_accept: false, p_pay: null, p_reason: reason });
      flash(true, t('tq.rejectedOk'));
      await load();
    } catch { flash(false, t('err.generic')); }
    setBusy('');
  };

  if (list.length === 0) return null;
  return (
    <Card className="space-y-3 border-2 !border-amber-400">
      <h2 className="font-bold">📲 {t('tq.pending')} · {list.length}</h2>
      <ul className="space-y-3">
        {list.map((r) => (
          <li key={r.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
            <div className="flex items-start justify-between gap-2">
              <p className="font-extrabold">🪑 {r.table}{r.customer ? <span className="font-normal"> · {r.customer}</span> : null}</p>
              <p className="font-extrabold">{fmt(r.total)}</p>
            </div>
            <ul className="mt-1 text-sm">
              {r.items.map((i, k) => (
                <li key={k}>{i.qty} × {i.name}{i.notes ? <span className={ui.muted}> — {i.notes}</span> : null}</li>
              ))}
            </ul>
            {r.notes && <p className={`mt-1 text-sm ${ui.muted}`}>📝 {r.notes}</p>}
            <p className={`mt-1 text-xs ${ui.muted}`}>{r.pay_pref === 'qr' ? `📲 ${t('tq.prefQr')}` : `💵 ${t('tq.prefCash')}`}</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button type="button" disabled={busy === r.id} onClick={() => accept(r, 'qr')} className={`${ui.btnPrimary} !py-2 text-sm`}>✅ {t('tq.chargeQr')}</button>
              <button type="button" disabled={busy === r.id} onClick={() => accept(r, 'cash')} className={`${ui.btnPrimary} !py-2 text-sm`}>✅ {t('tq.chargeCash')}</button>
            </div>
            <button type="button" disabled={busy === r.id} onClick={() => reject(r)} className={`${ui.btnGhost} mt-2 w-full !py-1.5 text-sm`}>✖ {t('tq.reject')}</button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

type QrTable = { id: string; name: string; token: string; active: boolean };

/** El dueño imprime el QR de cada mesa (o lo renueva si se pierde o se filtra). */
export function TableQrCard({ branchId, flash }: { branchId: string; flash: (ok: boolean, text: string) => void }) {
  const { t } = useT();
  const [tables, setTables] = useState<QrTable[]>([]);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  const load = useCallback(async () => {
    try { setTables(await rpc<QrTable[]>('table_qr_info', { p_branch: branchId, p_regenerate: null }) ?? []); } catch { /* */ }
  }, [branchId]);
  useEffect(() => { load(); }, [load]);

  const renew = async (id: string) => {
    if (!window.confirm(t('tq.qrRenewConfirm'))) return;
    try { setTables(await rpc<QrTable[]>('table_qr_info', { p_branch: branchId, p_regenerate: id }) ?? []); } catch { flash(false, t('err.generic')); }
  };

  return (
    <Card className="space-y-3 lg:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold">📲 {t('tq.qrTitle')}</h2>
        <button type="button" onClick={() => window.print()} className={`${ui.btnGhost} !px-3 !py-1.5 text-xs print:hidden`}>🖨️ {t('tq.qrPrint')}</button>
      </div>
      <p className={`text-xs ${ui.muted} print:hidden`}>{t('tq.qrHint')}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {tables.filter((x) => x.active).map((tb) => (
          <div key={tb.id} className="rounded-xl border border-slate-200 p-2 text-center dark:border-slate-700">
            <QrImage value={`${origin}/mesa/${tb.token}`} alt={`QR ${tb.name}`} className="mx-auto w-full max-w-[180px] rounded bg-white" />
            <p className="mt-1 font-extrabold">{tb.name}</p>
            <button type="button" onClick={() => renew(tb.id)} className={`${ui.btnGhost} mt-1 !px-2 !py-1 text-[11px] print:hidden`}>{t('tq.qrRenew')}</button>
          </div>
        ))}
      </div>
    </Card>
  );
}
