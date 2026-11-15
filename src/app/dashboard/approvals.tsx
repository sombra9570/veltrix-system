'use client';
import { useCallback, useEffect, useState } from 'react';
import { rpc } from '../../lib/supabase';
import { Card } from './shell';
import { ui } from '../site-header';
import { useT } from '../i18n';
import { money } from './format';

type Req = { id: string; kind: string; amount: number | null; reason: string; at: string; by: string | null; branch: string; currency: string | null; notes: string | null };

/** Bandeja de aprobaciones para dueño y supervisor (se oculta si no hay pendientes) */
export function ApprovalsTray() {
  const { t, lang } = useT();
  const [rows, setRows] = useState<Req[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(() => {
    rpc<Req[]>('approvals_list').then((r) => setRows(r ?? [])).catch(() => setRows([]));
  }, []);
  useEffect(() => { load(); const id = setInterval(load, 60000); return () => clearInterval(id); }, [load]);

  const decide = async (r: Req, approve: boolean) => {
    const note = approve ? '' : (window.prompt(t('appr.rejectWhy')) ?? '');
    setBusy(r.id); setMsg(null);
    try {
      await rpc('decide_approval', { p_id: r.id, p_approve: approve, p_note: note || null });
      setMsg({ ok: true, text: approve ? t('appr.approved') : t('appr.rejected') });
      load();
    } catch (e) {
      const m = (e as Error).message;
      setMsg({ ok: false, text: m.includes('SALE_HAS_PAYMENTS') ? t('appr.hasPayments') : m.includes('SALE_NOT_CANCELLABLE') ? t('appr.notCancellable') : t('err.generic') });
    } finally { setBusy(null); }
  };

  if (rows.length === 0 && !msg) return null;
  return (
    <Card className="space-y-3 border-amber-300 dark:border-amber-500/40">
      <h2 className="font-bold">✅ {t('appr.title')} {rows.length > 0 && <span className="ms-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">{rows.length}</span>}</h2>
      {msg && <p className={`text-sm font-semibold ${msg.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{msg.text}</p>}
      <ul className="divide-y divide-slate-200 dark:divide-slate-800">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-semibold">🚫 {t('appr.cancelSale')} · {r.amount != null && r.currency ? money(Number(r.amount), r.currency, lang) : ''}</p>
              <p className={`text-xs ${ui.muted}`}>{r.by ?? '—'} · {r.branch} · {new Date(r.at).toLocaleString(lang, { dateStyle: 'short', timeStyle: 'short' })}</p>
              <p className="text-xs">📝 {r.reason}</p>
            </div>
            <div className="flex gap-2">
              <button type="button" disabled={busy === r.id} onClick={() => decide(r, true)} className={`${ui.btnPrimary} !px-3 !py-1.5 text-xs max-sm:flex-1`}>{t('appr.approve')}</button>
              <button type="button" disabled={busy === r.id} onClick={() => decide(r, false)} className={`${ui.btnGhost} !px-3 !py-1.5 text-xs max-sm:flex-1`}>{t('appr.reject')}</button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
