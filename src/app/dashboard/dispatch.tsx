'use client';
import { useCallback, useEffect, useState } from 'react';
import { rpc } from '../../lib/supabase';
import { Card } from './shell';
import { ui } from '../site-header';
import { useT } from '../i18n';
import { money } from './format';

type MBranch = { id: string; name: string; company: string };
type DOrder = {
  id: string; at: string; total: number; currency: string; customer: string | null; phone: string | null;
  vendor: string; notes: string | null; items: { description: string; qty: number }[];
  delivered_at: string | null; delivered_by: string | null; note: string | null;
};
type Queue = { enabled: boolean; manager: boolean; orders: DOrder[] };

const okBox = 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300';
const errBox = 'border-red-300 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400';

/** Despacho: ventas cobradas que el almacenero tiene que entregar. Lo usan el almacenero y el administrador. */
export function DispatchScreen() {
  const { t, lang } = useT();
  const [branches, setBranches] = useState<MBranch[] | null>(null);
  const [branchId, setBranchId] = useState('');
  const [done, setDone] = useState(false);
  const [q, setQ] = useState<Queue | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const flash = (ok: boolean, text: string) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 5000); };

  useEffect(() => {
    rpc<MBranch[]>('manager_branches').then((b) => { setBranches(b ?? []); if (b?.length) setBranchId(b[0].id); }).catch(() => setBranches([]));
  }, []);

  const load = useCallback(async () => {
    if (!branchId) return;
    try { setQ(await rpc<Queue>('dispatch_queue', { p_branch: branchId, p_done: done })); }
    catch { setQ({ enabled: false, manager: false, orders: [] }); flash(false, t('err.generic')); }
  }, [branchId, done, t]);
  useEffect(() => { load(); }, [load]);
  // Se actualiza sola cada 30 s mientras está abierta (las ventas nuevas aparecen sin recargar)
  useEffect(() => {
    if (done) return;
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load, done]);

  const toggle = async (on: boolean) => {
    setBusy('toggle');
    try { await rpc('dispatch_set', { p_branch: branchId, p_on: on }); await load(); }
    catch { flash(false, t('err.permDenied')); } finally { setBusy(null); }
  };
  const mark = async (o: DOrder) => {
    setBusy(o.id);
    try { await rpc('dispatch_mark', { p_order: o.id, p_note: null }); flash(true, t('dsp.marked')); await load(); }
    catch { flash(false, t('err.generic')); } finally { setBusy(null); }
  };

  const when = (s: string) => new Date(s).toLocaleString(lang, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  const qty = (n: number) => Number(n).toLocaleString(lang, { maximumFractionDigits: 3 });

  if (branches === null) return <p className={`text-sm ${ui.muted}`}>{t('common.wait')}</p>;
  if (branches.length === 0) return <Card><p className={`text-sm ${ui.muted}`}>{t('pos.noBranches')}</p></Card>;

  return (
    <div className="space-y-5">
      <div className="min-w-0">
        <h1 className="text-xl font-extrabold sm:text-2xl">🚚 {t('nav.dispatch')}</h1>
        <p className={`text-sm ${ui.muted}`}>{t('dsp.subtitle')}</p>
      </div>

      {msg && <p className={`rounded-xl border p-3 text-sm font-semibold ${msg.ok ? okBox : errBox}`}>{msg.text}</p>}

      {branches.length > 1 && (
        <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={ui.input} aria-label={t('pos.branch')}>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.name} · {b.company}</option>)}
        </select>
      )}

      {q && !q.enabled ? (
        <Card className="space-y-3">
          <p className="font-bold">{t('dsp.offTitle')}</p>
          <p className={`text-sm ${ui.muted}`}>{t('dsp.offHint')}</p>
          {q.manager
            ? <button type="button" disabled={busy !== null} onClick={() => toggle(true)} className={`${ui.btnPrimary} w-full`}>{t('dsp.turnOn')}</button>
            : <p className={`text-sm ${ui.muted}`}>{t('dsp.askAdmin')}</p>}
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            {([false, true] as const).map((v) => (
              <button key={String(v)} type="button" onClick={() => { setQ(null); setDone(v); }}
                className={`rounded-xl px-3 py-2 text-sm font-semibold cursor-pointer ${done === v ? 'bg-blue-600 text-white' : 'border border-slate-300 dark:border-slate-700'}`}>
                {v ? `✅ ${t('dsp.done')}` : `📦 ${t('dsp.pending')}${!done && q ? ` · ${q.orders.length}` : ''}`}
              </button>
            ))}
          </div>

          {!q ? <p className={`text-sm ${ui.muted}`}>{t('common.wait')}</p>
            : q.orders.length === 0 ? <Card><p className={`text-sm ${ui.muted}`}>{done ? t('dsp.noneDone') : t('dsp.none')}</p></Card>
            : (
              <ul className="space-y-3">
                {q.orders.map((o) => (
                  <li key={o.id}>
                    <Card className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-bold">#{o.id.slice(0, 8).toUpperCase()} · {o.customer ?? t('dsp.walkIn')}</p>
                          <p className={`text-xs ${ui.muted}`}>{when(o.at)}{o.vendor ? ` · ${t('rc.vendor')}: ${o.vendor}` : ''}</p>
                        </div>
                        <p className="shrink-0 font-bold">{money(Number(o.total), o.currency, lang)}</p>
                      </div>
                      <ul className="rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/50">
                        {o.items.map((i, k) => <li key={k}><b>{qty(i.qty)}</b> × {i.description}</li>)}
                      </ul>
                      {o.notes && <p className="text-xs">📝 {o.notes}</p>}
                      {o.delivered_at ? (
                        <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                          ✅ {t('dsp.deliveredAt', { date: when(o.delivered_at) })}{o.delivered_by ? ` · ${o.delivered_by}` : ''}
                        </p>
                      ) : (
                        <div className="flex gap-2">
                          {o.phone && <a href={`https://wa.me/${o.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className={`${ui.btnGhost} !px-3`}>💬</a>}
                          <button type="button" disabled={busy !== null} onClick={() => mark(o)} className={`${ui.btnPrimary} flex-1`}>
                            {busy === o.id ? t('common.wait') : `✅ ${t('dsp.mark')}`}
                          </button>
                        </div>
                      )}
                    </Card>
                  </li>
                ))}
              </ul>
            )}

          {q?.manager && (
            <button type="button" disabled={busy !== null} onClick={() => toggle(false)} className={`text-xs ${ui.muted} underline cursor-pointer`}>{t('dsp.turnOff')}</button>
          )}
        </>
      )}
    </div>
  );
}
