'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { rpc } from '../../lib/supabase';
import { Card } from './shell';
import { ui } from '../site-header';
import { useT } from '../i18n';
import { useLive } from './live';
import { useLanguage } from '../language-selector';
import { usePush } from '../push-client';

type Alert = { eligible: boolean; pending: number; assigned: number; waiting: number; total: number };

/** Pedidos de la tienda pendientes de atender (nuevos, delegados a mí o con mensaje del cliente). Se actualiza por aviso en vivo. */
function useStoreOrdersAlert() {
  const { t } = useT();
  const [a, setA] = useState<Alert | null>(null);
  const last = useRef<number | null>(null);
  const load = useCallback(async () => {
    try {
      const d = await rpc<Alert>('my_store_orders_alert');
      if (!d) return;
      // Aviso del navegador y sonido corto cuando llega algo nuevo con la pantalla abierta
      if (last.current !== null && d.total > last.current) {
        try {
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') new Notification(`🧾 ${t('so.title')}`, { body: t('sa.pending', { n: d.total }), tag: 'store-orders' });
          const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
          const o = ctx.createOscillator(); const g = ctx.createGain();
          o.connect(g); g.connect(ctx.destination); o.frequency.value = 880; g.gain.value = 0.05; o.start(); o.stop(ctx.currentTime + 0.25);
        } catch { /* sin audio o permiso */ }
      }
      last.current = d.total;
      setA(d);
    } catch { /* sin conexión */ }
  }, [t]);
  useEffect(() => { void load(); }, [load]);
  useLive('delivery', load);
  return a;
}

const storeHref = (path: string) => `${path.split('/').slice(0, 3).join('/')}/tienda`;

/** Campana de la barra superior: solo aparece a quien tiene acceso a los pedidos de la tienda. */
export function StoreOrdersBell() {
  const { t } = useT();
  const a = useStoreOrdersAlert();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [perm, setPerm] = useState<NotificationPermission | 'none'>('none');
  useEffect(() => { if (typeof Notification !== 'undefined') setPerm(Notification.permission); }, []);
  const { lang } = useLanguage();
  const push = usePush(lang);
  const ios = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (!a?.eligible) return null;
  const href = storeHref(path);
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label={t('so.title')}
        className="relative grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-slate-300 text-lg cursor-pointer dark:border-slate-700">
        🔔
        {a.total > 0 && <span className="absolute -end-1.5 -top-1.5 min-w-5 rounded-full bg-red-600 px-1.5 text-center text-[11px] font-bold text-white">{a.total > 99 ? '99+' : a.total}</span>}
      </button>
      {open && (
        <div className="absolute end-0 z-50 mt-2 w-[min(20rem,calc(100vw-2rem))] space-y-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
          <p className="text-sm font-extrabold">🧾 {t('so.title')}</p>
          {a.total === 0 && <p className={`text-sm ${ui.muted}`}>{t('sa.none')}</p>}
          {a.pending > 0 && <p className="text-sm font-semibold">🆕 {t('sa.pending', { n: a.pending })}</p>}
          {a.assigned > 0 && <p className="text-sm font-semibold">👷 {t('sa.assigned', { n: a.assigned })}</p>}
          {a.waiting > 0 && <p className="text-sm font-semibold">💬 {t('sa.waiting', { n: a.waiting })}</p>}
          <Link href={href} onClick={() => setOpen(false)} className={`${ui.btnPrimary} w-full`}>{t('sa.view')}</Link>
          {push.state === 'off' && <button type="button" disabled={push.busy} onClick={() => void push.enable()} className={`${ui.btnGhost} w-full text-xs`}>📲 {t('sa.pushOff')}</button>}
          {push.state === 'on' && <button type="button" disabled={push.busy} onClick={() => void push.disable()} className={`${ui.btnGhost} w-full text-xs`}>✅ {t('sa.pushOn')}</button>}
          {push.state === 'denied' && <p className={`text-xs ${ui.muted}`}>{t('sa.pushDenied')}</p>}
          {push.state === 'unsupported' && ios && <p className={`text-xs ${ui.muted}`}>{t('sa.pushIos')}</p>}
          {(push.state === 'unsupported' || push.state === 'unconfigured') && perm !== 'granted' && perm !== 'none' && perm !== 'denied' && (
            <button type="button" onClick={async () => { try { setPerm(await Notification.requestPermission()); } catch { /* */ } }} className={`${ui.btnGhost} w-full text-xs`}>🔔 {t('sa.enable')}</button>
          )}
        </div>
      )}
    </div>
  );
}

/** Aviso destacado en el panel principal cuando hay pedidos esperando. */
export function StoreOrdersBanner() {
  const { t } = useT();
  const a = useStoreOrdersAlert();
  const path = usePathname();
  if (!a?.eligible || a.total === 0) return null;
  return (
    <Card className="flex flex-wrap items-center gap-3 border-2 !border-amber-400">
      <span className="text-3xl">🧾</span>
      <div className="min-w-0 flex-1">
        <p className="font-extrabold">{t('sa.banner', { n: a.total })}</p>
        <p className={`text-xs ${ui.muted}`}>
          {[a.pending > 0 ? t('sa.pending', { n: a.pending }) : '', a.assigned > 0 ? t('sa.assigned', { n: a.assigned }) : '', a.waiting > 0 ? t('sa.waiting', { n: a.waiting }) : ''].filter(Boolean).join(' · ')}
        </p>
      </div>
      <Link href={storeHref(path)} className={ui.btnPrimary}>{t('sa.view')}</Link>
    </Card>
  );
}
