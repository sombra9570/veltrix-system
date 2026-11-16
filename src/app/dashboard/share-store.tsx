'use client';
import { useState } from 'react';
import { rpc } from '../../lib/supabase';
import { ui } from '../site-header';
import { useT } from '../i18n';

type Share = { slug: string; name: string; description: string | null; whatsapp: string | null } | null;

/** Quien vende comparte el catálogo de la tienda virtual (enlace o WhatsApp) */
export function ShareStoreButton({ branchId }: { branchId: string }) {
  const { t } = useT();
  const [state, setState] = useState<'idle' | 'loading' | 'none' | 'ready'>('idle');
  const [share, setShare] = useState<Share>(null);
  const [copied, setCopied] = useState(false);

  const open = async () => {
    if (state === 'ready' || state === 'none') { setState('idle'); return; }
    setState('loading');
    try {
      const s = await rpc<Share>('store_share', { p_branch: branchId });
      setShare(s);
      setState(s ? 'ready' : 'none');
    } catch { setState('none'); }
  };
  const url = share ? `${typeof window !== 'undefined' ? window.location.origin : ''}/tienda/${share.slug}` : '';
  const text = share ? t('sh.message', { name: share.name, url }) : '';
  const copy = async () => { try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { /* sin permiso */ } };

  return (
    <div className="space-y-2">
      <button type="button" onClick={open} disabled={state === 'loading'} className={`${ui.btnGhost} !py-2 text-sm`}>📣 {t('sh.share')}</button>
      {state === 'none' && <p className={`text-xs ${ui.muted}`}>{t('sh.none')}</p>}
      {state === 'ready' && share && (
        <div className="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
          <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className={`${ui.input} !py-2 text-xs`} aria-label={t('sh.link')} />
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener')} className={`${ui.btnPrimary} !py-2 text-sm`}>💬 {t('sh.whatsapp')}</button>
            <button type="button" onClick={copy} className={`${ui.btnGhost} !py-2 text-sm`}>{copied ? `✓ ${t('sh.copied')}` : `📋 ${t('sh.copy')}`}</button>
          </div>
        </div>
      )}
    </div>
  );
}
