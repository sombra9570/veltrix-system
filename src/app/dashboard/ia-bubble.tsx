'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { rpc } from '../../lib/supabase';
import { useT } from '../i18n';
import AiPage from './ia-screen';

// Círculo flotante de Veltrix IA: se arrastra a cualquier lugar, se pega al borde y recuerda dónde quedó.
// Aparece solo para quien tiene el permiso de usar la IA; al tocarlo abre la consulta sin salir de la pantalla.
const SIZE = 56;
const MARGIN = 8;
const KEY = 'veltrix.ia.pos';
type Pos = { x: number; y: number };

const clampPos = (p: Pos): Pos => ({
  x: Math.min(Math.max(MARGIN, p.x), window.innerWidth - SIZE - MARGIN),
  y: Math.min(Math.max(MARGIN, p.y), window.innerHeight - SIZE - MARGIN),
});

export function AiBubble() {
  const { t } = useT();
  const pathname = usePathname();
  const [show, setShow] = useState(false);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Pos | null>(null);
  const drag = useRef<{ sx: number; sy: number; px: number; py: number; moved: boolean } | null>(null);

  useEffect(() => {
    rpc<{ allowed: boolean; reason?: string }>('ai_quota_status')
      .then((r) => setShow(!!r?.allowed || r?.reason === 'AI_ADDON_REQUIRED')).catch(() => setShow(false));
  }, []);

  useEffect(() => {
    let saved: Pos | null = null;
    try { saved = JSON.parse(localStorage.getItem(KEY) ?? 'null'); } catch { /* sin almacenamiento: posición por defecto */ }
    setPos(clampPos(saved ?? { x: window.innerWidth - SIZE - 12, y: window.innerHeight - SIZE - 96 }));
    const onResize = () => setPos((p) => (p ? clampPos(p) : p));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const save = useCallback((p: Pos) => {
    try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* solo comodidad */ }
  }, []);

  if (!show || !pos || pathname.endsWith('/ia')) return null;

  if (open) {
    return (
      <div role="dialog" aria-label="Veltrix IA"
        className="fixed inset-x-2 bottom-2 top-14 z-50 flex flex-col overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 sm:inset-x-auto sm:end-4 sm:bottom-4 sm:top-auto sm:h-[36rem] sm:w-[26rem]">
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-2 dark:border-slate-800">
          <span className="flex items-center gap-2 text-sm font-bold">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/veltrix-ia.png" alt="" width={24} height={24} className="h-6 w-6 rounded-full" />Veltrix IA
          </span>
          <button type="button" onClick={() => setOpen(false)} aria-label={t('pos.close')}
            className="grid h-8 w-8 place-items-center rounded-lg text-lg cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800">✕</button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3"><AiPage /></div>
      </div>
    );
  }

  return (
    <button type="button" aria-label={t('nav.ai')} title={t('nav.ai')}
      style={{ left: pos.x, top: pos.y, width: SIZE, height: SIZE, touchAction: 'none' }}
      className="fixed z-40 select-none overflow-hidden rounded-full border-2 border-blue-500 bg-slate-950 p-0 opacity-90 shadow-lg transition-opacity hover:opacity-100 active:cursor-grabbing cursor-grab"
      onPointerDown={(e) => {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        drag.current = { sx: e.clientX, sy: e.clientY, px: pos.x, py: pos.y, moved: false };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const dx = e.clientX - d.sx; const dy = e.clientY - d.sy;
        if (!d.moved && Math.hypot(dx, dy) < 6) return;
        d.moved = true;
        setPos(clampPos({ x: d.px + dx, y: d.py + dy }));
      }}
      onPointerUp={() => {
        const d = drag.current; drag.current = null;
        if (!d) return;
        if (!d.moved) { setOpen(true); return; }
        // Se pega al borde más cercano para no tapar el contenido
        const snapped = clampPos({ x: pos.x + SIZE / 2 < window.innerWidth / 2 ? MARGIN : window.innerWidth - SIZE - MARGIN, y: pos.y });
        setPos(snapped); save(snapped);
      }}
      onPointerCancel={() => { drag.current = null; }}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(true); } }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/veltrix-ia.png" alt="" width={SIZE} height={SIZE} draggable={false} className="pointer-events-none h-full w-full object-cover" />
    </button>
  );
}
