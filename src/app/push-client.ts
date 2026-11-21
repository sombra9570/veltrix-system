'use client';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

/** Avisa al servidor que pasó algo con un pedido; él decide a quién notificar (validado en la base). */
export function pushNotify(request: string, event: 'new' | 'msg' | 'assigned') {
  try {
    void fetch('/api/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ request, event }), keepalive: true }).catch(() => {});
  } catch { /* sin conexión */ }
}

export type PushState = 'loading' | 'unsupported' | 'unconfigured' | 'denied' | 'off' | 'on';

const toKey = (s: string) => {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

/** Activar/desactivar los avisos push de este dispositivo */
export function usePush(lang: string) {
  const [state, setState] = useState<PushState>('loading');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window) || typeof Notification === 'undefined') { setState('unsupported'); return; }
    try {
      const cfg = await fetch('/api/push').then((r) => r.json()) as { enabled: boolean };
      if (!cfg.enabled) { setState('unconfigured'); return; }
      if (Notification.permission === 'denied') { setState('denied'); return; }
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setState(sub && Notification.permission === 'granted' ? 'on' : 'off');
    } catch { setState('unsupported'); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const enable = async () => {
    setBusy(true);
    try {
      const cfg = await fetch('/api/push').then((r) => r.json()) as { enabled: boolean; key?: string };
      if (!cfg.enabled || !cfg.key) { setState('unconfigured'); return; }
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { setState(perm === 'denied' ? 'denied' : 'off'); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(cfg.key) });
      const j = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      const { error } = await supabase.rpc('push_subscribe', { p_endpoint: j.endpoint, p_p256dh: j.keys?.p256dh, p_auth: j.keys?.auth, p_lang: lang });
      setState(error ? 'off' : 'on');
    } catch { setState('off'); }
    finally { setBusy(false); }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) { await supabase.rpc('push_unsubscribe', { p_endpoint: sub.endpoint }); await sub.unsubscribe(); }
      setState('off');
    } catch { /* */ }
    finally { setBusy(false); }
  };

  return { state, busy, enable, disable };
}
