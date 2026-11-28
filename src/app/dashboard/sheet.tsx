'use client';
import { useEffect } from 'react';
import { IconClose } from '../icons';

/** Panel inferior en el celular y ventana centrada en pantallas grandes */
export function Sheet({ onClose, children, label }: { onClose: () => void; children: React.ReactNode; label: string }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = prev; };
  }, [onClose]);

  return (
    <div className="fixed inset-x-0 top-0 z-40 h-dvh" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 max-h-[88dvh] overflow-y-auto overscroll-contain rounded-t-3xl bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[min(40rem,calc(100vw-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl dark:bg-slate-900">
        <div className="mb-2 flex justify-end">
          <button type="button" onClick={onClose} aria-label={label}
            className="grid h-9 w-9 place-items-center rounded-lg border border-slate-300 cursor-pointer dark:border-slate-700"><IconClose /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Selector de sucursal compartido (solo se muestra si hay más de una) */
export type BranchOpt = { id: string; name: string; company: string; currency: string };

/** Fecha local en formato AAAA-MM-DD */
export function isoDay(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
