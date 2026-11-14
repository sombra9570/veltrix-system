'use client';
import { useCallback, useEffect, useState } from 'react';
import { rpc } from '../../../../lib/supabase';
import { Card } from '../../shell';
import { ui } from '../../../site-header';
import { useT } from '../../../i18n';
import { useOwner } from '../owner-context';

type Data = { code: string; invited: number; paying: number; months: number; list: { joined: string; paying: boolean; rewarded_at: string | null }[] };

export default function InvitePage() {
  const { t, lang } = useT();
  const { orgId } = useOwner();
  const [d, setD] = useState<Data | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!orgId) return;
    try { setD(await rpc<Data>('my_referrals', { p_org: orgId })); } catch { /* */ }
  }, [orgId]);
  useEffect(() => { load(); }, [load]);

  const link = d ? `https://veltrixsystem.app/registro?ref=${d.code}` : '';
  const message = d ? t('ref.shareText', { link }) : '';

  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { /* */ }
  };
  const share = async () => {
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try { await navigator.share({ title: 'Veltrix', text: message }); return; } catch { /* cancelado */ }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener');
  };

  return (
    <div className="space-y-5">
      <div className="min-w-0">
        <h1 className="text-xl font-extrabold sm:text-2xl">🎁 {t('nav.invite')}</h1>
        <p className={`text-sm ${ui.muted}`}>{t('ref.subtitle')}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Card className="space-y-4">
          <ol className="space-y-3">
            {[1, 2, 3].map((i) => (
              <li key={i} className="flex gap-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-blue-600 text-sm font-extrabold text-white">{i}</span>
                <p className="text-sm">{t(`ref.step${i}` as 'ref.step1')}</p>
              </li>
            ))}
          </ol>
          {d && (
            <>
              <div>
                <label className={ui.label}>{t('ref.yourLink')}</label>
                <div className="flex gap-2">
                  <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} className={`${ui.input} min-w-0 font-mono text-xs sm:text-sm`} />
                  <button type="button" onClick={copy} className={`${ui.btnGhost} shrink-0 !px-4`}>{copied ? '✓' : t('ref.copy')}</button>
                </div>
                <p className={`mt-1 text-xs ${ui.muted}`}>{t('ref.code', { code: d.code })}</p>
              </div>
              <button type="button" onClick={share} className={`${ui.btnPrimary} w-full py-3 text-base`}>📲 {t('ref.share')}</button>
            </>
          )}
        </Card>

        <Card>
          <div className="grid grid-cols-3 gap-3 text-center">
            {[
              [t('ref.invited'), d?.invited ?? 0],
              [t('ref.paying'), d?.paying ?? 0],
              [t('ref.months'), d?.months ?? 0],
            ].map(([label, n], i) => (
              <div key={i} className="rounded-xl bg-slate-100 p-3 dark:bg-slate-800">
                <p className="text-2xl font-extrabold">{n}</p>
                <p className={`text-xs ${ui.muted}`}>{label}</p>
              </div>
            ))}
          </div>
          <h2 className="mb-2 mt-5 text-sm font-bold">{t('ref.history')}</h2>
          {!d || d.list.length === 0 ? (
            <p className={`text-sm ${ui.muted}`}>{t('ref.empty')}</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {d.list.map((r, i) => (
                <li key={i} className="flex items-center justify-between gap-3">
                  <span>{t('ref.business', { n: d.list.length - i })} · {new Date(r.joined).toLocaleDateString(lang)}</span>
                  <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${r.paying ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}>
                    {r.paying ? t('ref.earned') : t('ref.trying')}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className={`mt-4 text-xs ${ui.muted}`}>{t('ref.rules')}</p>
        </Card>
      </div>
    </div>
  );
}
