'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { rpc } from '../../../lib/supabase';
import { useLiveTopic } from '../live';
import { BellPanel } from '../bell-panel';

type Ev = { id: string; created_at: string; kind: 'lead' | 'company' | 'support_msg'; ref_id: string | null; title: string; detail: string | null; read_at: string | null };
type Inbox = { unread: number; items: Ev[] };

const KIND = {
  lead: { icon: '🆘', label: 'Pide ayuda', href: '/dashboard/admin/soporte?tab=leads' },
  company: { icon: '🏢', label: 'Empresa nueva', href: '/dashboard/admin' },
  support_msg: { icon: '💬', label: 'Mensaje de un cliente', href: '/dashboard/admin/soporte' },
} as const;

const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 1) return 'ahora';
  if (m < 60) return `hace ${m} min`;
  if (m < 1440) return `hace ${Math.round(m / 60)} h`;
  return `hace ${Math.round(m / 1440)} d`;
};

/** Campanita del equipo de la plataforma: solicitudes de ayuda, empresas nuevas y mensajes de clientes.
 *  Se actualiza por aviso en vivo (sin consultar por reloj). */
export function PlatformBell() {
  const [inbox, setInbox] = useState<Inbox>({ unread: 0, items: [] });
  const [open, setOpen] = useState(false);
  const [perm, setPerm] = useState<NotificationPermission | 'none'>('none');
  const known = useRef<Set<string> | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await rpc<Inbox>('platform_events_list');
      const next = d ?? { unread: 0, items: [] };
      // Aviso del navegador para lo que llegó mientras la pantalla está abierta
      if (known.current && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        for (const e of next.items) {
          if (!e.read_at && !known.current.has(e.id)) {
            try { new Notification(`${KIND[e.kind].icon} ${KIND[e.kind].label}`, { body: e.title + (e.detail ? ` · ${e.detail}` : ''), tag: e.id }); } catch { /* */ }
          }
        }
      }
      known.current = new Set(next.items.map((e) => e.id));
      setInbox(next);
    } catch { /* sin conexión: queda lo último */ }
  }, []);

  useEffect(() => { void load(); if (typeof Notification !== 'undefined') setPerm(Notification.permission); }, [load]);
  useLiveTopic('plat:inbox', load);

  const askPerm = async () => { try { setPerm(await Notification.requestPermission()); } catch { /* */ } };
  const readAll = async () => { try { await rpc('platform_events_read'); } catch { /* */ } void load(); };
  const readOne = async (id: string) => { try { await rpc('platform_events_read', { p_id: id }); } catch { /* */ } void load(); };

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label="Avisos"
        className="relative rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
        🔔
        {inbox.unread > 0 && <span className="absolute -right-1.5 -top-1.5 min-w-5 rounded-full bg-red-600 px-1.5 text-center text-[11px] font-bold text-white">{inbox.unread > 99 ? '99+' : inbox.unread}</span>}
      </button>
      <BellPanel open={open} onClose={() => setOpen(false)} className="border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
        <div>
          <div className="flex items-center justify-between">
            <p className="text-sm font-extrabold">Avisos</p>
            {inbox.unread > 0 && <button type="button" onClick={readAll} className="text-xs font-semibold text-sky-400 cursor-pointer">Marcar todo como leído</button>}
          </div>
          {perm !== 'granted' && perm !== 'none' && typeof Notification !== 'undefined' && perm !== 'denied' && (
            <button type="button" onClick={askPerm} className="mt-2 w-full rounded-lg bg-sky-600/20 px-3 py-2 text-xs font-semibold text-sky-300 cursor-pointer">🔔 Activar avisos en este navegador</button>
          )}
          <ul className="mt-2 space-y-1.5">
            {inbox.items.length === 0 && <li className="py-6 text-center text-sm text-slate-400">Sin avisos por ahora.</li>}
            {inbox.items.map((e) => (
              <li key={e.id}>
                <Link href={KIND[e.kind].href} onClick={() => { setOpen(false); if (!e.read_at) void readOne(e.id); }}
                  className={`block rounded-xl border px-3 py-2 ${e.read_at ? 'border-slate-200 dark:border-slate-800 opacity-70' : 'border-sky-500/40 bg-sky-500/10'}`}>
                  <p className="text-xs font-bold">{KIND[e.kind].icon} {KIND[e.kind].label} <span className="font-normal text-slate-400">· {ago(e.created_at)}</span></p>
                  <p className="text-sm font-semibold">{e.title}</p>
                  {e.detail && <p className="break-words text-xs text-slate-400">{e.detail}</p>}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </BellPanel>
    </div>
  );
}
