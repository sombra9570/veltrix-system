'use client';
import { useEffect, useRef, useState } from 'react';
import { rpc, supabase } from '../../lib/supabase';

/* ------------------------------------------------------------------
 * Avisos en vivo (sin consultar por reloj).
 *  - La base de datos avisa sola ("hubo un cambio") cuando se guarda algo nuevo.
 *  - La pantalla escucha ese aviso y, solo entonces, vuelve a pedir SUS datos.
 *  - Si nadie cambia nada, no hay ni una lectura.
 * ------------------------------------------------------------------ */

const ORG_KEY = 'vx:org';
let orgPromise: Promise<string | null> | null = null;

/** Empresa de la sesión (se pide una sola vez y se recuerda en el equipo). */
export function useOrgId(): string | null {
  const [org, setOrg] = useState<string | null>(() => {
    try { return localStorage.getItem(ORG_KEY); } catch { return null; }
  });
  useEffect(() => {
    if (org) return;
    orgPromise ??= rpc<string | null>('chat_org').then((o) => {
      if (o) { try { localStorage.setItem(ORG_KEY, o); } catch { /* */ } }
      return o ?? null;
    }).catch(() => null);
    let alive = true;
    orgPromise.then((o) => { if (alive && o) setOrg(o); });
    return () => { alive = false; };
  }, [org]);
  return org;
}

/** Escucha un tema y llama a `onPing` (junta avisos seguidos en uno solo). */
export function useLiveTopic(topic: string | null, onPing: () => void, enabled = true) {
  const ref = useRef(onPing);
  ref.current = onPing;
  useEffect(() => {
    if (!topic || !enabled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let dirty = false;
    const fire = () => {
      if (document.visibilityState !== 'visible') { dirty = true; return; }
      dirty = false;
      clearTimeout(timer);
      timer = setTimeout(() => ref.current(), 700 + Math.random() * 500);
    };
    // Si hubo avisos con la pantalla oculta, al volver se pide una sola vez
    const vis = () => { if (document.visibilityState === 'visible' && dirty) fire(); };
    const ch = supabase.channel(topic).on('broadcast', { event: 'ping' }, fire).subscribe();
    document.addEventListener('visibilitychange', vis);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', vis);
      void supabase.removeChannel(ch);
    };
  }, [topic, enabled]);
}

/** Avisos de la empresa: mesas/cocina ('tables'), 'delivery', 'dispatch', 'approvals', 'chat'. */
export function useLive(kind: 'tables' | 'delivery' | 'dispatch' | 'approvals' | 'chat', onPing: () => void, enabled = true) {
  const org = useOrgId();
  useLiveTopic(org ? `org:${org}:${kind}` : null, onPing, enabled);
}
