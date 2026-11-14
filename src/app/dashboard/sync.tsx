'use client';
import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n';

/* ------------------------------------------------------------------
 * Sincronización liviana para todos los paneles:
 *  - Cada pantalla registra su "cargador" una sola vez.
 *  - Se actualiza sola unas 5 veces al día (cada ~4,8 h) y solo con la pantalla visible.
 *  - Al volver la señal, o con el botón ↻, se sincroniza todo, de a uno y con pausas
 *    para no gastar batería ni datos a la vez.
 * ------------------------------------------------------------------ */
export const AUTO_EVERY = Math.round((24 * 60 * 60 * 1000) / 5);

type Loader = () => unknown;
const loaders = new Map<number, { current: Loader }>();
let seq = 0;
let running = false;
let lastSync = Date.now();
const subs = new Set<() => void>();
const notify = () => subs.forEach((f) => f());
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function syncAll() {
  if (running) return;
  running = true; notify();
  try {
    for (const l of [...loaders.values()]) {
      try { await l.current(); } catch { /* sigue con el resto */ }
      await pause(300);
    }
    lastSync = Date.now();
  } finally { running = false; notify(); }
}

if (typeof window !== 'undefined') {
  // Al volver la señal: una sola sincronización, un momento después y escalonada
  window.addEventListener('online', () => { notify(); setTimeout(syncAll, 1500 + Math.random() * 2000); });
  window.addEventListener('offline', notify);
}

/** Registra un cargador. No lo ejecuta al montar (eso lo hace la pantalla); sí ~5 veces al día y al sincronizar. */
export function useSync(load: Loader, every: number = AUTO_EVERY) {
  const ref = useRef<Loader>(load);
  ref.current = load;
  useEffect(() => {
    const id = ++seq;
    loaders.set(id, ref);
    return () => { loaders.delete(id); };
  }, []);
  useEffect(() => {
    let last = Date.now();
    const tick = () => {
      if (document.visibilityState !== 'visible' || !navigator.onLine) return;
      if (Date.now() - last >= every) { last = Date.now(); ref.current(); }
    };
    const iv = setInterval(tick, Math.min(every, 60_000));
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', tick); };
  }, [every]);
}

/** Botón ↻ con estado de conexión y hora de la última sincronización */
export function SyncButton() {
  const { t, lang } = useT();
  const [, force] = useState(0);
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const f = () => { force((x) => x + 1); setOnline(navigator.onLine); };
    f(); subs.add(f);
    return () => { subs.delete(f); };
  }, []);
  const time = new Date(lastSync).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' });
  return (
    <button type="button" onClick={() => syncAll()} disabled={running || !online}
      title={online ? t('sync.last', { time }) : t('sync.offline')}
      className="flex h-10 items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 text-xs font-bold cursor-pointer disabled:opacity-60 dark:border-slate-700">
      <span className={`h-2 w-2 rounded-full ${online ? 'bg-emerald-500' : 'bg-amber-500'}`} />
      <span className={running ? 'animate-spin' : ''}>↻</span>
      <span className="hidden sm:inline">{running ? t('sync.running') : online ? time : t('sync.offlineShort')}</span>
    </button>
  );
}
